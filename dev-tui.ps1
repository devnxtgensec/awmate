# Dev TUI launcher: runs the source TUI on the dev channel (Windows equivalent of `bun run dev:live`).
# Strips the desktop app's inherited gateway environment so the TUI exercises its own account flow.
Remove-Item Env:OPENCODE_CONFIG_CONTENT -ErrorAction SilentlyContinue
Remove-Item Env:AWMATE_GATEWAY_SESSION -ErrorAction SilentlyContinue
Remove-Item Env:AWMATE_DESKTOP_GATEWAY_CONFIG -ErrorAction SilentlyContinue
$env:OPENCODE_TUI_CHANNEL = 'dev'
Set-Location $PSScriptRoot
bun run dev
