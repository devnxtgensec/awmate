import { app, safeStorage } from "electron"
import { readFile, rm, writeFile } from "node:fs/promises"
import path from "node:path"

const platformURL = "https://awmate.nxtgensec.org"
const tokenPath = () => path.join(app.getPath("userData"), "awmate-account.bin")
type LoginAttempt = { controller: AbortController; code?: string }
let activeLogin: LoginAttempt | undefined

export type Account = { email: string; name: string; desktopAccessStatus: string; awsGateway?: boolean; gatewayEnabled: boolean; opencodeEnabled: boolean; models: string[] }

export function clearGateway() {
  if (process.env.AWMATE_DESKTOP_GATEWAY_CONFIG !== "1") return false
  delete process.env.OPENCODE_CONFIG_CONTENT
  delete process.env.AWMATE_GATEWAY_SESSION
  delete process.env.AWMATE_DESKTOP_GATEWAY_CONFIG
  return true
}

async function token() {
  if (!safeStorage.isEncryptionAvailable()) throw new Error("OS secure storage is unavailable")
  try {
    return safeStorage.decryptString(await readFile(tokenPath()))
  } catch {
    return undefined
  }
}

export async function claimDailyCredit() {
  const current = await token()
  if (!current) return "Sign in to AWMate to claim credit."
  const response = await fetch(`${platformURL}/api/daily-bonus`, {
    method: "POST",
    headers: { Authorization: `Bearer ${current}` },
    signal: AbortSignal.timeout(10000),
  })
  const result = await response.json() as { message?: string; error?: string }
  return response.ok ? "Extra $1 claimed. Send your message again." : result.error ?? "Claim failed. Try again."
}

export async function status() {
  const current = await token()
  if (!current) return null
  const response = await fetch(`${platformURL}/api/auth/desktop/session`, {
    headers: { "X-AWMate-Access": "2", Authorization: `Bearer ${current}` },
    signal: AbortSignal.timeout(10_000),
  })
  if (response.status === 401) {
    await rm(tokenPath(), { force: true })
    return null
  }
  if (response.status === 403) {
    await rm(tokenPath(), { force: true })
    const result = (await response.json().catch(() => undefined)) as { error?: string } | undefined
    throw new Error(result?.error ?? "AWMate desktop access is not approved.")
  }
  if (!response.ok) throw new Error("Could not check the AWMate account")
  const result = (await response.json()) as { account: Account }
  return result.account
}

let appliedPermissions = ""
function permissions(account: Account | null) {
  return JSON.stringify(account && [account.email, account.desktopAccessStatus, account.opencodeEnabled, account.gatewayEnabled, account.awsGateway, account.models])
}
export async function refreshPermissions(account: Account | null) {
  if (permissions(account) === appliedPermissions) return false
  if (!account) { appliedPermissions = permissions(null); return clearGateway() }
  return prepareGateway()
}
export async function prepareGateway() {
  const previous = clearGateway()
  const current = await token()
  if (!current || process.env.OPENCODE_CONFIG_CONTENT) return previous
  const response = await fetch(`${platformURL}/api/auth/desktop/session`, {
    headers: { "X-AWMate-Access": "2", Authorization: `Bearer ${current}` },
    signal: AbortSignal.timeout(10_000),
  }).catch(() => undefined)
  if (!response?.ok) return previous
  const result = (await response.json()) as { account: Account }
  appliedPermissions = permissions(result.account)
  if (result.account.desktopAccessStatus !== "approved") return previous
  // Modified for AWMate: desktop context budgets for AWMate Gateway models.
  const contextLimits: Record<string, number> = {
    gemma4: 262_144,
    "glm5.3-flash": 1_048_576,
    "deepseekv4.1-flash-1017": 200_000,
  }
  const models = result.account.models.length ? result.account.models : ["glm5.3-flash", "deepseekv4.1-flash-1017", "gemma4", "sarvam-105b"]
  process.env.AWMATE_GATEWAY_SESSION = current
  process.env.OPENCODE_CONFIG_CONTENT = JSON.stringify({
    policies: [{ action: "provider.use", resource: "*", effect: "deny" }, { action: "provider.use", resource: "awmate", effect: "allow" }],
    providers: result.account.gatewayEnabled ? {
      awmate: {
        name: "AWMate Gateway",
        package: "aisdk:@ai-sdk/openai-compatible",
        env: ["AWMATE_GATEWAY_SESSION"],
        settings: {
          baseURL: result.account.awsGateway ? "https://gateway.nxtgensec.org/awmate/v1" : `${platformURL}/api/gateway/v1`,
          apiKey: "{env:AWMATE_GATEWAY_SESSION}",
        },
        models: Object.fromEntries(models.map((id) => [
          id, contextLimits[id] ? { name: id, limit: { context: contextLimits[id] } } : { name: id },
        ])),
      },
    } : {},
  })
  process.env.AWMATE_DESKTOP_GATEWAY_CONFIG = "1"
  return true
}

async function cancelLoginCode(code: string) {
  await fetch(`${platformURL}/api/auth/desktop/cancel`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-AWMate-Access": "2" },
    body: JSON.stringify({ code }),
    signal: AbortSignal.timeout(10_000),
  }).catch(() => undefined)
}

// Modified for AWMate: cancel the outstanding poll and expire its one-time platform code before a retry.
export async function cancelSignIn() {
  const current = activeLogin
  if (!current) return
  activeLogin = undefined
  current.controller.abort()
  if (current.code) await cancelLoginCode(current.code)
}

export async function signIn(openExternal: (url: string) => Promise<unknown>) {
  if (!safeStorage.isEncryptionAvailable()) throw new Error("OS secure storage is unavailable")
  await cancelSignIn()
  const attempt: LoginAttempt = { controller: new AbortController() }
  activeLogin = attempt
  const callbackScheme = app.isPackaged ? "awmate" : "awmate-local"
  const signal = () => AbortSignal.any([attempt.controller.signal, AbortSignal.timeout(10_000)])
  let completed = false
  try {
    const start = await fetch(`${platformURL}/api/auth/desktop/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-AWMate-Access": "2" },
      body: JSON.stringify({ callbackScheme }),
      signal: signal(),
    })
    if (!start.ok) throw new Error("Could not start AWMate sign-in")
    const login = (await start.json()) as { code: string; loginUrl: string; expiresAt: number; pollInterval: number }
    attempt.code = login.code
    if (attempt.controller.signal.aborted) {
      await cancelLoginCode(login.code)
      throw new Error("AWMate sign-in was canceled")
    }

    await openExternal(login.loginUrl)

    // Modified for AWMate: keep the main-process attempt bounded to the same minute shown by the sign-in UI.
    const expiresAt = Math.min(login.expiresAt * 1000, Date.now() + 60_000)
    while (Date.now() < expiresAt) {
      if (attempt.controller.signal.aborted) throw new Error("AWMate sign-in was canceled")
      await new Promise((resolve) => setTimeout(resolve, Math.max(login.pollInterval, 2) * 1000))
      const response = await fetch(`${platformURL}/api/auth/desktop/poll`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-AWMate-Access": "2" },
        body: JSON.stringify({ code: login.code }),
        signal: signal(),
      })
      if (response.status === 202) continue
      if (!response.ok) {
        const error = (await response.json().catch(() => undefined)) as { error?: string } | undefined
        throw new Error(error?.error ?? "AWMate sign-in expired or was already used")
      }
      const result = (await response.json()) as { accessToken: string; account: Account }
      await writeFile(tokenPath(), safeStorage.encryptString(result.accessToken), { mode: 0o600 })
      completed = true
      return result.account
    }
    throw new Error("AWMate sign-in timed out. Please try again.")
  } finally {
    if (activeLogin === attempt) activeLogin = undefined
    if (!completed && attempt.code) await cancelLoginCode(attempt.code)
  }
}

export async function signOut() {
  const current = await token()
  await rm(tokenPath(), { force: true })
  if (!current) return
  await fetch(`${platformURL}/api/auth/desktop/logout`, {
    method: "POST",
    headers: { "X-AWMate-Access": "2", Authorization: `Bearer ${current}` },
    signal: AbortSignal.timeout(10_000),
  }).catch(() => undefined)
}


