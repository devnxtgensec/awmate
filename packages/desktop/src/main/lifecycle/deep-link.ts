export function consoleReturnWindow(value: string) {
  try {
    const url = new URL(value)

    if (url.protocol !== "opencode:" || url.hostname !== "console" || url.pathname !== "/authorized") return
    const id = url.searchParams.get("window")

    if (!id || id.length > 256 || /[\u0000-\u001f\u007f]/.test(id)) return

    return id
  } catch {
    return
  }
}

export function isAWMateAuthReturn(value: string) {
  try {
    const url = new URL(value)

    // Modified for AWMate: recognize the development callback separately from the installed app callback.
    return (url.protocol === "awmate:" || url.protocol === "awmate-local:") && url.hostname === "auth" && url.pathname === "/complete"
  } catch {
    return false
  }
}
