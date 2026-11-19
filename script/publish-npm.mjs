// Publishes the AWMate CLI to npm: one platform package per release target plus the launcher
// package `@awmate/cli`, whose postinstall copies the right platform binary into place.
// Env: VERSION, RELEASE_DIR (awmate-cli-* binaries), NPM_TOKEN/NODE_AUTH_TOKEN, and optionally
// ONLY (space-separated target filter, e.g. "darwin-arm64 darwin-x64 darwin-x64-baseline" for the
// darwin-only job) or LAUNCHER_ONLY=1 to publish just the launcher. Missing binaries are skipped
// with a warning; the launcher publishes in full mode or LAUNCHER_ONLY mode, and an
// already-published version is treated as success.

import childProcess from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import url from "node:url"

const root = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), "..")
const version = process.env.VERSION
const releaseDir = process.env.RELEASE_DIR
const token = process.env.NPM_TOKEN ?? process.env.NODE_AUTH_TOKEN
const only = process.env.ONLY?.split(" ").filter(Boolean)
const launcherOnly = process.env.LAUNCHER_ONLY === "1"
if (!version || !token || (!launcherOnly && !releaseDir)) throw new Error("VERSION, NPM_TOKEN (or NODE_AUTH_TOKEN) and - unless LAUNCHER_ONLY=1 - RELEASE_DIR are required")

const allTargets = [
  { target: "darwin-arm64", os: "darwin", cpu: "arm64", exe: false },
  { target: "darwin-x64", os: "darwin", cpu: "x64", exe: false },
  { target: "darwin-x64-baseline", os: "darwin", cpu: "x64", exe: false },
  { target: "linux-arm64", os: "linux", cpu: "arm64", exe: false },
  { target: "linux-x64", os: "linux", cpu: "x64", exe: false },
  { target: "linux-x64-baseline", os: "linux", cpu: "x64", exe: false },
  { target: "windows-arm64", os: "win32", cpu: "arm64", exe: true },
  { target: "windows-x64", os: "win32", cpu: "x64", exe: true },
  { target: "windows-x64-baseline", os: "win32", cpu: "x64", exe: true },
]
const targets = launcherOnly ? [] : allTargets.filter((item) => !only || only.includes(item.target))

const outDir = path.resolve("dist-npm")
fs.rmSync(outDir, { recursive: true, force: true })
fs.mkdirSync(outDir, { recursive: true })

function npm(args, cwd = root) {
  const result = childProcess.spawnSync("npm", args, {
    cwd,
    stdio: "inherit",
    env: { ...process.env },
    shell: process.platform === "win32",
  })
  return result.status
}

const optionalDependencies = {}
const published = []
const skipped = []
for (const { target, os, cpu, exe } of targets) {
  const asset = `awmate-cli-${target}${exe ? ".exe" : ""}`
  const source = path.join(releaseDir, asset)
  if (!fs.existsSync(source)) {
    console.warn(`skipping ${target}: ${asset} is missing from the release directory`)
    skipped.push(target)
    continue
  }
  const name = `@awmate/cli-${target}`
  optionalDependencies[name] = version
  const packageDir = path.join(outDir, target)
  fs.mkdirSync(path.join(packageDir, "bin"), { recursive: true })
  // One binary per package: the Windows postinstall resolves bin/awmate.exe, unix resolves
  // bin/awmate. Duplicating both would exceed npm's 500 MB unpacked limit on Windows targets.
  fs.copyFileSync(source, path.join(packageDir, "bin", exe ? "awmate.exe" : "awmate"))
  if (!exe) fs.chmodSync(path.join(packageDir, "bin", "awmate"), 0o755)
  const manifest = {
    name,
    version,
    description: "AWMate CLI binary for this platform",
    license: "MIT",
    repository: { type: "git", url: "git+https://github.com/devnxtgensec/awmate.git" },
    os: [os],
    cpu: [cpu],
    files: ["bin"],
  }
  fs.writeFileSync(path.join(packageDir, "package.json"), JSON.stringify(manifest, null, 2))
  const status = npm(["publish", "--access", "public", "--loglevel=error"], packageDir)
  // An already-published version (a re-run after a partial publish) is success, not a failure.
  if (status !== 0) {
    const view = childProcess.spawnSync("npm", ["view", `${name}@${version}`, "version"], {
      encoding: "utf8",
      shell: process.platform === "win32",
    })
    if (view.status === 0 && view.stdout.trim() === version) console.warn(`${name}@${version} already on npm; continuing`)
    else throw new Error(`npm publish failed for ${name}`)
  }
  published.push(name)
  console.log(`published ${name}@${version}`)
}

// The launcher references every platform package at this version, so it publishes either in full
// mode (all binaries present and published in this run) or in LAUNCHER_ONLY mode (the platform
// packages were published by the publish-npm and publish-npm-darwin jobs, whose success gates this
// run). Do NOT verify with `npm view` here: the registry lags minutes behind fresh publishes,
// which false-negatived every package and wrongly withheld the launcher.
function publishLauncher(deps) {
  const launcherDir = path.join(outDir, "cli")
  fs.mkdirSync(path.join(launcherDir, "bin"), { recursive: true })
  fs.copyFileSync(path.join(root, "script", "npm", "postinstall.mjs"), path.join(launcherDir, "postinstall.mjs"))
  const manifest = {
    name: "@awmate/cli",
    // Windows must be able to spawn the binary directly, so the bin target carries .exe on every
    // platform - unix executes an ELF named .exe without caring about the extension.
    bin: { awmate: "./bin/awmate.exe" },
    scripts: { postinstall: "node ./postinstall.mjs" },
    version,
    description: "AWMate (Assistive Workmate) — the coding agent CLI",
    license: "MIT",
    repository: { type: "git", url: "git+https://github.com/devnxtgensec/awmate.git" },
    os: ["darwin", "linux", "win32"],
    cpu: ["arm64", "x64"],
    optionalDependencies: deps,
  }
  fs.writeFileSync(path.join(launcherDir, "package.json"), JSON.stringify(manifest, null, 2))
  const status = npm(["publish", "--access", "public", "--loglevel=error"], launcherDir)
  if (status !== 0) {
    const view = childProcess.spawnSync("npm", ["view", `@awmate/cli@${version}`, "version"], {
      encoding: "utf8",
      shell: process.platform === "win32",
    })
    if (!(view.status === 0 && view.stdout.trim() === version)) throw new Error(`npm publish failed for @awmate/cli`)
  }
  console.log(`published @awmate/cli@${version}`)
}

if (launcherOnly) {
  publishLauncher(Object.fromEntries(allTargets.map(({ target }) => [`@awmate/cli-${target}`, version])))
} else if (!only && skipped.length === 0) {
  publishLauncher(optionalDependencies)
} else if (skipped.length) {
  console.warn(`platform packages skipped (binaries missing): ${skipped.join(", ")} - the launcher is withheld this run; the publish-launcher job publishes it`)
}
