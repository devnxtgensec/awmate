declare const OPENCODE_CLI_NAME: string | undefined
declare const OPENCODE_CLI_TITLE: string | undefined

// The bundled CLI defines the branded command name and title. Source builds fall back to the
// AWMate names so a desktop-launched development build reads the same as a release.
export const commandName = typeof OPENCODE_CLI_NAME === "string" ? OPENCODE_CLI_NAME : "awmate"
export const productName = typeof OPENCODE_CLI_TITLE === "string" ? OPENCODE_CLI_TITLE : "AWMate"
export const awmate = commandName === "awmate"
