// Standalone AWMate device-login poller. Takes DEVICE_CODE from the environment (produced by
// /api/auth/desktop/start), polls until the browser sign-in approves it, then saves the token.
delete process.env.OPENCODE_CONFIG_CONTENT
delete process.env.AWMATE_GATEWAY_SESSION
delete process.env.AWMATE_DESKTOP_GATEWAY_CONFIG

const platform = "https://awmate.nxtgensec.org"
const code = process.env.DEVICE_CODE ?? ""
if (!code) {
  console.log("DEVICE_CODE is required")
  process.exit(1)
}
const file = `${process.env.USERPROFILE ?? process.env.HOME}\\.local\\share\\awmate\\awmate-account.json`

const deadline = Math.floor(Date.now() / 1000) + 600
let token: string | undefined
let email = ""
while (Math.floor(Date.now() / 1000) < deadline) {
  await Bun.sleep(2000)
  const poll = await fetch(`${platform}/api/auth/desktop/poll`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-AWMate-Access": "2" },
    body: JSON.stringify({ code }),
  }).catch(() => undefined)
  if (!poll) continue
  const result = (await poll.json().catch(() => ({}))) as { status?: string; accessToken?: string; account?: { email?: string; plan?: { name?: string } }; code?: string; error?: string }
  if (poll.status === 202) continue
  if (typeof result.accessToken === "string") {
    token = result.accessToken
    const session = await fetch(`${platform}/api/auth/desktop/session`, {
      headers: { "X-AWMate-Access": "2", Authorization: `Bearer ${token}` },
    }).catch(() => undefined)
    const view = session?.ok ? ((await session.json()) as { account?: { email?: string; models?: string[]; plan?: { name?: string; credits?: number } } }).account : undefined
    email = view?.email ?? ""
    console.log(`SIGNED IN as ${email}`)
    console.log(`plan: ${view?.plan?.name ?? "-"}, models: ${(view?.models ?? []).join(", ")}`)
    await Bun.write(file, JSON.stringify({ token, email, name: view?.email ?? "" }))
    console.log(`token saved to ${file}`)
    break
  }
  console.log("poll:", result.code ?? result.error ?? `HTTP ${poll.status}`)
  if (result.code?.startsWith("AWMATE_ACCESS")) break
}
if (!token) console.log("NOT signed in - generate a new link and try again")
