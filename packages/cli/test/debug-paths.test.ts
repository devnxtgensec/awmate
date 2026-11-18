import { describe, expect, test } from "bun:test"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { isolatedEnv } from "./fixture/environment"

describe("debug paths command", () => {
  test("is included in troubleshooting help", async () => {
    const [debug, paths] = await Promise.all([cli(["debug", "--help"]), cli(["debug", "paths", "--help"])])

    expect(debug.exitCode).toBe(0)
    expect(debug.stdout).toContain("paths")
    expect(debug.stdout).toContain("Show global paths (data, config, cache, state)")
    expect(paths.exitCode).toBe(0)
    expect(paths.stdout).toContain("awmate debug paths [flags]")
  })

  test("prints resolved global paths without starting a server", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "opencode-debug-paths-"))

    try {
      // A desktop-launched shell exports its own runtime root and database, so clear them and
      // point every XDG root at the temporary directory instead of inheriting the app's paths.
      const result = await cli(
        ["debug", "paths"],
        isolatedEnv(root, {
          AWMATE_RUNTIME_ROOT: undefined,
          OPENCODE_CONFIG_DIR: undefined,
          OPENCODE_DB: undefined,
          OPENCODE_DISABLE_CHANNEL_DB: "1",
          XDG_DATA_HOME: path.join(root, "data"),
          XDG_CONFIG_HOME: path.join(root, "config"),
          XDG_CACHE_HOME: path.join(root, "cache"),
          XDG_STATE_HOME: path.join(root, "state"),
        }),
      )
      const paths = Object.fromEntries(
        result.stdout
          .trim()
          .split("\n")
          .map((line) => line.trim().split(/\s+/, 2)),
      )

      expect({ exitCode: result.exitCode, stderr: result.stderr }).toEqual({ exitCode: 0, stderr: "" })
      expect(paths).toMatchObject({
        home: root,
        data: path.join(root, "data", "awmate"),
        config: path.join(root, "config", "awmate"),
        cache: path.join(root, "cache", "awmate"),
        state: path.join(root, "state", "awmate"),
        bin: path.join(root, "cache", "awmate", "bin"),
        log: path.join(root, "data", "awmate", "log"),
        repos: path.join(root, "data", "awmate", "repos"),
        db: path.join(root, "data", "awmate", "awmate.db"),
      })
      expect(paths.tmp).toBeTruthy()
      expect(await Bun.file(path.join(root, "state", "awmate", "service-local.json")).exists()).toBe(false)
    } finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  })
})

async function cli(args: string[], env?: Record<string, string | undefined>) {
  const child = Bun.spawn([process.execPath, "run", path.join(import.meta.dir, "../src/index.ts"), ...args], {
    cwd: path.join(import.meta.dir, ".."),
    env: { ...process.env, ...env },
    stdout: "pipe",
    stderr: "pipe",
  })
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ])
  return { stdout, stderr, exitCode }
}
