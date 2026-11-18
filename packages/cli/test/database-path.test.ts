import { describe, expect, test } from "bun:test"
import { Database } from "bun:sqlite"
import fs from "node:fs/promises"
import path from "node:path"
import { databasePath } from "../src/database-path"
import { tmpdir } from "./fixture/tmpdir"

describe("database path", () => {
  test("names the database after AWMate", async () => {
    await using directory = await tmpdir()

    const file = databasePath(directory.path, "awmate.db")

    expect(path.basename(file)).toBe("awmate.db")
    expect(path.dirname(file)).toBe(directory.path)
  })

  test("copies a database left behind by an earlier build", async () => {
    await using directory = await tmpdir()

    createDatabase(path.join(directory.path, "opencode.db"), "legacy")

    const file = databasePath(directory.path, "awmate.db")

    expect(readSession(file)).toBe("legacy")
    // The legacy copy stays so a failed migration can retry on the next launch.
    expect(await Bun.file(path.join(directory.path, "opencode.db")).exists()).toBe(true)
  })

  test("copies a channel database left behind by an earlier build", async () => {
    await using directory = await tmpdir()

    createDatabase(path.join(directory.path, "opencode-main.db"), "channel")

    const file = databasePath(directory.path, "awmate-main.db")

    expect(readSession(file)).toBe("channel")
  })

  test("copies a database from the legacy app folder", async () => {
    await using directory = await tmpdir()

    await fs.mkdir(path.join(directory.path, "opencode"))
    createDatabase(path.join(directory.path, "opencode", "opencode.db"), "sibling")

    const file = databasePath(path.join(directory.path, "awmate"), "awmate.db")

    expect(readSession(file)).toBe("sibling")
  })

  test("leaves an existing database alone", async () => {
    await using directory = await tmpdir()

    createDatabase(path.join(directory.path, "awmate.db"), "current")
    createDatabase(path.join(directory.path, "opencode.db"), "stale")

    expect(readSession(databasePath(directory.path, "awmate.db"))).toBe("current")
  })

  test("quarantines a corrupt database and migrates the legacy copy", async () => {
    await using directory = await tmpdir()

    await fs.writeFile(path.join(directory.path, "awmate.db"), "current")
    createDatabase(path.join(directory.path, "opencode.db"), "legacy")

    const file = databasePath(directory.path, "awmate.db")

    expect(readSession(file)).toBe("legacy")
    expect((await fs.readdir(directory.path)).some((name) => name.startsWith("awmate.db.corrupt-"))).toBe(true)
  })

  test("ignores a legacy file that is not a database", async () => {
    await using directory = await tmpdir()

    await fs.writeFile(path.join(directory.path, "opencode.db"), "current")

    const file = databasePath(directory.path, "awmate.db")

    expect(await Bun.file(file).exists()).toBe(false)
  })

  test("keeps only the last recovery copy", async () => {
    await using directory = await tmpdir()

    createDatabase(path.join(directory.path, "opencode.db"), "first")
    databasePath(directory.path, "awmate.db")

    await fs.rm(path.join(directory.path, "awmate.db"))
    await fs.rm(path.join(directory.path, "awmate.db.migrated.json"))
    updateDatabase(path.join(directory.path, "opencode.db"), "second")
    databasePath(directory.path, "awmate.db")

    expect(readSession(path.join(directory.path, "recovery", "opencode.db"))).toBe("second")
  })

  test("records where the database came from", async () => {
    await using directory = await tmpdir()

    createDatabase(path.join(directory.path, "opencode.db"), "legacy")

    const file = databasePath(directory.path, "awmate.db")
    const marker = JSON.parse(await Bun.file(`${file}.migrated.json`).text())

    expect(marker.source).toBe(path.join(directory.path, "opencode.db"))
    expect(marker.backup).toBe(path.join(directory.path, "recovery"))
  })
})

function createDatabase(file: string, id: string) {
  const db = new Database(file)
  try {
    db.exec("CREATE TABLE session (id TEXT PRIMARY KEY, title TEXT)")
    db.prepare("INSERT INTO session (id, title) VALUES (?, 'kept')").run(id)
  } finally {
    db.close()
  }
}

function updateDatabase(file: string, id: string) {
  const db = new Database(file)
  try {
    db.prepare("UPDATE session SET id = ?").run(id)
  } finally {
    db.close()
  }
}

function readSession(file: string) {
  const db = new Database(file, { readonly: true })
  try {
    return (db.query("SELECT id FROM session").get() as { id: string } | null)?.id
  } finally {
    db.close()
  }
}
