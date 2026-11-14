import { createServer, type IncomingMessage, type ServerResponse } from "node:http"

// The desktop points the AWMate provider at this local proxy when the account is
// opted in to the AWS relay. The proxy tries AWS first and falls back to the
// Cloudflare gateway when AWS is unreachable or returns a server error before a
// response body is committed.
// The provider baseURL is `http://127.0.0.1:<port>/v1`, so requests arrive with
// a `/v1/...` path that is appended to these prefixes.
const AWS_BASE = "https://gateway.nxtgensec.org/awmate"

const CLOUDFLARE_BASE = "https://awmate.nxtgensec.org/api/gateway"

const FAILURE_THRESHOLD = 2

const COOLDOWN_MS = 60_000

type Upstream = "aws" | "cloudflare"

type Upstreams = Record<Upstream, string>

let server: ReturnType<typeof createServer> | undefined

let baseURL: string | undefined

let upstreams: Upstreams = { aws: AWS_BASE, cloudflare: CLOUDFLARE_BASE }

let failures = 0

let unhealthyUntil = 0

export async function startRelayProxy() {
  if (server) return baseURL!
  // Local and staging runs can point the proxy at a different relay or gateway.
  upstreams = {
    aws: process.env.AWMATE_RELAY_AWS_BASE ?? AWS_BASE,
    cloudflare: process.env.AWMATE_RELAY_CLOUDFLARE_BASE ?? CLOUDFLARE_BASE,
  }

  const created = createServer((request, response) => {
    handle(request, response).catch((error) => {
      console.warn("[awmate-relay] request failed", error)

      if (response.headersSent || response.destroyed) return
      response.writeHead(502, { "Content-Type": "application/json", "Cache-Control": "no-store" })
      response.end(JSON.stringify({ error: { message: "AWMate gateway is unreachable", type: "server_error" } }))
    })
  })

  await new Promise<void>((resolve, reject) => {
    created.once("error", reject)
    created.listen(0, "127.0.0.1", () => resolve())
  })
  const address = created.address()

  // SAFETY: Node's server.address() returns a string only for a Unix socket; this server binds TCP.
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- see SAFETY above
  if (!address || typeof address === "string") {
    created.close()
    throw new Error("AWMate relay proxy did not bind a port")
  }

  server = created
  baseURL = `http://127.0.0.1:${address.port}/v1`

  return baseURL
}

export function stopRelayProxy() {
  const current = server
  server = undefined
  baseURL = undefined
  upstreams = { aws: AWS_BASE, cloudflare: CLOUDFLARE_BASE }
  failures = 0
  unhealthyUntil = 0
  current?.closeAllConnections()
  current?.close()
}

async function handle(request: IncomingMessage, response: ServerResponse) {
  const controller = new AbortController()
  // Abort the upstream only when the client goes away before we finish writing.
  response.once("close", () => {
    if (!response.writableEnded) controller.abort()
  })
  const body = await readBody(request).catch(() => undefined)

  if (body === undefined || controller.signal.aborted) return
  const path = request.url ?? "/"
  const headers = forwardHeaders(request.headers)
  let lastError: Error | undefined
  let lastResponse: Response | undefined

  for (const upstream of order()) {
    if (controller.signal.aborted) return

    try {
      const result = await fetch(`${base(upstream)}${path}`, {
        method: request.method,
        headers,
        body: body.length ? body : undefined,
        redirect: "manual",
        signal: controller.signal,
      })

      // A server error before the stream starts is safe to retry on the other
      // upstream. A client error is the account's answer and must pass through.
      if (result.status >= 500) {
        lastError = new Error(`${upstream} returned ${result.status}`)
        lastResponse = result

        if (upstream === "aws") recordFailure()
        continue
      }

      if (upstream === "aws") recordSuccess()
      await pipe(result, response)

      return
    } catch (error) {
      if (controller.signal.aborted) return

      // Once the response has started, a retry would write a second set of
      // headers. Close the connection so the client sees a truncated stream.
      if (response.headersSent) {
        response.destroy()

        return
      }

      lastError = error instanceof Error ? error : new Error(String(error))

      if (upstream === "aws") recordFailure()
    }
  }

  if (controller.signal.aborted) return

  // Both upstreams failed. Prefer the last real server response over a synthetic 502.
  if (lastResponse) {
    await pipe(lastResponse, response)

    return
  }

  console.warn("[awmate-relay] both gateways failed", lastError)

  if (response.headersSent || response.destroyed) return
  response.writeHead(502, { "Content-Type": "application/json", "Cache-Control": "no-store" })
  response.end(JSON.stringify({ error: { message: "AWMate gateway is unreachable", type: "server_error" } }))
}

function order(): Upstream[] {
  if (Date.now() < unhealthyUntil) return ["cloudflare", "aws"]

  return ["aws", "cloudflare"]
}

function base(upstream: Upstream) {
  return upstreams[upstream]
}

function recordFailure() {
  failures++

  if (failures < FAILURE_THRESHOLD) return
  unhealthyUntil = Date.now() + COOLDOWN_MS
  failures = 0
  console.warn("[awmate-relay] AWS relay marked unhealthy; using Cloudflare for a minute")
}

function recordSuccess() {
  failures = 0
  unhealthyUntil = 0
}

async function readBody(request: IncomingMessage) {
  const chunks: Buffer[] = []

  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))

  return Buffer.concat(chunks)
}

function forwardHeaders(headers: IncomingMessage["headers"]) {
  const forwarded: Record<string, string> = {}

  for (const [name, value] of Object.entries(headers)) {
    if (value === undefined) continue

    // Let fetch choose framing; compressed SSE can buffer before the first token.
    if (["host", "connection", "content-length", "transfer-encoding"].includes(name)) continue
    forwarded[name] = Array.isArray(value) ? value.join(", ") : value
  }

  forwarded["accept-encoding"] = "identity"

  return forwarded
}

async function pipe(result: Response, response: ServerResponse) {
  if (response.destroyed) {
    await result.body?.cancel().catch(() => undefined)

    return
  }

  const headers: Record<string, string> = {}
  result.headers.forEach((value, name) => {
    if (["content-encoding", "content-length", "transfer-encoding", "connection"].includes(name)) return
    headers[name] = value
  })
  response.writeHead(result.status, headers)

  if (!result.body) {
    response.end()

    return
  }

  for await (const chunk of result.body) {
    if (response.destroyed) {
      await result.body.cancel().catch(() => undefined)

      return
    }

    if (!response.write(chunk)) {
      await new Promise<void>((resolve) => {
        response.once("drain", resolve)
        response.once("close", resolve)
      })
    }
  }

  if (!response.destroyed) response.end()
}
