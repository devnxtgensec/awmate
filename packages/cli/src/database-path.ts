import fs from "node:fs"
import path from "node:path"
import { DatabaseSync } from "node:sqlite"
import { OPENCODE_CHANNEL } from "./version"

// Modified for AWMate: earlier builds named the database after the upstream app.
const LEGACY_NAME = "opencode"
const SUFFIXES = ["", "-wal", "-shm"] as const

export function databasePath(data: string, override = process.env.OPENCODE_DB) {
  const filename =
    override ??
    (["latest", "dev", "beta", "next", "prod"].includes(OPENCODE_CHANNEL) ||
    process.env.OPENCODE_DISABLE_CHANNEL_DB === "1" ||
    process.env.OPENCODE_DISABLE_CHANNEL_DB === "true"
      ? "awmate.db"
      : `awmate-${OPENCODE_CHANNEL.replace(/[^a-zA-Z0-9._-]/g, "-")}.db`)
  if (filename === ":memory:") return filename

  const resolved = path.resolve(data, filename)
  migrateLegacyDatabase(resolved)
  return resolved
}

// Copy the database and its write-ahead log once, so a rebrand does not lose sessions.
// The copy is verified and renamed into place atomically: a partial or corrupt file never
// becomes the database, and an interrupted migration retries on the next launch.
function migrateLegacyDatabase(target: string) {
  const source = findLegacy(target)
  if (!source) return

  if (fs.existsSync(target)) {
    if (fs.existsSync(marker(target)) || isHealthy(target)) return
    quarantine(target)
  }

  const backup = backupOnce(target, source)
  if (!copyAtomically(source, target)) return
  writeMarker(target, source, backup)
}

function findLegacy(target: string) {
  const dirs = [path.dirname(target), path.join(path.dirname(path.dirname(target)), LEGACY_NAME)]
  const names = [path.basename(target), ...legacyNames(target)]
  return dirs
    .flatMap((dir) => names.map((name) => path.join(dir, name)))
    .filter((file) => file !== target && looksLikeSqlite(file))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0]
}

function legacyNames(target: string) {
  const channel = path.basename(target).replace(/^awmate/, "").replace(/\.db$/, "")
  return [`${LEGACY_NAME}${channel}.db`, `${LEGACY_NAME}.db`]
}

function marker(target: string) {
  return `${target}.migrated.json`
}

function looksLikeSqlite(file: string) {
  try {
    if (fs.statSync(file).size < 512) return false
    const fd = fs.openSync(file, "r")
    try {
      const header = Buffer.alloc(16)
      fs.readSync(fd, header, 0, 16, 0)
      return header.toString("utf8") === "SQLite format 3\u0000"
    } finally {
      fs.closeSync(fd)
    }
  } catch {
    return false
  }
}

function isHealthy(file: string) {
  try {
    const db = new DatabaseSync(file)
    try {
      return (db.prepare("PRAGMA quick_check").get() as { quick_check?: string } | undefined)?.quick_check === "ok"
    } finally {
      db.close()
    }
  } catch {
    return false
  }
}

function quarantine(target: string) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-")
  for (const suffix of SUFFIXES) {
    if (fs.existsSync(target + suffix)) fs.renameSync(target + suffix, `${target}.corrupt-${stamp}${suffix}`)
  }
}

// Keep one recovery copy: the previous migration's backup is replaced, not accumulated.
function backupOnce(target: string, source: string) {
  const dir = path.join(path.dirname(target), "recovery")
  fs.rmSync(dir, { recursive: true, force: true })
  fs.mkdirSync(dir, { recursive: true })
  for (const suffix of SUFFIXES) {
    if (fs.existsSync(source + suffix)) copyWithRetry(source + suffix, path.join(dir, path.basename(source) + suffix))
  }
  return dir
}

// Windows keeps SQLite files locked while another server drains, so a copy can fail with
// EBUSY/EPERM during an in-place upgrade. A few short retries cover the shutdown window.
function isLocked(error: unknown) {
  const code = (error as NodeJS.ErrnoException | null)?.code
  return code === "EBUSY" || code === "EPERM"
}

function copyWithRetry(source: string, target: string) {
  for (let attempt = 0; ; attempt++) {
    try {
      fs.copyFileSync(source, target)
      return
    } catch (error) {
      if (attempt >= 4 || !isLocked(error)) throw error
      Bun.sleepSync(150 * (attempt + 1))
    }
  }
}

function copyAtomically(source: string, target: string) {
  const temp = `${target}.migrating-${process.pid}`
  try {
    for (const suffix of SUFFIXES) {
      fs.rmSync(temp + suffix, { force: true })
      if (fs.existsSync(source + suffix)) copyWithRetry(source + suffix, temp + suffix)
    }
    if (!isHealthy(temp)) {
      for (const suffix of SUFFIXES) fs.rmSync(temp + suffix, { force: true })
      return false
    }
    for (const suffix of SUFFIXES) {
      fs.rmSync(target + suffix, { force: true })
      if (fs.existsSync(temp + suffix)) fs.renameSync(temp + suffix, target + suffix)
    }
    return true
  } catch {
    for (const suffix of SUFFIXES) fs.rmSync(temp + suffix, { force: true })
    return false
  }
}

function writeMarker(target: string, source: string, backup: string) {
  const stat = fs.statSync(source)
  fs.writeFileSync(
    marker(target),
    JSON.stringify({ source, size: stat.size, mtimeMs: stat.mtimeMs, backup, at: new Date().toISOString() }, null, 2),
  )
}
