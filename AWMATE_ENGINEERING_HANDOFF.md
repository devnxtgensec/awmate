# AWMate engineering handoff and Windows runbook

Snapshot: 14 November 2026. Desktop reference: public Windows x64 v2.2.14, commit `fe3af61315` on `dev` and `main`. Platform reference: `7afe8d8` on `main` (AWS relay routing, D1 authorization and settlement). The local platform checkout also has uncommitted work on a `dev` branch: the admin routing toggle, relay tracing and health, and the desktop fallback proxy.

## Start here

AWMate (Assistive Workmate) is a branded Electron desktop built on the OpenCode engine. A Windows user downloads one installer, signs in with Google in the system browser, returns to AWMate, selects an AWMate Gateway model, and sends a prompt. New accounts get the managed gateway automatically. Explicitly suspended accounts retain their suspension. The old admin invitation workflow and two-provider selector describe earlier builds.

| Component | Checkout on Savir’s PC | Responsibility |
|---|---|---|
| Desktop | `C:\Users\Savir\Downloads\AWMate` | Bun workspace, Solid UI, Electron main process, bundled local CLI, project files and tools, Windows installer |
| Platform | `C:\Users\Savir\OneDrive\Desktop\awmate-platform` | React website, Cloudflare Pages Functions, Google OAuth, D1 accounts/sessions and daily budget ledger |
| Gateway | `C:\Users\Savir\OneDrive\Desktop\Gateway` | AWS EC2, Caddy, LiteLLM, virtual keys and provider routing. See its `GATEWAY_SUMMARY.md`. Deployed database-backed model aliases can differ from the sample YAML. |

Product and account site: [AWMate](https://awmate.nxtgensec.org). Gateway host: `gateway.nxtgensec.org`. The desktop calls the **platform proxy** so account checks and reservations run before model inference.

## From sign-in to a completed task

1. Electron requests a short-lived desktop login code. The platform signs OAuth state, the browser completes Google sign-in, and the callback creates or updates the account in D1. Ordinary website login goes to the account page. Desktop login carries a return scheme and has a polling flow. Retrying cancels the previous attempt.
2. The installed scheme is `awmate`; development uses `awmate-local`. The desktop obtains its session through the poll. D1 stores a hash; Electron stores the returned credential with OS-backed safeStorage in its own profile. The desktop session is revocable and time-limited. See [account authentication](AWMATE_ACCOUNT_AUTH.md) for implementation history.
3. An eligible account without a gateway key is provisioned through LiteLLM. The platform stores the encrypted per-user key and uses a D1 lease during provisioning. The desktop gets the account/model information and its own desktop session. Provider secrets stay on the servers.
4. The local runtime registers provider ID `awmate`, display name **AWMate Gateway**. Accounts with `aws_gateway = 1` point at a desktop-local proxy that tries the AWS relay first and falls back to the Cloudflare gateway; other accounts point directly at `/api/gateway/v1`. Provider policy allows the managed route; the bundled runtime also checks the selected provider. Older builds offered direct OpenCode Free, separate OpenCode permissions and bring-your-own providers. Existing standalone OpenCode installations have their own configuration.
5. The platform authenticates the desktop session, verifies entitlement and model, reserves budget atomically, and forwards the request using the account’s virtual key. AWS LiteLLM calls Sarvam Token Factory. The four verified aliases are `glm5.3-flash`, `deepseekv4.1-flash-1017`, `gemma4`, and `sarvam-105b`. Empty model assignments use the managed defaults. Opted-in accounts stream through the AWS relay (`gateway.nxtgensec.org/awmate/v1`), which reserves and settles against the same D1 ledger through `/api/aws-control`; the Cloudflare gateway stays available for older clients and as the fallback.
6. The model can request tools; AWMate’s local engine reads files, applies edits or runs commands under its permissions. Tool results can become input to another inference call. Skills supply instructions. A single chat turn can make multiple billable requests.
7. The platform settles JSON and streaming usage against the reservation. It uses configured USD tariffs, including cache hits when reported. Uncertain or interrupted usage can retain the reservation for that day. Reservations use a conservative context bound, so a request may be refused before the displayed balance reaches zero.
8. Default allowance is **$1 per India calendar day**, plus one optional **$1 claim** after a budget refusal. The claim updates the account/day row once; repeated requests cannot stack bonuses. Electron shows Claim now and asks the user to resend. D1 enforces the base while the upstream ceiling allows the bonus. App-imposed RPM/TPM limits were removed from existing user and key records and provisioning. Providers can still throttle requests.

## Run the isolated desktop locally

These are Windows PowerShell commands. Use a fresh, ordinary terminal. The root below is the same persistent test profile used during development. Reusing it preserves test login and chats. Choose a different unused test-root name for a clean first launch.

~~~powershell
Set-Location 'C:\Users\Savir\Downloads\AWMate'
git status --short --branch
(Get-Content package.json -Raw | ConvertFrom-Json).packageManager
bun --version
node --version

# First checkout or changed dependencies: install from the workspace root.
bun install --frozen-lockfile
if ($LASTEXITCODE) { throw 'Workspace dependency installation failed' }

# Electron must be able to spawn bun.exe directly.
$awmateBun = (bun -e "console.log(process.execPath)").Trim()
if (!(Test-Path -LiteralPath $awmateBun)) { throw 'Bun executable missing' }
$env:PATH = "$(Split-Path $awmateBun);$env:PATH"
$env:AWMATE_BUILD = '1'
$env:OPENCODE_DESKTOP_TEST_ROOT = Join-Path $env:TEMP 'awmate-local-ui'
& $awmateBun run dev:desktop
~~~

The root script enters `packages/desktop`, prepares Electron and icons, then starts the development renderer and source CLI. Wait for the **main window and background service**; a Vite listening message alone proves only that the renderer started. Open a new chat, confirm AWMate Gateway and the selected model, and send a short prompt. Stop this run with Ctrl+C in its own terminal. Restart it after main-process, IPC, branding or configuration edits. Renderer edits can hot reload; relaunch if the visible bundle is stale.

| Under the test root | Purpose |
|---|---|
| `desktop\` | Electron userData, encrypted desktop login, logs and crash reporting. The isolated background-service launcher can use this path as its state home. |
| `session\` | Electron session data for this test profile |
| `data\opencode\awmate.db` | Isolated runtime database; the internal opencode path segment is deliberate |
| `config\`, `cache\`, `state\` | XDG roots for runtime configuration, cache and state; extra config directory is `config\opencode` |
| `documents\` | Created for testing; redirected as the documents location during onboarding tests. A project opened elsewhere still refers to its real filesystem directory. |

The code sets those paths in `packages/desktop/src/main/lifecycle/configure.ts`. A packaged build without a test override derives its runtime root under the app-specific AppData directory. Test-root isolation separates local data. The normal development build **still uses the live AWMate platform and gateway**, and real signed-in requests count toward the real account allowance.

## Run the platform locally

~~~powershell
Set-Location 'C:\Users\Savir\OneDrive\Desktop\awmate-platform'
bun install --frozen-lockfile
bunx wrangler d1 migrations apply awmate-platform --local
bun run typecheck:functions
bun run pages:dev
~~~

Use the port Wrangler reports (we used `http://localhost:8788/account`). If needed, run `bun run build` then `bunx wrangler pages dev dist --ip 127.0.0.1 --port 8788`. Configure the local-only `.dev.vars` from the repository’s example and the registered localhost Google callback. It supplies OAuth, session hashing, gateway management, and gateway-key encryption settings. Never paste credentials into notes, commits, logs or installers. Local D1 can have different accounts from production. Starting Pages locally does not redirect the Electron platform URL; that constant lives in `packages/desktop/src/main/service/awmate-auth.ts`.

## AWS relay and the admin routing toggle

Chat streaming can run on either the Cloudflare gateway or the AWS relay. Both paths authenticate the same desktop session and settle against the same D1 reservations.

- **Choose the path per account.** The admin portal has a **Routing** section. `PATCH /api/admin/accounts/:id/routing` with `{ "awsGateway": true | false }` updates `accounts.aws_gateway` and writes `gateway_routing_aws` or `gateway_routing_cloudflare` to `admin_audit_log`. The desktop reads the flag on its next permission refresh and restarts the sidecar.
- **AWS path.** `gateway.nxtgensec.org/awmate/v1` is Caddy in front of `awmate-relay` on port 8090. The relay validates the request, reserves through `https://awmate-platform.pages.dev/api/aws-control`, forwards to LiteLLM with the account’s virtual key, and settles usage or a 5xx rejection. `/awmate/health` is the container healthcheck. The relay caps request bodies at 48 MB (a 20 MB attachment is about 27 MB after base64).
- **Desktop fallback.** `packages/desktop/src/main/service/awmate-relay-proxy.ts` listens on `127.0.0.1` and points the provider at `http://127.0.0.1:<port>/v1`. It tries AWS first, retries Cloudflare on a network error or a 5xx before the body is committed, and passes 4xx through. Two consecutive AWS failures mark AWS unhealthy for 60 seconds, during which Cloudflare is tried first. If the proxy cannot bind, the desktop uses the Cloudflare base URL directly.
- **Cloudflare path stays.** `functions/api/gateway/[[path]].ts` remains for older clients and as the fallback. It now settles 0 on a 5xx and records stream boundaries on the reservation.
- **Deployment.** Relay source is `gateway-aws/relay.py` and `gateway-aws/stream_inspector.py` in the platform repo. Copy both to `/opt/awmate-relay` on the gateway host, write `/opt/awmate-relay/relay.env` from `Gateway/docker/relay.env.example`, and start the `awmate-relay` service in `Gateway/docker/docker-compose.yml`. `AWS_RELAY_SECRET` must match the Pages secret of the same name. The relay control URL is hardcoded to `https://awmate-platform.pages.dev/api/aws-control`.
- **Host access is SSM only.** Port 22 is closed on `i-07b8b36c30710bf65`; use `aws ssm send-command` with `AWS-RunShellScript` (the local `terraform-gateway` IAM user can run it) and read the result with `aws ssm get-command-invocation`. Upload files by base64-encoding them into the command and decoding on the host, then compare `sha256sum` with the local `Get-FileHash`.
- **Live container shape.** `awmate-relay` runs from the LiteLLM image (`sha256:c560d317…`), `--entrypoint python /srv/relay.py`, on the `docker_gateway` network, with `--memory 192m`, `--cap-drop ALL`, `--security-opt no-new-privileges`, `--restart unless-stopped`, `--env-file /opt/awmate-relay/relay.env`, and `-v /opt/awmate-relay:/srv:ro`. Mount the directory, not just `relay.py`, or the `stream_inspector` import fails. The container is created with `docker run`, not compose, so it has no compose labels; recreate it with the same flags after a source change. A `--health-cmd` hitting `http://localhost:8090/awmate/health` reports `healthy` within one interval.
- **Deployed 14 November 2026.** `relay.py` (7027 bytes, sha256 `8aab17e2…`) and `stream_inspector.py` (1943 bytes, sha256 `64653918…`) are live. `https://gateway.nxtgensec.org/awmate/health` returns `{"ok": true}`, and both `/awmate/v1/models` and `/awmate/v1/chat/completions` reach the platform control API (a bogus token returns `401 Desktop session expired`). The previous `relay.py` is kept as `/opt/awmate-relay/relay.py.bak-20261114-125754`.

## Desktop update and gateway selection

- **Updates install on the next launch.** The AWMate updater checks at startup and every five minutes, downloads a newer release in the background, and stages it. `autoInstallOnAppQuit` is enabled on Windows, so the staged release installs when the user quits; the next launch is the new version. The titlebar pill appears as soon as the download is ready, and clicking it still restarts immediately.
- **Help points at AWMate.** The Help menu entry is **AWMate Documentation** and opens `https://awmate.nxtgensec.org/docs`.
- **DeepSeek context.** `deepseekv4.1-flash-1017` uses a 1,048,576-token desktop context budget, matching `glm5.3-flash`.
- **Two gateways.** `awmate` is the default managed gateway. The admin portal's **Access** section toggles `accounts.opencode_enabled`, which allows the built-in `opencode` provider in the chat model picker. The desktop writes `provider.use` policies that deny every provider except the allowed gateways, so the user selects the gateway by choosing a model from the picker.
- **Picker shows both gateways.** The composer's gateway label is a menu listing every gateway the account was granted, **AWMate Gateway** first and **OpenCode** second. Choosing one switches to the model that gateway was last used with, and the model picker then lists only that gateway's models. The chip shows only the model name. The client send guard (`packages/app/src/composer/model.ts`) allows `awmate` when `gatewayEnabled` and `opencode` when `opencodeEnabled`, and the core runtime guard (`packages/core/src/session/model-request.ts`) accepts `providerID === "opencode"` alongside `awmate`. Verified 16 November 2026 in the isolated desktop: the AWMate menu listed four `awmate:` models and the OpenCode menu twelve `opencode:` models, and both answered a prompt (1s and 6s).

## Issue and resolution history

| Symptom | Finding and response |
|---|---|
| Bun says dev or dev:desktop script missing | Terminal started in System32. Change into the AWMate workspace before invoking root scripts. |
| install-electron missing or @effect/platform-node cannot resolve | Check the workspace install and pinned Bun version before launching. Do not rely on Bun resolving missing dependencies opportunistically at runtime. |
| Electron builds but shows Desktop IPC handler failed | Read the deepest cause in the desktop log. On this PC it was `spawn bun ENOENT`. Prepending the actual Bun executable directory fixed that launch. The same outer IPC error can have other causes. |
| Managed port 3084 already occupied | Check `Get-NetTCPConnection -LocalPort 3084 -State Listen`, then inspect the owning process. Close only an identified, unneeded instance. For a second isolated instance, set `AWMATE_DESKTOP_SERVICE_PORT` (for example `3085`) before `bun run dev:desktop`; the override is in `packages/desktop/src/main/service/background-service.ts`. |
| Website login returned to /account or opened another installed app | Separate website and desktop OAuth state, dev/installed callback identities, and one-time polling. Earlier Windows unquoted Electron launch arguments also caused “Cannot find module C:\\Users\\Savir”. See the auth history before changing protocol registration. |
| Account UI blinked or appeared signed out after sign-in | Keep the session in OS-backed storage and separate session checks from first-login UI. Check session expiry, callback host and the session endpoint before changing the database. |
| Only OpenCode free models appeared | Previously an empty assignment suppressed the managed provider; the desktop now supplies four defaults and uses the supported AI SDK adapter identifier. Public builds allow only AWMate Gateway. |
| ExceededBudget at spend zero | A LiteLLM user had a literal $0 budget. Fixed the affected user and provisioning. Check both LiteLLM user and virtual-key records as well as the platform daily ledger. |
| Rate limit exceeded while credit remained | Separate per-minute throttling from daily spend. Removed AWMate RPM/TPM settings for users and keys. A provider-side throttle can still occur. |
| Models introduced themselves as OpenCode | Apply model-specific identity guidance at the managed platform proxy. Credit Assistive Workmate Labs for developing the integration; preserve the actual model identity. |
| OpenCode logo still visible after rebranding | New-chat artwork was a separate component. Updated composer wordmark, desktop assets, About, What’s New and support links. Preserve upstream notices, runtime identifiers and provider protocol names. |
| Windows symlink/declaration checkout failures | Desktop history includes shared declaration fixes in 53c72ac and 029630d. Check a Windows checkout and use the normal pre-push checks. |

## UI and local behavior delivered

The sidebar groups chats under project folders, provides search and New chat, and uses signed-in account initials. Project/chat menus support rename and JSON export. Chat deletion confirms the target; project removal hides the project while retaining its files and history. The top AWMate heading is static. Settings beta feedback is inline; Help points to the AWMate website/docs. About and release notes are branded, and Aura is the default for profiles without a saved theme.

## Branches, builds and releases

- Desktop `origin` is the AWMate fork; `upstream/dev` tracks the original OpenCode repository. A fetch updates remote references only. Review upstream changes on an integration branch, merge into AWMate dev, test, then fast-forward main. See [branch procedure](AWMATE_UPSTREAM_WORKFLOW.md). Do not replace the fork branch with upstream when integrating fixes.
- A push to desktop main triggers `.github/workflows/awmate-release.yml`. It increments the previous published patch version, builds the Windows CLI from source, builds the branded Electron app, packages an NSIS installer, and publishes EXE, ZIP, blockmap and latest.yml. The portal uses a separate repository/deployment; backend changes do not automatically rebuild the EXE.
- The updater consumes release metadata; a locally launched dev window is not proof that the packaged updater works. Check workflow SHA, release tag, latest.yml, installer file version and artifact digest. See [Windows releases](AWMATE_WINDOWS_RELEASES.md).
- Recorded milestone: v2.2.10 shipped branding. The local 2.2.11-preview.1 was superseded by public v2.2.11. GitHub build succeeded, and the copy on the Windows Desktop matched the release SHA-256 and embedded version. [Public release downloads](https://github.com/devnxtgensec/awmate/releases/latest).
- Platform: build and typecheck in its checkout, apply any required D1 migrations in the intended environment, and deploy Pages Functions plus static assets. Production uses the awmate-platform Pages project. AWS model changes are separate and can be applied via AWS Systems Manager to the LiteLLM host. The desktop receives no master key.

## Verification and next-agent entry points

Direct model tests demonstrated function calling with synthetic source, and four live AWS aliases returned text and usage with a temporary restricted key. Local ledger tests covered the exact cap, per-user/day isolation, JSON and SSE settlement, refusal before forwarding, bonus replay, and the final cap. These tests do not substitute for a clean-PC installer test.

For a fresh-user acceptance run: use an unused desktop test profile or clean Windows VM; install the public EXE; sign in with a new Google account; verify AWMate-only models; send a prompt; restart and verify session retention. With a disposable account and controlled ledger fixture, test exhaustion, claim, duplicate claim, final refusal and next-day reset. Verify the standalone OpenCode profile did not change. A complete clean-PC first-login test and real-account desktop bonus claim were not recorded as verified.

Key desktop files: `packages/desktop/src/main/service/awmate-auth.ts` (sign-in and provider), `packages/desktop/src/main/service/awmate-relay-proxy.ts` (AWS-first fallback proxy), `packages/core/src/session/model-request.ts` (provider guard), `packages/app/src/session/screen.tsx` (credit prompt), `packages/app/src/composer/` (model controls). Platform files: `functions/api/auth/google/callback.ts`, `functions/api/auth/desktop/`, `functions/_shared/default-gateway.ts`, `functions/api/gateway/[[path]].ts`, `functions/api/aws-control.ts`, `functions/api/admin/accounts/[id]/routing.ts`, `functions/_shared/gateway-cost.ts`, `gateway-aws/relay.py`, `gateway-aws/stream_inspector.py`, `functions/api/daily-bonus.ts`, and `migrations/`. Historical details: [backend architecture](AWMATE_BACKEND_ARCHITECTURE.md), [desktop changelog](AWMATE_CHANGELOG.md), and the platform’s ACCOUNT_PORTAL_SETUP.md and DESKTOP_AUTH.md. Older notes reflect the approval-based design in effect when written.
