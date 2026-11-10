# AWMate desktop account authentication

## Flow

1. The Electron account menu starts a short-lived desktop login with `awmate.nxtgensec.org`.
2. Electron opens the existing Google OAuth flow in the system browser. Google client secrets stay on Cloudflare.
3. After Google verifies the user, the platform marks that one-time desktop login as approved.
4. Electron polls for approval and stores the resulting 30-day opaque session token using Electron `safeStorage` in the AWMate app user-data folder. The token is not returned to the renderer.
5. The first desktop query checks for a signed-in AWMate account. Without one, it opens Google sign-in and leaves the draft for the user to send after returning.
6. On restart, Electron verifies the account and loads only its allowed models into the AWMate OpenAI-compatible provider. The provider config uses the session token from the sidecar process environment; it is not written to a config file or sent to the renderer.
7. Once Google approval is complete, the browser callback redirects to `awmate://auth/complete`. This custom protocol only brings the already-running AWMate window forward; the desktop continues polling for approval, so no session token is exposed in the deep link. Ordinary website login still returns to `/account`.
8. The menu shows the Google account and whether gateway access is enabled. Sign-out revokes the desktop session, deletes the local encrypted token, clears the AWMate provider config, and restarts the isolated CLI sidecar while keeping the Electron window open.
9. `/api/gateway/*` validates that session on every request, checks current account provisioning and enabled status, decrypts only that account's LiteLLM key server-side, then forwards the request to LiteLLM. LiteLLM applies its per-user limits.

## Platform changes

- `migrations/0002_desktop_auth.sql` adds hashed one-time login codes and hashed desktop sessions. Apply this migration to the Cloudflare D1 production database before enabling desktop login.
- `functions/api/auth/desktop/*` implements start, poll, session lookup, and revocation.
- Google OAuth state carries the one-time desktop login code under the existing signed, HttpOnly OAuth cookie.
- `functions/api/gateway/[[path]].ts` is an authenticated OpenAI-compatible gateway proxy. It requires the existing `SESSION_HASH_SECRET`, `GATEWAY_KEY_ENCRYPTION_KEY`, and LiteLLM configuration.

## Implementation record

### AWMate desktop changes

- `packages/desktop/src/main/service/awmate-auth.ts` owns device login, polling, encrypted token persistence, account lookup, and logout/revocation.
- `packages/desktop/src/main/lifecycle/deep-link.ts`, `index.ts`, and `environment.ts` register and handle the AWMate-only `awmate://auth/complete` protocol. On Windows dev runs, protocol registration includes the Electron app entry path so Windows does not parse a path with spaces as a truncated `C:\Users\...` module path.
- `packages/desktop/src/main/service/background-service.ts` forces AWMate builds to use their own isolated CLI sidecar and can restart that sidecar after sign-in/sign-out so refreshed gateway environment is picked up without relaunching Electron.
- `packages/desktop/src/main/desktop.ts` initializes the account integration and configures the AWMate provider for the sidecar process.
- `packages/desktop/src/main/ipc-handlers/app.ts`, `packages/desktop/src/shared/ipc-rpc/app.ts`, `packages/desktop/src/renderer/api-types.ts`, `packages/desktop/src/renderer/api.ts`, and `packages/desktop/src/renderer/platform/index.ts` expose account operations across Electron IPC without returning the session token to the renderer.
- `packages/app/src/shell/titlebar/titlebar.tsx` adds account sign-in/status/sign-out actions.
- `packages/app/src/runtime/platform/platform.tsx` connects the account state to the app runtime.
- `packages/app/src/composer/model.ts` and `packages/app/src/composer/submit.ts` gate AWMate prompt and quote submission on sign-in while leaving the draft available during sign-in. Existing personal provider connections remain supported after the account is signed in.

### Platform changes

- `migrations/0002_desktop_auth.sql` adds one-time login-code and desktop-session tables. Both credential values are stored as hashes.
- `functions/api/auth/desktop/start.ts`, `poll.ts`, `session.ts`, and `logout.ts` implement the desktop device-login lifecycle.
- `functions/api/auth/google/start.ts` and `callback.ts` carry the device code through the existing signed OAuth state and approve it after Google authentication.
- `functions/api/auth/google/callback.ts` redirects approved desktop login to `awmate://auth/complete`; normal browser sign-in continues to `/account`.
- `functions/_shared/auth.ts` contains shared token/hash helpers.
- `functions/api/gateway/[[path]].ts` proxies authenticated OpenAI-compatible requests to LiteLLM, checking the desktop session and the account's current gateway provisioning/enabled state on each request. The platform decrypts that account's LiteLLM key server-side; it does not send the gateway master key to Electron.
- `DESKTOP_AUTH.md` documents the platform-side protocol and security model.

## Verification and rollout record

### Completed

- AWMate Electron production build passed. Desktop and app typechecks passed.
- AWMate's pre-push checks passed: lint reported 588 warnings and 0 errors, SDK documentation reported 0 problems, and Turbo typecheck completed all 32 of 32 tasks. On this Windows checkout, `packages/app/src/custom-elements.d.ts` is a symlink placeholder that typecheck cannot read directly; it was temporarily materialized from `packages/ui/src/custom-elements.d.ts` for checks and restored immediately afterward.
- Platform `bun run build` and `bun run typecheck:functions` passed.
- Cloudflare D1 migration `0002_desktop_auth.sql` was applied to the production database before the new API was deployed.
- The platform build was deployed manually to Cloudflare Pages production. Deployment URL: `https://7fb5b9f8.awmate-platform.pages.dev`; the account site remains `https://awmate.nxtgensec.org`.
- Production smoke checks passed: `POST /api/auth/desktop/start` returned a login URL, expiry, and poll interval; unauthenticated `GET /api/auth/desktop/session` and `GET /api/gateway/v1/models` returned HTTP 401.
- The Electron app is currently running from `packages/desktop` as version `2.2.5` with `OPENCODE_TEST_ONBOARDING=1` and `OPENCODE_DESKTOP_ISOLATED_SERVER=1`. Since this checkout did not have the ignored `resources/opencode-cli-dev.exe`, an ignored local copy of `resources/opencode-cli.exe` was made at that expected name for isolated testing; no tracked source or existing executable was overwritten. The isolated sidecar is ready on `127.0.0.1:3084`; the UI accessibility tree shows the AWMate Account row with “Sign in to AWMate.” Its temporary profile is `%TEMP%\opencode-onboarding-e86bb20b-0484-4afe-8371-c63c54bc8773`. A stale sidecar from an earlier AWMate test initially occupied port 3084; that AWMate-owned process was stopped, and this launch then started successfully.

### Publication record

- AWMate commit `4aa3a005ae` (`feat(desktop): add AWMate account authentication`) and documentation commit `b01a524284` (`docs: record desktop auth rollout`) were pushed to `origin/main`.
- Platform commit `98dacb4` (`feat(auth): add desktop gateway sessions`) is committed locally on `main`, one commit ahead of `origin/main`. The configured GitHub remote `https://github.com/nxtgensec/awmate-platform.git` returned `Repository not found`, so this commit could not be pushed. Its verified build was deployed manually to Cloudflare Pages as noted above.
- `AWMATE_CHANGELOG.md` records the dated AWMate customization and push/deployment status.

### Still requires an interactive account test

- Complete Google consent from the running Electron app with an account whose gateway access is enabled.
- Confirm the browser return focuses the running app, the sidecar restarts after approval, the account state and allowed models appear, and a LiteLLM response streams successfully.
- Check sign-out/revocation, expired device login, and denial after gateway access is disabled.
- During the latest browser inspection, the currently signed-in AWMate account showed gateway access as “Not enabled”; provision gateway access for the intended test account before expecting the AWMate model or a successful gateway response.
- No distributable `.exe` was built in this task. The running local Electron app is the development build; producing a release installer is a separate packaging step after the interactive flow is verified.

### 2026-11-10 — Desktop OAuth return and Windows launch fix

- Fixed the post-Google desktop return: the OAuth callback opens `awmate://auth/complete`, which focuses the existing Electron app while its device-login poll completes.
- Fixed Windows development protocol registration to use Electron's resolved application path. This avoids the reported `Unable to find Electron app at C:\Users\Savir` / `Cannot find module 'C:\Users\Savir'` error when the project path contains spaces.
- Removed the auth flow's Electron relaunch. After session changes, only the isolated AWMate CLI sidecar restarts and reloads the authenticated gateway configuration.
- AWMate builds always use an isolated sidecar, preventing AWMate's account-specific gateway environment from being reused by OpenCode.
- Desktop/app typechecks and the AWMate desktop production build passed. A live Google login and successful gateway request still need to be verified with a gateway-enabled account.
- Windows local smoke check passed: the `awmate` protocol registration points to the full `packages/desktop` app path, opening `awmate://auth/complete` leaves the running Electron app active, and its isolated CLI sidecar listens on port 3084.
- AWMate commit `098f194839` (`fix(desktop): return OAuth sign-in to AWMate`) was pushed to `origin/main`.
- Follow-up AWMate commit `5c35da3363` (`fix(desktop): register full Windows app path`) was also pushed to `origin/main`; documentation update `027d355e16` is included in the branch history.
- Platform commit `5c249bc` (`fix(auth): return desktop login to AWMate`) is saved locally. Its build was deployed to Cloudflare Pages at `https://26b03cc2.awmate-platform.pages.dev`; pushing the source commit failed because the configured GitHub remote returned `Repository not found`.
