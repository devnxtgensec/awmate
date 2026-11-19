# Dev TUI launcher: runs the source TUI on the dev channel (Windows equivalent of `bun run dev:live`).
$env:OPENCODE_TUI_CHANNEL = 'dev'
Set-Location $PSScriptRoot
bun run dev
