// Publishes the AWMate CLI to npm: one platform package per release target plus the launcher
// package `@awmate/cli`, whose postinstall copies the right platform binary into place.
// Env: VERSION, RELEASE_DIR (awmate-cli-* binaries), NPM_TOKEN/NODE_AUTH_TOKEN, and optionally
// ONLY (space-separated target filter, e.g. "darwin-arm64 darwin-x64 darwin-x64-baseline" for the
// darwin-only job). Missing binaries are skipped with a warning; the launcher publishes only in
// full mode, and an already-published version is treated as success.

import childProcess from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import url from "node:url"

const root = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), "..")
const version = process.env.VERSION
const releaseDir = process.env.RELEASE_DIR
const token = process.env.NPM_TOKEN ?? process.env.NODE_AUTH_TOKEN
const only = process.env.ONLY?.split(" ").filter(Boolean)
if (!version || !releaseDir || !token) throw new Error("VERSION, RELEASE_DIR and NPM_TOKEN (or NODE_AUTH_TOKEN) are required")

const targets = [
  { target: "darwin-arm64", os: "darwin", cpu: "arm64", exe: false },
  { target: "darwin-x64", os: "darwin", cpu: "x64", exe: false },
  { target: "darwin-x64-baseline", os: "darwin", cpu: "x64", exe: false },
  { target: "linux-arm64", os: "linux", cpu: "arm64", exe: false },
  { target: "linux-x64", os: "linux", cpu: "x64", exe: false },
  { target: "linux-x64-baseline", os: "linux", cpu: "x64", exe: false },
  { target: "windows-arm64", os: "win32", cpu: "arm64", exe: true },
  { target: "windows-x64", os: "win32", cpu: "x64", exe: true },
  { target: "windows-x64-baseline", os: "win32", cpu: "x64", exe: true },
].filter((item) => !only || only.includes(item.target))

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

// The launcher publishes only in full mode, and only after every optional dependency is verifiably
// on npm - a launcher referencing an unpublished platform package breaks installs on that platform
// (the 2.2.50 release shipped while the darwin packages were missing, and every mac install failed).
if (!only) {
  const missing = []
  for (const [name, depVersion] of Object.entries(optionalDependencies)) {
    const view = childProcess.spawnSync("npm", ["view", `${name}@${depVersion}`, "version"], {
      encoding: "utf8",
      shell: process.platform === "win32",
    })
    if (!(view.status === 0 && view.stdout.trim() === depVersion)) missing.push(`${name}@${depVersion}`)
  }
  if (missing.length) throw new Error(`Platform packages not on npm yet: ${missing.join(", ")} - the launcher is withheld; the retry will publish it`)

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
    optionalDependencies,
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
} else if (skipped.length) {
  console.warn(`platform packages skipped (binaries missing): ${skipped.join(", ")} - the retry will publish them`)
}
