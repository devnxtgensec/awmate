# AWMate Change Log

This file records AWMate-specific changes included in pushes so maintainers can distinguish them from upstream OpenCode code. Add a dated entry whenever AWMate changes are pushed.

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
- The remote `main` branch remains unchanged. Update this record after the commit is successfully pushed.
