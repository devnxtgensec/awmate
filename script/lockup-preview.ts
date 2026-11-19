// Generates a standalone lockup preview using the EXACT watermark art the awmate-platform website
// carries: the glyph block from packages/tui/src/logo.ts (left + right halves, one-space gap).
import fs from "node:fs"

const LEFT = [
  "                ",
  "█▀▀█ █ █ █ █▀█▀█",
  "█▀▀█ █ █ █ █ █ █",
  "▀  ▀ ▀▀▀▀▀ ▀ ▀ ▀",
]

const RIGHT = [
  "             ",
  "█▀▀█ ▀▀█▀▀ █▀▀▀",
  "█▀▀█   █   █▀▀▀",
  "▀  ▀   ▀   ▀▀▀▀",
]

const lines = LEFT.map((line, index) => `${line} ${RIGHT[index] ?? ""}`)

const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><title>AWMate lockup preview</title>
<style>
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #0b0d10; }
  .watermark { display: grid; place-items: center; }
  pre { margin: 0; font-family: ui-monospace, "Cascadia Mono", "JetBrains Mono", Consolas, monospace; font-size: clamp(24px, 4vw, 84px); line-height: 1.02; white-space: pre; }
  .left { color: rgba(255, 255, 255, 0.4); }
  .right { color: #ffffff; }
  p.note { position: fixed; bottom: 24px; left: 0; right: 0; text-align: center; color: rgba(255,255,255,0.35); font-size: 13px; }
</style></head>
<body>
  <div class="watermark">
    <pre><span class="left">${LEFT.join("\n")}</span><span class="right">${RIGHT.join("\n")}</span></pre>
  </div>
  <p class="note">Lockup preview - the site watermark art (muted AWM + bright ATE) as the desktop wordmark</p>
</body></html>
`

fs.writeFileSync("C:/Users/Savir/OneDrive/Desktop/awmate-platform/dist/lockup-preview.html", html)
console.log("preview written: dist/lockup-preview.html")
