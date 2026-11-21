import { Global } from "@opencode/util/global"
import { openUrl } from "@opencode/util/open"
import path from "node:path"

// AWMate account: the platform token that opens the gateway with the account's plan, credits and
// models. Login reuses the desktop device flow (start → browser Google sign-in → poll), and the
// gateway provider is injected through OPENCODE_CONFIG_CONTENT exactly like the desktop does, so
// the CLI, TUI and desktop all speak to the same AWMate Gateway with the same credit metering.

const platformURL = "https://awmate.nxtgensec.org"
const fallbackModels = ["glm5.3-flash", "deepseekv4.1-flash-1017", "gemma4", "sarvam-105b"]

export type AwmateAccount = { token: string; email: string; name: string }

const filePath = () => path.join(Global.Path.data, "awmate-account.json")

export async function readAccount(): Promise<AwmateAccount | undefined> {
  return Bun.file(filePath())
    .json()
    .then((value) => {
      // SAFETY: the file only ever contains what this module wrote: a token plus profile strings.
      const account = value as Partial<AwmateAccount>
      return typeof account.token === "string" && account.token.length > 0
        ? { token: account.token, email: String(account.email ?? ""), name: String(account.name ?? "") }
        : undefined
    })
    .catch(() => undefined)
}

async function saveAccount(account: AwmateAccount | undefined) {
  if (!account) await Bun.write(filePath(), "").catch(() => undefined)
  else await Bun.write(filePath(), JSON.stringify(account))
}

function openBrowser(url: string) {
  return openUrl(url)
}

const gatewayHeaders = (token: string) => ({ "X-AWMate-Access": "2", Authorization: `Bearer ${token}` })

export type LoginOutcome = "signed-in" | "cancelled" | "pending-approval" | "failed"

export async function login(write: (text: string) => void, maxWaitSeconds = 600): Promise<LoginOutcome> {
  const start = await fetch(`${platformURL}/api/auth/desktop/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-AWMate-Access": "2" },
    body: JSON.stringify({ callbackScheme: "awmate" }),
    signal: AbortSignal.timeout(15_000),
  }).catch(() => undefined)
  if (!start?.ok) {
    write("Could not reach awmate.nxtgensec.org. Check your network and try again.")
    return "failed"
  }
  // SAFETY: the start endpoint returns the platform's documented device-login payload.
  const started = (await start.json()) as { code: string; loginUrl: string; expiresAt: number; pollInterval: number }
  write("Opening awmate.nxtgensec.org in your browser to sign in with Google...")
  await openBrowser(started.loginUrl).catch(() => undefined)

  const deadline = Math.min(started.expiresAt, Math.floor(Date.now() / 1000) + maxWaitSeconds)
  while (Math.floor(Date.now() / 1000) < deadline) {
    await Bun.sleep(Math.max(1, started.pollInterval) * 1000)
    const poll = await fetch(`${platformURL}/api/auth/desktop/poll`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-AWMate-Access": "2" },
      body: JSON.stringify({ code: started.code }),
      signal: AbortSignal.timeout(15_000),
    }).catch(() => undefined)
    if (!poll) continue
    // SAFETY: the poll endpoint returns pending/approved states or a plain error object.
    const result = (await poll.json()) as { status?: string; accessToken?: string; code?: string; error?: string }
    if (poll.status === 202) continue
    if (result.code === "AWMATE_ACCESS_PENDING" || result.code === "AWMATE_ACCESS_DENIED") {
      write(result.error ?? "Your account is not approved yet. Contact support@nxtgensec.org.")
      return "pending-approval"
    }
    if (!poll.ok || typeof result.accessToken !== "string") {
      write(result.error ?? "Sign-in did not complete. Try again.")
      return "failed"
    }
    const session = await fetch(`${platformURL}/api/auth/desktop/session`, {
      headers: gatewayHeaders(result.accessToken),
      signal: AbortSignal.timeout(15_000),
    }).catch(() => undefined)
    // SAFETY: the session endpoint returns the account view payload for the bearer token.
    const view = session?.ok ? ((await session.json()) as { account?: { email?: string; name?: string } }).account : undefined
    await saveAccount({ token: result.accessToken, email: view?.email ?? "", name: view?.name ?? "" })
    write(`Signed in as ${view?.email || "your AWMate account"}.`)
    return "signed-in"
  }
  write("Sign-in timed out. Run the command again to try once more.")
  return "cancelled"
}

export async function logout() {
  await saveAccount(undefined)
}

// The gateway provider config, injected through OPENCODE_CONFIG_CONTENT like the desktop does. The
// OpenCode gateway stays available only to accounts an administrator enabled it for; everything a
// user connects explicitly through /connect keeps working.
function applyGateway(account: AwmateAccount, models: string[], opencodeEnabled: boolean, gatewayEnabled: boolean, modelContexts?: Record<string, number>) {
  const contextLimit = (id: string) => {
    const served = modelContexts?.[id]
    if (Number.isSafeInteger(served) && (served as number) > 0) return served as number
    return id === "gemma4" ? 262_144 : id.startsWith("glm") || id.startsWith("deepseek") ? 1_048_576 : undefined
  }
  process.env.AWMATE_GATEWAY_SESSION = account.token
  process.env.OPENCODE_CONFIG_CONTENT = JSON.stringify({
    model: `awmate/${models[0] ?? fallbackModels[0]}`,
    policies: [...(opencodeEnabled ? [] : [{ action: "provider.use", resource: "opencode", effect: "deny" }])],
    ...(gatewayEnabled
      ? {
          providers: {
            awmate: {
              name: "AWMate Gateway",
              package: "aisdk:@ai-sdk/openai-compatible",
              env: ["AWMATE_GATEWAY_SESSION"],
              settings: { baseURL: `${platformURL}/api/gateway/v1`, apiKey: "{env:AWMATE_GATEWAY_SESSION}" },
              models: Object.fromEntries(
                models.map((id) => {
                  const limit = contextLimit(id)
                  return [id, limit ? { name: id, limit: { context: limit } } : { name: id }]
                }),
              ),
            },
          },
        }
      : {}),
  })
}

export type PrepareResult = "applied" | "unsigned" | "unavailable"

export async function prepareGateway(): Promise<PrepareResult> {
  if (process.env.OPENCODE_CONFIG_CONTENT) return "applied"
  const account = await readAccount()
  if (!account) return "unsigned"
  const response = await fetch(`${platformURL}/api/auth/desktop/session`, {
    headers: gatewayHeaders(account.token),
    signal: AbortSignal.timeout(10_000),
  }).catch(() => undefined)
  if (!response?.ok) return "unavailable"
  // SAFETY: a successful session response is the platform's account payload.
  const result = (await response.json()) as { account?: { desktopAccessStatus?: string; models?: string[]; modelContexts?: Record<string, number>; gatewayEnabled?: boolean; opencodeEnabled?: boolean } }
  if (result.account?.desktopAccessStatus !== "approved") return "unavailable"
  const models = result.account.models?.length ? result.account.models : fallbackModels
  applyGateway(account, models, result.account.opencodeEnabled === true, result.account.gatewayEnabled !== false, result.account.modelContexts)
  return "applied"
}

/** Login when needed, then inject the gateway config. Never throws: the TUI must always start.
 * Returns "fresh-login" when a new sign-in just completed — the caller must then stop any running
 * background service, which was started before the gateway config existed. */
export async function ensureAccount(write: (text: string) => void): Promise<"applied" | "fresh-login" | "unsigned" | "unavailable"> {
  const prepared = await prepareGateway()
  if (prepared !== "unsigned") return prepared
  const outcome = await login(write, 120)
  if (outcome !== "signed-in") {
    write("Continuing without the AWMate Gateway. Run `awmate login` later to sign in.")
    return "unsigned"
  }
  const applied = await prepareGateway()
  return applied === "applied" ? "fresh-login" : applied
}
