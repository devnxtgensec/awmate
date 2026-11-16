import { For, Show, createEffect, createMemo, createSignal, onCleanup, untrack } from "solid-js"
import { makeEventListener } from "@solid-primitives/event-listener"
import { createMediaQuery } from "@solid-primitives/media"
import { Button } from "@opencode/ui/button"
import { useDialog } from "@opencode/ui/context/dialog"
import { Icon } from "@opencode/ui/icon"
import { Keybind } from "@opencode/ui/keybind"
import { Menu } from "@opencode/ui/menu"
import { Slash } from "@opencode/ui/slash"
import { Tooltip } from "@opencode/ui/tooltip"
import { ComposerEditor } from "./editor/editor"
import { DialogSelectModel, ModelSelectorDrawer } from "@/providers/models/select-dialog"
import { DialogSelectModelUnpaid } from "@/providers/models/unpaid"
import { gatewayOrder, isGateway } from "@/providers/models/gateway"
import { formatKeybind, useCommand } from "@/shell/commands/command"
import { useLanguage } from "@/runtime/i18n/language"
import type { ComposerModel } from "./model"
import type { ComposerModelLabel } from "./model-label"
import {
  createModelChipState,
  selectModelChipPending,
  transitionModelChip,
  type ModelChipEvent,
} from "./model-chip-machine"

export function Composer(props: {
  class?: string
  model: ComposerModel
  borderUnderlay?: boolean
  readOnly?: boolean
  suggestionBoundary?: () => HTMLElement | undefined
}) {
  const dialog = useDialog()
  const command = useCommand()
  const language = useLanguage()

  const modelName = () => {
    const preview = props.model.model.preview

    if (preview) return preview.model
    const selection = props.model.model.selection
    const model = selection.current()

    if (model) return model.name
    const key = selection.key()

    if (key) return language.t("dialog.model.unavailable", { model: key.modelID })

    return language.t("dialog.model.select.title")
  }

  const modelLabel = () => {
    const preview = props.model.model.preview
    const label = preview ? preview.label : props.model.model.label

    // Modified for AWMate: the gateway name sits beside the chip, so the chip shows only the model.
    if (import.meta.env.AWMATE_BUILD === "true" && isGateway(props.model.model.selection.key()?.providerID))
      return { model: label?.model ?? modelName() }

    if (label) return label

    return { provider: preview ? preview.provider : props.model.model.providerName, model: modelName() }
  }

  // Modified for AWMate: the label follows the selected gateway instead of always reading AWMate Gateway.
  const gatewayName = () => {
    const preview = props.model.model.preview

    if (preview?.provider) return preview.provider

    return props.model.model.selection.current()?.provider.name ?? language.t("awmate.gateway.name")
  }

  // Modified for AWMate: the gateways this account was granted, read from the models the desktop allows.
  const gateways = createMemo(() => {
    const seen = new Map<string, string>()

    for (const item of props.model.model.selection.list()) {
      if (isGateway(item.provider.id) && !seen.has(item.provider.id)) seen.set(item.provider.id, item.provider.name)
    }

    return [...seen]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => gatewayOrder.indexOf(a.id) - gatewayOrder.indexOf(b.id))
  })

  // Modified for AWMate: switching gateway returns to the model that gateway was last used with.
  const switchGateway = (providerID: string) => {
    const selection = props.model.model.selection

    const target =
      selection.recent().find((item) => item?.provider.id === providerID) ??
      selection.list().find((item) => item.provider.id === providerID)

    if (target) selection.set({ providerID: target.provider.id, modelID: target.id }, { recent: true })
  }

  return (
    <div class="flex flex-col gap-3">
      <ComposerEditor
        controller={props.model}
        borderUnderlay={props.borderUnderlay}
        readOnly={props.readOnly}
        class={props.class}
        modelControlsVisible={!props.model.model.loading || !!props.model.model.preview}
        attachKeybind={command.keybindParts("file.attach")}
        attachShortcut={command.keybind("file.attach")}
        alternateKeybind={[formatKeybind("mod", language.t), "↵"]}
        exitShellKeybind={[formatKeybind("esc", language.t)]}
        suggestionBoundary={props.suggestionBoundary}
        modelControl={
          <>
            <Show when={import.meta.env.AWMATE_BUILD === "true"}>
              <Show
                when={gateways().length > 1}
                fallback={<span class="truncate px-1 text-xs text-v2-text-text-muted">{gatewayName()}</span>}
              >
                <Menu placement="top-start" gutter={6} modal={false}>
                  <Menu.Trigger
                    data-action="composer-gateway"
                    aria-label={language.t("awmate.gateway.choose")}
                    class="flex shrink-0 items-center gap-1 rounded-[6px] px-1 text-xs leading-[var(--line-height-compact)] text-v2-text-text-muted transition-colors hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-text-text-base focus-visible:bg-v2-overlay-simple-overlay-hover focus-visible:text-v2-text-text-base focus-visible:outline-none data-[expanded]:bg-v2-overlay-simple-overlay-hover data-[expanded]:text-v2-text-text-base"
                  >
                    <span class="truncate">{gatewayName()}</span>
                    <Icon name="chevron-down" size="small" />
                  </Menu.Trigger>
                  <Menu.Portal>
                    <Menu.Content>
                      <Menu.RadioGroup
                        value={props.model.model.selection.key()?.providerID}
                        onChange={(providerID) => switchGateway(providerID)}
                      >
                        <For each={gateways()}>
                          {(item) => (
                            <Menu.RadioItem value={item.id} closeOnSelect>
                              {item.name}
                            </Menu.RadioItem>
                          )}
                        </For>
                      </Menu.RadioGroup>
                    </Menu.Content>
                  </Menu.Portal>
                </Menu>
              </Show>
            </Show>
            <ComposerModelControl
              loading={props.model.model.loading}
              preview={!!props.model.model.preview}
              paid={props.model.model.paid}
              title={language.t("command.model.choose")}
              keybind={command.keybindParts("model.choose")}
              model={props.model.model.selection}
              label={modelLabel()}
              onClose={props.model.restoreFocus}
              onUnpaidClick={() => dialog.show(() => <DialogSelectModelUnpaid model={props.model.model.selection} />)}
            />
          </>
        }
      />
    </div>
  )
}

function ComposerModelControl(props: {
  loading: boolean
  preview: boolean
  paid: boolean
  title: string
  keybind: string[]
  model: ComposerModel["model"]["selection"]
  label: ComposerModelLabel
  onClose: () => void
  onUnpaidClick: () => void
}) {
  // A preview paints the chip in its resting state, and the loaded names replace it in place.
  const shouldAnimate = createMemo<boolean>((previous) => previous ?? (props.loading && !props.preview))
  const mobile = createMediaQuery("(max-width: 767px)")
  const dialog = useDialog()

  // Modified for AWMate: the model dialog lists only the selected gateway's models.
  const gateway = () => {
    const provider = props.model.key()?.providerID

    return isGateway(provider) ? provider : undefined
  }

  const open = (detail: number) => {
    const provider = props.model.key()?.providerID

    // Modified for AWMate: an account granted OpenCode reaches it from the gateway menu beside the chip.
    if (import.meta.env.AWMATE_BUILD === "true" && isGateway(provider)) {
      void dialog.show(() => <DialogSelectModel model={props.model} provider={provider} />, props.onClose)

      return
    }

    if (!props.paid) return props.onUnpaidClick()
    // A pointer open keeps focus in the composer, so the dialog returns it to the caret. A keyboard open
    // (a click with no pointer presses) returns focus to this trigger instead of moving it to the editor.
    void dialog.show(
      () => <DialogSelectModel model={props.model} provider={gateway()} />,
      detail === 0 ? undefined : props.onClose,
    )
  }

  // A previewed chip is visible before the catalog loads, so a click on it opens the dialog once loading finishes,
  // unless the user moved on first.
  const [chip, setChip] = createSignal(createModelChipState())
  const pending = createMemo(() => selectModelChipPending(chip()))
  let timer: ReturnType<typeof setTimeout> | undefined
  let trigger: HTMLButtonElement | undefined

  const dispatch = (event: ModelChipEvent) => {
    const next = transitionModelChip(chip(), event)
    setChip(next.state)
    next.effects.forEach((effect) => {
      if (effect.type === "open") return open(effect.detail)
      clearTimeout(timer)

      if (effect.type === "timer.start")
        timer = setTimeout(() => dispatch({ type: "timed-out", attempt: effect.attempt }), effect.delayMs)
    })
  }

  createEffect(() => {
    if (!props.loading) untrack(() => dispatch({ type: "loaded", mobile: mobile(), dialogOpen: !!dialog.active }))
  })

  createEffect(() => {
    if (mobile() || dialog.active) untrack(() => dispatch({ type: "cancelled" }))
  })

  // Any other press, key or window switch means the user moved on, so the late catalog must not pop the dialog.
  createEffect(() => {
    if (!pending()) return
    const cancel = () => dispatch({ type: "cancelled" })
    makeEventListener(
      document,
      "pointerdown",
      (event) => {
        if (!(event.target instanceof Node && trigger?.contains(event.target))) cancel()
      },
      { capture: true },
    )
    makeEventListener(document, "keydown", cancel, { capture: true })
    makeEventListener(window, "blur", cancel)
  })

  onCleanup(() => dispatch({ type: "disposed" }))

  const content = () => (
    <>
      <span class="flex min-w-0 whitespace-nowrap leading-4">
        <Show when={props.label.provider}>
          {(name) => (
            <>
              <bdi class="min-w-0 shrink-[2] truncate text-v2-text-text-faint">{name()}</bdi>
              <Slash />
              <span class="sr-only">{" / "}</span>
            </>
          )}
        </Show>
        <bdi class="min-w-0 truncate">{props.label.model}</bdi>
      </span>
      <span class="-ml-0.5 -mr-1 flex shrink-0">
        <Icon name="chevron-down" />
      </span>
    </>
  )

  return (
    <Show when={!props.loading || props.preview}>
      <Tooltip
        inactive={mobile()}
        placement="top"
        value={
          <>
            {props.title}
            <Keybind keys={props.keybind} variant="neutral" />
          </>
        }
      >
        {/* While loading, the drawer would open on a catalog that isn't there yet, so the inert chip stands in. */}
        <Show
          when={mobile() && !props.loading}
          fallback={
            <Button
              ref={trigger}
              data-action="composer-model"
              data-control-type="dialog"
              variant="ghost-muted"
              size="normal"
              class="min-w-0 max-w-[60cqw] justify-start ![font-weight:440]"
              classList={{ "animate-in fade-in": shouldAnimate() }}
              style={{ height: "28px" }}
              aria-busy={pending() || undefined}
              onMouseDown={(event: MouseEvent) => event.preventDefault()}
              onClick={(event: MouseEvent) =>
                dispatch({
                  type: "clicked",
                  detail: event.detail,
                  loading: props.loading,
                  mobile: mobile(),
                  dialogOpen: !!dialog.active,
                })
              }
            >
              {content()}
            </Button>
          }
        >
          <ModelSelectorDrawer
            model={props.model}
            provider={gateway()}
            trigger={(triggerProps) => (
              <Button
                {...triggerProps}
                variant="ghost-muted"
                size="normal"
                style={{ height: "28px" }}
                class="min-w-0 max-w-[60cqw] justify-start ![font-weight:440]"
                classList={{ "animate-in fade-in": shouldAnimate() }}
                data-action="composer-model"
                data-control-type="drawer"
              >
                {content()}
              </Button>
            )}
            onClose={props.onClose}
          />
        </Show>
      </Tooltip>
    </Show>
  )
}
