import { app } from "electron"

type Channel = "local" | "dev" | "beta" | "prod"

const raw = import.meta.env.OPENCODE_CHANNEL

export const CHANNEL: Channel = raw === "local" || raw === "dev" || raw === "beta" || raw === "prod" ? raw : "dev"

export const VERSION = app.isPackaged ? app.getVersion() : (process.env.OPENCODE_VERSION ?? app.getVersion())

const appNames = {
  local: "OpenCode Dev",
  dev: "OpenCode Dev",
  beta: "OpenCode Beta",
  prod: "OpenCode",
} satisfies Record<Channel, string>

const appIDs = {
  local: "ai.opencode.desktop.dev",
  dev: "ai.opencode.desktop.dev",
  beta: "ai.opencode.desktop.beta",
  prod: "ai.opencode.desktop",
} satisfies Record<Channel, string>

// Local renderer/server mode keeps the dev application identity.
const awmate = import.meta.env.AWMATE_BUILD === true

export const APP_NAME = awmate ? "AWMate" : app.isPackaged ? appNames[CHANNEL] : "OpenCode Dev"

export const APP_ID = awmate
  ? app.isPackaged ? "ai.awmate.desktop" : "ai.awmate.desktop.local"
  : app.isPackaged ? appIDs[CHANNEL] : "ai.opencode.desktop.dev"
