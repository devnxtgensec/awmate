import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

export async function tmpdir() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "opencode-cli-test-"))
  return {
    path: directory,
    async [Symbol.asyncDispose]() {
      await remove(directory)
    },
  }
}

// Bun's callback APIs expose short paths and can hang during recursive removal on Windows.
// A database handle can also outlive close() until the next collection, so retry after a GC.
async function remove(dir: string, retries = 30): Promise<void> {
  try {
    await rm(dir, { recursive: true, force: true })
  } catch (error) {
    if (retries === 0 || !error || typeof error !== "object" || !("code" in error) || error.code !== "EBUSY")
      throw error
    Bun.gc(true)
    await Bun.sleep(100)
    return remove(dir, retries - 1)
  }
}
