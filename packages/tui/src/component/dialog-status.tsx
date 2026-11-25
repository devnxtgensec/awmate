import { useTheme } from "../context/theme"
import { DialogHeader, DialogLayout } from "../ui/dialog"
import { useData } from "../context/data"
import { For, Match, Switch, Show, createMemo, createResource } from "solid-js"

type AwmateUsage = {
  account?: { email?: string; plan?: { name?: string; price?: number } }
  planUsage?: { used: number; allowance: number; remaining: number; dailyCeiling: number | null } | null
}

// The gateway session token is set in this process when an AWMate account is signed in; it reads
// the balance straight from the platform so the status dialog shows the plan and free credits.
async function loadAwmate(): Promise<AwmateUsage | undefined> {
  const token = process.env.AWMATE_GATEWAY_SESSION
  if (!token) return undefined
  const response = await fetch("https://awmate.nxtgensec.org/api/auth/desktop/session", {
    headers: { "X-AWMate-Access": "2", Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10_000),
  }).catch(() => undefined)
  if (!response?.ok) return undefined
  return (await response.json()) as AwmateUsage
}

export function DialogStatus() {
  const data = useData()
  const theme = useTheme().surface("dialog")

  const [awmate] = createResource(loadAwmate)
  const mcp = createMemo(() => data.location.mcp.server.list() ?? [])
  const color = (status: string) => {
    if (status === "connected") return theme.text.feedback.success.base
    if (status === "failed") return theme.text.feedback.error.base
    if (status === "needs_auth") return theme.text.feedback.warning.base
    return theme.text.muted
  }
  return (
    <DialogLayout header={<DialogHeader title="Status" />}>
      <Show when={awmate.loading || awmate()}>
        <box marginBottom={1}>
          <Switch>
            <Match when={awmate.loading}>
              <text fg={theme.text.muted}>AWMate: checking your plan…</text>
            </Match>
            <Match when={awmate()}>
              {(info) => (
                <box>
                  <text fg={theme.text.base}>
                    <b>AWMate</b>{" "}
                    <span style={{ fg: theme.text.muted }}>{info().account?.email}</span>
                  </text>
                  <Show when={info().planUsage}>
                    {(usage) => (
                      <text fg={theme.text.base} wrapMode="word">
                        Plan <b>{info().account?.plan?.name}</b> ·{" "}
                        {Math.min(100, Math.max(0, Math.round((usage().remaining / Math.max(1, usage().allowance)) * 100)))}
                        % left
                      </text>
                    )}
                  </Show>
                  <text fg={theme.text.muted} wrapMode="word">
                    Top up or manage keys at awmate.nxtgensec.org/account
                  </text>
                </box>
              )}
            </Match>
          </Switch>
        </box>
      </Show>
      <Show when={mcp().length > 0} fallback={<text fg={theme.text.base}>No MCP servers</text>}>
        <box>
          <text fg={theme.text.base}>
            {mcp().length} MCP server{mcp().length === 1 ? "" : "s"}
          </text>
          <For each={mcp()}>
            {(item) => (
              <box flexDirection="row" gap={1}>
                <text flexShrink={0} style={{ fg: color(item.status.status) }}>
                  •
                </text>
                <text fg={theme.text.base} wrapMode="word">
                  <b>{item.name}</b>{" "}
                  <span style={{ fg: theme.text.muted }}>
                    <Switch fallback={item.status.status}>
                      <Match when={item.status.status === "connected"}>Connected</Match>
                      <Match when={item.status.status === "failed" && item.status}>{(val) => val().error}</Match>
                      <Match when={item.status.status === "disabled"}>Disabled in configuration</Match>
                      <Match when={item.status.status === "needs_auth" && item.status}>
                        {(val) => `Needs authentication: ${val().error}`}
                      </Match>
                    </Switch>
                  </span>
                </text>
              </box>
            )}
          </For>
        </box>
      </Show>
    </DialogLayout>
  )
}
