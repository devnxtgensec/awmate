import { intro, log, outro } from "@clack/prompts"
import { Effect } from "effect"
import { Commands } from "../commands"
import { Runtime } from "../../framework/runtime"
import { ensureAccount } from "../../services/awmate-account"
import { openUrl } from "@opencode/util/open"
import { errorMessage } from "../../util/error"

export default Runtime.handler(
  Commands.commands.login,
  Effect.fn("cli.login")(function* () {
    intro("Sign in to AWMate")
    const outcome = yield* Effect.tryPromise({
      try: () => ensureAccount((text) => log.info(text)),
      catch: (cause) => new Error(errorMessage(cause)),
    }).pipe(Effect.catch(() => Effect.succeed("failed" as const)))
    if (outcome === "applied") {
      outro("The AWMate Gateway is active. Start AWMate to use your plan's models.")
      return
    }
    if (outcome === "unavailable") {
      log.message("Your account could not enable the gateway yet. AWMate opens the account page so you can review its status.")
      yield* Effect.try(() => openUrl("https://awmate.nxtgensec.org/account")).pipe(Effect.ignore)
      return
    }
    log.message("Sign-in did not complete. Run `awmate login` to try again.")
  }),
)
