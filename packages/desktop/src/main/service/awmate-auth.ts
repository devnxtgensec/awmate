import { app, safeStorage } from "electron"
import { readFile, rm, writeFile } from "node:fs/promises"
import path from "node:path"

const platformURL = "https://awmate.nxtgensec.org"
const tokenPath = () => path.join(app.getPath("userData"), "awmate-account.bin")

export type Account = { email: string; name: string; gatewayEnabled: boolean; models: string[] }

async function token() {
  if (!safeStorage.isEncryptionAvailable()) throw new Error("OS secure storage is unavailable")
  try {
    return safeStorage.decryptString(await readFile(tokenPath()))
  } catch {
    return undefined
  }
}

export async function status() {
  const current = await token()
  if (!current) return null
  const response = await fetch(`${platformURL}/api/auth/desktop/session`, {
    headers: { Authorization: `Bearer ${current}` },
    signal: AbortSignal.timeout(10_000),
  })
  if (response.status === 401) {
    await rm(tokenPath(), { force: true })
    return null
  }
  if (!response.ok) throw new Error("Could not check the AWMate account")
  const result = (await response.json()) as { account: Account }
  return result.account
}

export async function prepareGateway() {
  if (process.env.AWMATE_DESKTOP_GATEWAY_CONFIG === "1") {
    delete process.env.OPENCODE_CONFIG_CONTENT
    delete process.env.AWMATE_GATEWAY_SESSION
    delete process.env.AWMATE_DESKTOP_GATEWAY_CONFIG
  }
  const current = await token()
  if (!current || process.env.OPENCODE_CONFIG_CONTENT) return
  const response = await fetch(`${platformURL}/api/auth/desktop/session`, {
    headers: { Authorization: `Bearer ${current}` },
    signal: AbortSignal.timeout(10_000),
  }).catch(() => undefined)
  if (!response?.ok) return
  const result = (await response.json()) as { account: Account }
  if (!result.account.gatewayEnabled || result.account.models.length === 0) return
  process.env.AWMATE_GATEWAY_SESSION = current
  process.env.OPENCODE_CONFIG_CONTENT = JSON.stringify({
    providers: {
      awmate: {
        name: "AWMate",
        package: "@ai-sdk/openai-compatible",
        env: ["AWMATE_GATEWAY_SESSION"],
        settings: {
          baseURL: `${platformURL}/api/gateway/v1`,
          apiKey: "{env:AWMATE_GATEWAY_SESSION}",
        },
        models: Object.fromEntries(result.account.models.map((id) => [id, { modelID: id, name: id }])),
      },
    },
  })
  process.env.AWMATE_DESKTOP_GATEWAY_CONFIG = "1"
}

export async function signIn(openExternal: (url: string) => Promise<unknown>) {
  if (!safeStorage.isEncryptionAvailable()) throw new Error("OS secure storage is unavailable")
  const start = await fetch(`${platformURL}/api/auth/desktop/start`, {
    method: "POST",
    signal: AbortSignal.timeout(10_000),
  })
  if (!start.ok) throw new Error("Could not start AWMate sign-in")
  const login = (await start.json()) as { code: string; loginUrl: string; expiresAt: number; pollInterval: number }
  await openExternal(login.loginUrl)

  while (Date.now() < login.expiresAt * 1000) {
    await new Promise((resolve) => setTimeout(resolve, Math.max(login.pollInterval, 2) * 1000))
    const response = await fetch(`${platformURL}/api/auth/desktop/poll`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: login.code }),
      signal: AbortSignal.timeout(10_000),
    })
    if (response.status === 202) continue
    if (!response.ok) throw new Error("AWMate sign-in expired or was already used")
    const result = (await response.json()) as { accessToken: string; account: Account }
    await writeFile(tokenPath(), safeStorage.encryptString(result.accessToken), { mode: 0o600 })
    return result.account
  }
  throw new Error("AWMate sign-in timed out. Please try again.")
}

export async function signOut() {
  const current = await token()
  await rm(tokenPath(), { force: true })
  if (!current) return
  await fetch(`${platformURL}/api/auth/desktop/logout`, {
    method: "POST",
    headers: { Authorization: `Bearer ${current}` },
    signal: AbortSignal.timeout(10_000),
  }).catch(() => undefined)
}
