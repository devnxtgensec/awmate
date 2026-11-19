// Publishes the AWMate CLI to npm: one platform package per release target plus the launcher
// package `@awmate/cli`, whose postinstall copies the right platform binary into place.
// Env: VERSION (release version), RELEASE_DIR (directory with the awmate-cli-* binaries),
// NPM_TOKEN (automation token). Run from the repository root with node script/publish-npm.mjs.

import childProcess from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import url from "node:url"

const root = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), "..")
const version = process.env.VERSION
const releaseDir = process.env.RELEASE_DIR
// The workflow passes the npm token as NODE_AUTH_TOKEN (used by the .npmrc expansion); accept the
// direct name too so the script also works when run manually with NPM_TOKEN.
const token = process.env.NPM_TOKEN ?? process.env.NODE_AUTH_TOKEN
if (!version || !releaseDir || !token) throw new Error("VERSION, RELEASE_DIR and NPM_TOKEN are required")

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
]

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
  if (result.status !== 0) throw new Error(`npm ${args.join(" ")} failed with exit code ${result.status}`)
}

// Publish expects an auth line in the user .npmrc; the workflow writes it from NODE_AUTH_TOKEN.

const optionalDependencies = {}
for (const { target, os, cpu, exe } of targets) {
  const asset = `awmate-cli-${target}${exe ? ".exe" : ""}`
  const source = path.join(releaseDir, asset)
  if (!fs.existsSync(source)) throw new Error(`Release binary missing: ${source}`)
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
  npm(["publish", "--access", "public", "--loglevel=error"], packageDir)
  console.log(`published ${name}@${version}`)
}

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
npm(["publish", "--access", "public", "--loglevel=error"], launcherDir)
console.log(`published @awmate/cli@${version}`)
