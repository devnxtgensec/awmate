import { afterEach, describe, expect, test } from "bun:test"
import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import { startRelayProxy, stopRelayProxy } from "./awmate-relay-proxy"

const servers: Array<ReturnType<typeof createServer>> = []

function upstream(handler: (request: IncomingMessage, response: ServerResponse) => void) {
  const server = createServer(handler)
  servers.push(server)

  return new Promise<string>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address()

      // SAFETY: Node's server.address() returns a string only for a Unix socket; this server binds TCP.
      // oxlint-disable-next-line anti-slop/no-runtime-typeof -- see SAFETY above
      if (!address || typeof address === "string") throw new Error("Mock upstream did not bind a port")
      resolve(`http://127.0.0.1:${address.port}`)
    })
  })
}

function start(aws: string, cloudflare: string) {
  process.env.AWMATE_RELAY_AWS_BASE = aws
  process.env.AWMATE_RELAY_CLOUDFLARE_BASE = cloudflare

  return startRelayProxy()
}

afterEach(() => {
  stopRelayProxy()
  delete process.env.AWMATE_RELAY_AWS_BASE
  delete process.env.AWMATE_RELAY_CLOUDFLARE_BASE

  for (const server of servers.splice(0)) {
    server.closeAllConnections()
    server.close()
  }
})

describe("awmate relay proxy", () => {
  test("forwards the /v1 path unchanged to AWS", async () => {
    let seen: string | undefined

    const aws = await upstream((request, response) => {
      seen = request.url
      response.writeHead(200, { "Content-Type": "application/json" })
      response.end(JSON.stringify({ object: "list", data: [] }))
    })

    const cloudflare = await upstream((_request, response) => {
      response.writeHead(500)
      response.end()
    })

    const baseURL = await start(aws, cloudflare)
    const response = await fetch(`${baseURL}/models`)
    expect(response.status).toBe(200)
    expect(seen).toBe("/v1/models")
  })

  test("falls back to Cloudflare when AWS returns a server error", async () => {
    let cloudflarePath: string | undefined

    const aws = await upstream((_request, response) => {
      response.writeHead(503, { "Content-Type": "application/json" })
      response.end(JSON.stringify({ error: "unavailable" }))
    })

    const cloudflare = await upstream((request, response) => {
      cloudflarePath = request.url
      response.writeHead(200, { "Content-Type": "application/json" })
      response.end(JSON.stringify({ object: "list", data: [] }))
    })

    const baseURL = await start(aws, cloudflare)
    const response = await fetch(`${baseURL}/models`)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ object: "list", data: [] })
    expect(cloudflarePath).toBe("/v1/models")
  })

  test("passes a client error through without falling back", async () => {
    let cloudflareHits = 0

    const aws = await upstream((_request, response) => {
      response.writeHead(400, { "Content-Type": "application/json" })
      response.end(JSON.stringify({ error: "bad request" }))
    })

    const cloudflare = await upstream((_request, response) => {
      cloudflareHits++
      response.writeHead(200)
      response.end("{}")
    })

    const baseURL = await start(aws, cloudflare)
    const response = await fetch(`${baseURL}/chat/completions`, { method: "POST", body: "{}" })
    expect(response.status).toBe(400)
    expect(cloudflareHits).toBe(0)
  })

  test("falls back when AWS is unreachable", async () => {
    const cloudflare = await upstream((_request, response) => {
      response.writeHead(200, { "Content-Type": "text/plain" })
      response.end("ok")
    })

    const baseURL = await start("http://127.0.0.1:1", cloudflare)
    const response = await fetch(`${baseURL}/models`)
    expect(response.status).toBe(200)
    expect(await response.text()).toBe("ok")
  })

  test("streams the upstream body", async () => {
    const aws = await upstream((_request, response) => {
      response.writeHead(200, { "Content-Type": "text/event-stream" })
      response.write('data: {"choices":[{"delta":{"content":"hi"}}]}\n\n')
      response.end("data: [DONE]\n\n")
    })

    const cloudflare = await upstream((_request, response) => {
      response.writeHead(500)
      response.end()
    })

    const baseURL = await start(aws, cloudflare)
    const response = await fetch(`${baseURL}/chat/completions`, { method: "POST", body: "{}" })
    expect(response.status).toBe(200)
    expect(await response.text()).toBe('data: {"choices":[{"delta":{"content":"hi"}}]}\n\ndata: [DONE]\n\n')
  })

  test("forwards authorization and asks for an uncompressed stream", async () => {
    let headers: IncomingMessage["headers"] = {}

    const aws = await upstream((request, response) => {
      headers = request.headers
      response.writeHead(200, { "Content-Type": "text/event-stream" })
      response.end("data: [DONE]\n\n")
    })

    const cloudflare = await upstream((_request, response) => {
      response.writeHead(500)
      response.end()
    })

    const baseURL = await start(aws, cloudflare)
    await fetch(`${baseURL}/chat/completions`, {
      method: "POST",
      headers: { Authorization: "Bearer session-token", "Content-Type": "application/json" },
      body: "{}",
    })
    expect(headers.authorization).toBe("Bearer session-token")
    expect(headers["accept-encoding"]).toBe("identity")
  })

  test("returns the upstream server error when both gateways fail", async () => {
    const aws = await upstream((_request, response) => {
      response.writeHead(503, { "Content-Type": "application/json" })
      response.end(JSON.stringify({ error: "aws down" }))
    })

    const cloudflare = await upstream((_request, response) => {
      response.writeHead(502, { "Content-Type": "application/json" })
      response.end(JSON.stringify({ error: "cloudflare down" }))
    })

    const baseURL = await start(aws, cloudflare)
    const response = await fetch(`${baseURL}/models`)
    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({ error: "cloudflare down" })
  })

  test("tries AWS again when Cloudflare is preferred but failing", async () => {
    let awsHits = 0

    const aws = await upstream((_request, response) => {
      awsHits++

      if (awsHits <= 2) {
        response.writeHead(503)
        response.end()

        return
      }

      response.writeHead(200, { "Content-Type": "application/json" })
      response.end(JSON.stringify({ object: "list", data: [] }))
    })

    const cloudflare = await upstream((_request, response) => {
      response.writeHead(503)
      response.end()
    })

    const baseURL = await start(aws, cloudflare)
    await fetch(`${baseURL}/models`)
    await fetch(`${baseURL}/models`)
    // AWS is now unhealthy, so Cloudflare is tried first. It fails, and the
    // proxy must still reach AWS instead of returning Cloudflare's error.
    const response = await fetch(`${baseURL}/models`)
    expect(response.status).toBe(200)
    expect(awsHits).toBe(3)
  })

  test("aborts the upstream when the client disconnects", async () => {
    let upstreamClosed = false

    const aws = await upstream((_request, response) => {
      response.on("close", () => {
        upstreamClosed = true
      })
      // Never respond; the client abort must close this connection.
    })

    const cloudflare = await upstream((_request, response) => {
      response.writeHead(500)
      response.end()
    })

    const baseURL = await start(aws, cloudflare)
    const controller = new AbortController()
    const pending = fetch(`${baseURL}/models`, { signal: controller.signal }).catch(() => undefined)
    await new Promise((resolve) => setTimeout(resolve, 50))
    controller.abort()
    await pending
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(upstreamClosed).toBe(true)
  })

  test("does not retry after the response has started", async () => {
    let cloudflareHits = 0

    const aws = await upstream((_request, response) => {
      response.writeHead(200, { "Content-Type": "text/event-stream" })
      response.write('data: {"choices":[{"delta":{"content":"hi"}}]}\n\n')
      // Drop the connection mid-stream.
      setTimeout(() => response.destroy(), 10)
    })

    const cloudflare = await upstream((_request, response) => {
      cloudflareHits++
      response.writeHead(200)
      response.end("data: [DONE]\n\n")
    })

    const baseURL = await start(aws, cloudflare)
    const response = await fetch(`${baseURL}/chat/completions`, { method: "POST", body: "{}" })
    expect(response.status).toBe(200)
    await response.text().catch(() => undefined)
    expect(cloudflareHits).toBe(0)
  })

  test("prefers Cloudflare after repeated AWS failures", async () => {
    let awsHits = 0

    const aws = await upstream((_request, response) => {
      awsHits++
      response.writeHead(503)
      response.end()
    })

    const cloudflare = await upstream((_request, response) => {
      response.writeHead(200)
      response.end("ok")
    })

    const baseURL = await start(aws, cloudflare)
    await fetch(`${baseURL}/models`)
    await fetch(`${baseURL}/models`)
    expect(awsHits).toBe(2)
    await fetch(`${baseURL}/models`)
    expect(awsHits).toBe(2)
  })
})
