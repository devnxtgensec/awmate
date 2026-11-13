import { makeEventListener } from "@solid-primitives/event-listener"
import { createSignal, For, onMount } from "solid-js"
import { Menu } from "@opencode/ui/menu"

import { matchKeybind, parseKeybind, useCommand } from "@/shell/commands/command"
import {
  DESKTOP_MENU,
  desktopMenuKey,
  desktopMenuVisible,
  desktopMenuWithPlugins,
  type DesktopMenu,
  type DesktopMenuAction,
  type DesktopMenuEntry,
} from "@/shell/commands/desktop-menu"
import { usePlatform } from "@/runtime/platform/platform"
import { useLanguage } from "@/runtime/i18n/language"
import { useMenubarItems } from "@/runtime/plugin/menubar-items"

const accelerators = DESKTOP_MENU.flatMap((menu) => menu.items ?? []).flatMap((entry) => {
  if (entry.type === "separator" || !entry.action || !entry.accelerator?.windows) return []

  // Let the focused editor handle editing shortcuts without restoring stale menu focus.
  if (entry.action.startsWith("edit.")) return []

  return [{ action: entry.action, keybind: parseKeybind(entry.accelerator.windows) }]
})

export function windowsMenuAccelerator(event: KeyboardEvent) {
  return accelerators.find((entry) => matchKeybind(entry.keybind, event))?.action
}

export function WindowsAppMenu(props: {
  command: ReturnType<typeof useCommand>
  platform: ReturnType<typeof usePlatform>
}) {
  let lastFocused: HTMLElement | undefined
  const language = useLanguage()
  const menubar = useMenubarItems()

  const entries = (menu: DesktopMenu) =>
    desktopMenuWithPlugins(
      (menu.items ?? [])
        .filter((entry) => desktopMenuVisible(entry, "windows"))
        .map((entry) => ({ key: desktopMenuKey(entry), entry })),
      menubar?.items().filter((item) => item.menu === menu.id) ?? [],
    )

  const rememberFocus = () => {
    const active = document.activeElement
    lastFocused = active instanceof HTMLElement ? active : undefined
  }

  const commandDisabled = (id: string) => {
    const option = props.command.options.find((option) => option.id === id)

    if (!option) return true

    return option.disabled ?? false
  }

  const runCommand = (id: string) => {
    if (commandDisabled(id)) return
    props.command.trigger(id)
  }

  const runAction = (action: DesktopMenuAction) => {
    if (action.startsWith("edit.") && lastFocused?.isConnected) lastFocused.focus({ preventScroll: true })
    void props.platform.runDesktopMenuAction?.(action)
  }

  const runEntry = (entry: DesktopMenuEntry) => {
    if (entry.type === "separator") return

    if (entry.command) {
      runCommand(entry.command)

      return
    }

    if (entry.action) {
      runAction(entry.action)

      return
    }

    if (entry.href) props.platform.openExternal(entry.href)
  }

  onMount(() => {
    makeEventListener(
      document,
      "keydown",
      (event) => {
        if (event.defaultPrevented) return
        const action = windowsMenuAccelerator(event)

        if (!action) return
        event.preventDefault()
        event.stopPropagation()
        runAction(action)
      },
      { capture: true },
    )
  })

  const [openMenu, setOpenMenu] = createSignal<string>()

  // "Modified for AWMate": replace the hamburger with a compact File/Edit/View/Help menubar.
  return (
    <div class="flex h-7 shrink-0 items-center gap-0.5" data-slot="desktop-menubar">
      <For
        each={DESKTOP_MENU.filter(
          (menu) =>
            (menu.id === "file" || menu.id === "edit" || menu.id === "view" || menu.id === "help") &&
            desktopMenuVisible(menu, "windows"),
        )}
      >
        {(menu) => (
          <Menu open={openMenu() === menu.id} onOpenChange={(open) => setOpenMenu(current => open ? menu.id : current === menu.id ? undefined : current)} appearance="standard" gutter={4} modal={false} placement="bottom-start">
            <Menu.Trigger
              class="flex h-7 items-center rounded-[4px] px-2 text-[13px] text-v2-text-text-base hover:bg-v2-background-bg-base [app-region:no-drag]"
              onPointerEnter={(event) => { if (event.pointerType === "mouse") setOpenMenu(menu.id) }}
              onPointerDown={rememberFocus}
              onKeyDown={rememberFocus}
            >
              {language.t(menu.labelKey)}
            </Menu.Trigger>
            <Menu.Portal>
              <Menu.Content class="desktop-app-menu">
                <Menu.Group>
                  <For each={entries(menu)}>
                    {(item) => {
                      const entry = item.entry

                      if ("menu" in entry)
                        return (
                          <DesktopMenuItem
                            label={entry.label}
                            disabled={!entry.enabled}
                            onSelect={() => menubar?.run(entry.id)}
                          />
                        )

                      if (entry.type === "separator") return <Menu.Separator />

                      const label = () => (entry.labelKey ? language.t(entry.labelKey) : "")
                      if (import.meta.env.AWMATE_BUILD === "true" && (menu.id === "help" || entry.command === "settings.open")) {
                        if (entry.labelKey === "desktop.menu.documentation")
                          return <DesktopMenuItem label={label()} onSelect={() => props.platform.openExternal("https://awmate.nxtgensec.org/docs")} />
                        return <Menu.Item closeOnSelect={false}><span>{label()}</span><span class="ms-auto ps-3 text-xs text-v2-text-text-muted">Beta</span></Menu.Item>
                      }
                      const keybind = () =>
                        entry.command ? props.command.keybind(entry.command) : entry.accelerator?.windows
                      const disabled = () => (entry.command ? commandDisabled(entry.command) : false)

                      return (
                        <DesktopMenuItem
                          label={label()}
                          keybind={keybind()}
                          disabled={disabled()}
                          onSelect={() => runEntry(entry)}
                        />
                      )
                    }}
                  </For>
                </Menu.Group>
              </Menu.Content>
            </Menu.Portal>
          </Menu>
        )}
      </For>
    </div>
  )
}

function DesktopMenuItem(props: { label: string; keybind?: string; disabled?: boolean; onSelect: () => void }) {
  return (
    <Menu.Item disabled={props.disabled} onSelect={props.onSelect} shortcut={props.keybind}>
      {props.label}
    </Menu.Item>
  )
}
