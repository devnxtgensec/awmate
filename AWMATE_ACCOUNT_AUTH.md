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

## Verification and rollout

- Platform frontend build and Cloudflare function typecheck pass locally.
- Electron production build and desktop package typecheck pass locally.
- Apply D1 migration `0002_desktop_auth.sql`, deploy the platform code, then test Google approval, signed-out prompt gating, allowed model selection, expired login, session revocation, disabled gateway access, and streamed LiteLLM responses before publishing an Electron release.
- Do not deploy the gateway proxy while its production D1 migration is unapplied.
