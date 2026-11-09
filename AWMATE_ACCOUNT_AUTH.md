# AWMate desktop account authentication

## Flow

1. The Electron account menu starts a short-lived desktop login with `awmate.nxtgensec.org`.
2. Electron opens the existing Google OAuth flow in the system browser. Google client secrets stay on Cloudflare.
3. After Google verifies the user, the platform marks that one-time desktop login as approved.
4. Electron polls for approval and stores the resulting 30-day opaque session token using Electron `safeStorage` in the AWMate app user-data folder. The token is not returned to the renderer.
5. The first desktop query checks for a signed-in AWMate account. Without one, it opens Google sign-in and leaves the draft for the user to send after returning.
6. On restart, Electron verifies the account and loads only its allowed models into the AWMate OpenAI-compatible provider. The provider config uses the session token from the sidecar process environment; it is not written to a config file or sent to the renderer.
7. The menu shows the Google account and whether gateway access is enabled. Sign-out revokes the desktop session, deletes the local encrypted token, and restarts the app to remove AWMate provider access.
8. `/api/gateway/*` validates that session on every request, checks current account provisioning and enabled status, decrypts only that account's LiteLLM key server-side, then forwards the request to LiteLLM. LiteLLM applies its per-user limits.

## Platform changes

- `migrations/0002_desktop_auth.sql` adds hashed one-time login codes and hashed desktop sessions. Apply this migration to the Cloudflare D1 production database before enabling desktop login.
- `functions/api/auth/desktop/*` implements start, poll, session lookup, and revocation.
- Google OAuth state carries the one-time desktop login code under the existing signed, HttpOnly OAuth cookie.
- `functions/api/gateway/[[path]].ts` is an authenticated OpenAI-compatible gateway proxy. It requires the existing `SESSION_HASH_SECRET`, `GATEWAY_KEY_ENCRYPTION_KEY`, and LiteLLM configuration.

## Implementation record

### AWMate desktop changes

- `packages/desktop/src/main/service/awmate-auth.ts` owns device login, polling, encrypted token persistence, account lookup, and logout/revocation.
- `packages/desktop/src/main/desktop.ts` initializes the account integration and configures the AWMate provider for the sidecar process.
- `packages/desktop/src/main/ipc-handlers/app.ts`, `packages/desktop/src/shared/ipc-rpc/app.ts`, `packages/desktop/src/renderer/api-types.ts`, `packages/desktop/src/renderer/api.ts`, and `packages/desktop/src/renderer/platform/index.ts` expose account operations across Electron IPC without returning the session token to the renderer.
- `packages/app/src/shell/titlebar/titlebar.tsx` adds account sign-in/status/sign-out actions.
- `packages/app/src/runtime/platform/platform.tsx` connects the account state to the app runtime.
- `packages/app/src/composer/model.ts` and `packages/app/src/composer/submit.ts` gate AWMate prompt and quote submission on sign-in while leaving the draft available during sign-in. Existing personal provider connections remain supported after the account is signed in.

### Platform changes

- `migrations/0002_desktop_auth.sql` adds one-time login-code and desktop-session tables. Both credential values are stored as hashes.
- `functions/api/auth/desktop/start.ts`, `poll.ts`, `session.ts`, and `logout.ts` implement the desktop device-login lifecycle.
- `functions/api/auth/google/start.ts` and `callback.ts` carry the device code through the existing signed OAuth state and approve it after Google authentication.
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
- The Electron app was launched from `packages/desktop` with `bunx electron .` as version `2.2.5`, using `OPENCODE_TEST_ONBOARDING=1` and `OPENCODE_DESKTOP_ISOLATED_SERVER=0`. Its temporary profile is under `%TEMP%\opencode-onboarding-4d2380df-c4d2-4dac-b0ed-dfeedd4c86e5`; the app and sidecar started successfully and were left open for manual testing.

### Publication record

- AWMate commit `4aa3a005ae` (`feat(desktop): add AWMate account authentication`) and documentation commit `b01a524284` (`docs: record desktop auth rollout`) were pushed to `origin/main`.
- Platform commit `98dacb4` (`feat(auth): add desktop gateway sessions`) is committed locally on `main`, one commit ahead of `origin/main`. The configured GitHub remote `https://github.com/nxtgensec/awmate-platform.git` returned `Repository not found`, so this commit could not be pushed. Its verified build was deployed manually to Cloudflare Pages as noted above.
- `AWMATE_CHANGELOG.md` records the dated AWMate customization and push/deployment status.

### Still requires an interactive account test

- Complete Google consent from the running Electron app with an account whose gateway access is enabled.
- Confirm the app restarts after approval, displays the signed-in account and gateway state, lists the account's allowed models, and successfully returns a streamed LiteLLM response.
- Check sign-out/revocation, expired device login, and denial after gateway access is disabled.
- No distributable `.exe` was built in this task. The running local Electron app is the development build; producing a release installer is a separate packaging step after the interactive flow is verified.
