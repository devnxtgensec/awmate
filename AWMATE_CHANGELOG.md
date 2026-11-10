# AWMate Change Log

This file records AWMate-specific changes included in pushes so maintainers can distinguish them from upstream OpenCode code. Add a dated entry whenever AWMate changes are pushed.

## 2026-11-10 — Desktop OAuth return and Windows protocol launch

### Changes

- Modified for AWMate: route completed desktop Google OAuth back to the running app with the dedicated `awmate://auth/complete` protocol; normal website sign-in still returns to `/account`.
- Modified for AWMate: register the Windows development protocol with the Electron entry script, fixing path truncation when launching from a directory containing spaces.
- Modified for AWMate: keep Electron running after sign-in/sign-out and restart only the isolated AWMate CLI sidecar so it reloads the account's gateway configuration.
- Modified for AWMate: force AWMate builds to isolate their CLI sidecar from OpenCode processes.
- Updated `AWMATE_ACCOUNT_AUTH.md` with the callback, protocol registration, sidecar behavior, and verification notes.

### Verification

- Desktop/app typechecks passed and the AWMate desktop production build passed.
- A live Google consent and gateway response remain to be verified with an enabled account.

### Push and deployment record

- AWMate commit `098f194839` was pushed to `origin/main`.
- Platform source commit `5c249bc` is committed locally; the configured GitHub remote returned `Repository not found` on push.
- The platform build was manually deployed to Cloudflare Pages at `https://26b03cc2.awmate-platform.pages.dev`.

## 2026-11-09 — Desktop Google sign-in and gateway access

### Changes

- Added Google sign-in, account status, and sign-out to the Electron Account menu. Desktop sessions are encrypted with Electron `safeStorage` and are revoked on sign-out.
- Require AWMate sign-in before the desktop accepts a query or quote reply. The editor draft remains available while the user completes browser sign-in.
- Load only the account's enabled LiteLLM models into the AWMate provider through the platform's authenticated proxy. Gateway requests are checked against current account access and LiteLLM enforces user budgets.
- Added the device login flow, session endpoints, D1 migration, and OpenAI-compatible gateway proxy to `awmate-platform`.
- Added the end-to-end flow and rollout notes in `AWMATE_ACCOUNT_AUTH.md`.

### Verification

- AWMate Electron production build and desktop/app typechecks passed. The Windows checkout's generated declaration symlink was temporarily materialized for typechecking and restored.
- Platform production build and Cloudflare function typecheck passed.
- D1 remote migration `0002_desktop_auth.sql` applied successfully.
- Production Google OAuth approval and streamed LiteLLM requests still require a live desktop sign-in to verify.

### Push record

- AWMate source commit `4aa3a005ae` was pushed to `origin/main`.
- Platform source commit `98dacb4` is committed locally; GitHub rejected the configured `nxtgensec/awmate-platform` remote with `Repository not found`.
- The verified platform build was deployed manually to Cloudflare Pages production. Deployment: `https://7fb5b9f8.awmate-platform.pages.dev`.
- Production smoke checks confirmed desktop login start returns a login URL and expiry, while unauthenticated desktop-session and gateway requests return HTTP 401.
- The rebuilt Electron app runs locally as version `2.2.5` using an isolated temporary profile. Completing Google consent and a real gateway request still requires the user to sign in with an enabled account.

## 2026-11-08 — Project sidebar and account menu

### Changes

- Replaced the Windows hamburger menu with Back, Forward, Sidebar, File, Edit, View, and Help controls, and widened the dropdown menus to prevent labels from colliding with keyboard shortcuts.
- Set new profiles to use vertical side tabs and project organization by default. Project mode shows session threads nested under their project folders and hides the duplicate flat tab list.
- Restyled the sidebar footer as an AWMate local-workspace account row. Its menu contains only Settings and Help.
- Removed the Home navigation row and the duplicate Settings/Help links from the Home project view. The Home route remains available as the app's startup and empty-state route.
- Added `"Modified for AWMate"` comments at the primary customization points.
- Added or updated the OpenCode architecture and frontend reference notes: `OPENCODE_ARCHITECTURE.md` and `OPENCODE_FRONTEND_ARCHITECTURE.md`.

### Verification

- Focused Playwright UI checks passed: vertical sidebar navigation, Windows menu behavior and spacing, project folders with nested chats and no duplicate tab rows, and the Account menu's Settings/Help actions.
- `git diff --check` passed.
- The Electron dev app was opened with isolated data under `%TEMP%\awmate-second-dev`; that local profile's sidebar preference was changed from `One list` to `Projects` to verify the grouped view. No `.exe` package was built.

### Push record

- Requested target branch: `main`.
- The local `main` commit is ready; pushing it to `origin/main` was rejected with HTTP 403 because the configured GitHub identity does not have write access to `devnxtgensec/awmate`.
- Retrying with `devnxtgensec` as the HTTPS remote username still authenticated as `nxtgensec` and was rejected with HTTP 403; the account identity comes from the credential, not the remote URL username.
- A fallback attempt to use `GH_TOKEN` from the ignored `.env.local` file was blocked by tool policy. The value was not printed, added to the repository, or used in the push attempt.
- An earlier push attempt was rejected with HTTP 403 before the GitHub account with write access was authenticated.
- After signing Git Credential Manager into the account with repository write access, the push succeeded to `origin/main` at commit `c359b5b20b`.
- Updated the local Bun installation from `1.4.2` to the repository-required `1.4.4` so the pre-push hook could run.
- This Windows checkout cannot create tracked symlinks without symlink privilege. For the pre-push checks, `packages/app/src/custom-elements.d.ts` was temporarily materialized from its symlink target and then restored; that temporary file was not committed.
- The pre-push lint and type-check completed successfully. Lint emitted warnings; type-check reported no errors.
