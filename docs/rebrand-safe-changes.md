# AWMate Rebrand — Safe-Category Changes (2026-11-25)

This documents the "safe" slice of the OpenCode→AWMate reference cleanup: user-visible
strings and docs that needed no compatibility layer, no migration, and no wire-format
changes. Internal package names, env vars, and legacy file names were deliberately left
alone (see "What was NOT changed" at the bottom).

## 1. App i18n strings (user-visible)

**`packages/app/src/runtime/i18n/en.ts`** — 23 copy changes, done key-by-key:
- Settings descriptions: theme, color scheme, language, project name, extensions (MCPs/plugins/skills), workspaces — "OpenCode" → "AWMate"
- Pairing / server connect: "This is not an AWMate pairing code. Scan the code shown by awmate pair.", outdated/incompatible-server messages → AWMate + `awmate pair`
- Error copy: error page report prefix, MCP auth note, config check
- `voice.assistant` label, "Connect services so AWMate can use them", "Free models provided by AWMate", API-key/OAuth/ChatGPT connect copy, remote-server credentials copy
- `settings.about.description` → "AWMate, the AI coding agent"; `settings.about.website` → `awmate.nxtgensec.org` (all locales)

**63 locale files + `desktop-native.ts`** (~1,570 lines): mechanical pass with a keep-set.
- Latin `OpenCode` → `AWMate`, `opencode pair/service/run/auth/upgrade` → `awmate …`, `opencode2` → `awmate`, `www.opencode.ai` → `awmate.nxtgensec.org`
- Phonetic product names translated to AWMate: `ओपनकोड` (hi, ne), `ওপেনকোড` (bn)
- Stragglers where locales reordered the sentence ("pasangan opencode", "парой opencode") and `'opencode'`/`'opencode2'` command names in install dialogs

**Intentionally kept as "OpenCode"** (real upstream integrations, not stale branding):
`OpenCode Console`, `OpenCode Go`, `OpenCode Free`, `OpenCode Zen`, the `OpenCode` provider
and its tagline/note, `command.provider.connect.description`, usage/Console/Go copy, and the
`settings.about.trademark` line ("OpenCode is a registered trademark of Anomaly Innovations, Inc.").

## 2. Skill doc (`packages/core/src/plugin/skill/opencode.md`)

- All `https://opencode.ai/docs/...` links remapped to the deployed AWMate docs app
  (`https://awmate.nxtgensec.org/docs/...`); each target verified to exist in the docs
  app's NAV/routes before writing (flat routes: plugins, sdk, server, keybinds, cli, …)
- `https://opencode.ai/docs/llms.txt` → `https://awmate.nxtgensec.org/docs/llms.txt` (exists)
- `https://opencode.ai/config.json` → `https://awmate.nxtgensec.org/config.json` (exists, 200)
- Config file references → `awmate.json(c)` (incl. `.opencode/awmate.json(c)` — the
  `.opencode/` directory follows the same name list, legacy `opencode.json` still read)
- Data/log paths → `~/.local/share/awmate/log/awmate.log`, command names → `awmate mcp/service/api/run/upgrade/--standalone`
- Product name → AWMate throughout

## 3. CLI user-visible strings

- `stats` footer: `opencode.ai` → `awmate.nxtgensec.org`
- ACP (`packages/cli/src/acp/`): agent name → `productName`; `agentInfo.name` → `"AWMate"`;
  auth method "Login with AWMate" / "Run `awmate auth login` in the terminal" (wire id
  `opencode-login` kept); terminal-auth command → `awmate auth login`, label "AWMate Login";
  "AWMate server is unavailable"; "AWMate prompt failed"
- `pair.ts`: all hints → `awmate pair` / `awmate service set …`; "expose your AWMate server"
- `service-config.ts`: five `Usage: awmate service …` error strings
- `mcp/auth.ts`: "Add one with `awmate mcp add` or in awmate.json"
- `remote-tunnel.ts`, `updater` paths, `default.ts` update error, `acp/translate.ts`
- Update-preflight: "AWMate update could not start the new background service"

## 4. TUI user-visible strings

- `error-details.ts` debugging prompts → "this AWMate component" / "global AWMate configuration"
- `util/error.ts` → "Try: `awmate models`"
- Storybook highlights → `awmate pair`
- Kept: "Connected OpenCode Console" toast and Go upsell copy (upstream service names),
  `provider === "opencode" → "OpenCode"` display (upstream provider), theme key `opencode`

## 5. Core model-visible strings

- Claude Code harness: runtime_info "You are running in AWMate through the Claude Code
  harness", "Agent role (from AWMate)", catch-up checkpoint "conversation history from
  AWMate", tool-server connection errors
- `initialize.txt` command prompt: "repo-local AWMate config such as `awmate.json`"
- `nvidia.ts`: `X-BILLING-INVOKE-ORIGIN` default → `"AWMate"` (truthful origin; provider
  headers can still override)
- Kept: all OpenCode Console/Go watch strings (`opencode-watches.ts`, `opencode.ts`),
  `agentName = "OpenCode"` in `chatgpt.ts` (sent to OpenAI's OAuth consent as
  `agent_name_hint` — external wire value, left for category 🟡)

## 6. Stale test expectations fixed

Tests that still asserted the old strings after the earlier rebrand landed:
- `core/test/app.test.ts` — user agent `awmate/beta/1.2.3/sdk`
- `cli/test/auth.test.ts` — help output `awmate auth list/login/logout [flags]`
- `cli/test/server-connection.test.ts` — 23 command-path expectations → `awmate …`
- `cli/test/service-lifecycle.test.ts` — `awmate service set port <port>` hint
- `cli/test/pair-remote-consent.test.ts` — AWMate copy block
- `cli/test/acp/session.test.ts` + `error.test.ts` — auth methods, agentInfo, error message
- `tui/test/app-lifecycle.test.tsx` — terminal title "AWMate", epilogue `awmate -s dummy`

## What was NOT changed (and why)

| Item | Why left |
|---|---|
| `@opencode/*` npm scope / imports (~21k) | Internal names, invisible to users; renaming breaks upstream merges and in-flight work |
| `OPENCODE_*` env vars (~2.7k) | Scripts/CI depend on them; add `AWMATE_*` aliases later (category 🟡) |
| `opencode.json` legacy config name | Still read by design (`legacyNames` in discovery.ts) |
| `opencode-login` ACP auth method id, `opencode/*` wire metas | External ACP clients may match on them |
| `anomalyco/opencode` links | MIT license attribution + provenance (issue/PR references) |
| `packages/web`, `services/`, `.vscode`, upstream-only paths | Not built/shipped by AWMate; kept for merge-ability |
| `.opencode/` project dir convention | Ecosystem-standard; `.awmate/` already read first |
| Desktop "OpenCode Dev/Beta" channel names | Only used in non-AWMate dev builds |
| Desktop app `Title` fallback `"OpenCode"` | Non-AWMate dev builds only; AWMate builds show "AWMate" |

## Verification

- `bun typecheck` clean in `packages/core`, `packages/cli`, `packages/tui`, `packages/app`
- Tests run and passing: `cli` auth/acp-error/acp-session/pair-remote-consent, `tui` app-lifecycle
  (terminal title), `core` app.test
- Full `core` suite has ~510 pre-existing failures **on the clean tree** (verified by
  `git stash` + rerun: e.g. `preload.test.ts` fails identically without these changes) —
  environmental, unrelated to this work
- i18n keys unchanged (values only), so no locale-completeness impact
