import "@/index.css"
import { VoiceProvider } from "@/voice/context"
import { VoiceOverlay } from "@/voice/composer"
import { DialogProvider } from "@opencode/ui/context/dialog"
import { FileComponentProvider } from "@opencode/ui/context/file"
import { Font } from "@opencode/ui/font"
import { ThemeProvider } from "@opencode/ui/theme/context"
import { MetaProvider, Title } from "@solidjs/meta"
import { type BaseRouterProps, Router } from "@solidjs/router"
import { QueryClient, QueryClientProvider } from "@tanstack/solid-query"
import { type Component, createRenderEffect, ErrorBoundary, type JSX, type ParentProps, Show, onCleanup, onMount } from "solid-js"
import { createStore } from "solid-js/store"
import { Dynamic } from "solid-js/web"
import { CommandProvider } from "@/shell/commands/command"
import { DesktopCommands } from "@/shell/commands/desktop"
import { ProjectIconsProvider } from "@/shell/layout/project-icons"
import { GlobalProvider } from "@/runtime/server/runtime"
import { LanguageProvider, UiI18nBridge, type Locale } from "@/runtime/i18n/language"
import { ServerConnection, ServersProvider } from "@/runtime/server/registry"
import { SettingsProvider } from "@/settings/model"
import { TabsProvider } from "@/shell/tabs/tabs"
import { ErrorPage } from "@/shell/errors/error"
import { AppRoutes, File, preloadRoute } from "@/shell/routes/routes"
import { PluginRoot } from "@/runtime/plugin/root"
import { usePlatform } from "@/runtime/platform/platform"
import { useLanguage } from "@/runtime/i18n/language"
import { Button } from "@opencode/ui/button"

export { preloadRoute }

function QueryProvider(props: ParentProps) {
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        refetchOnReconnect: false,
        refetchOnWindowFocus: false,
        refetchOnMount: false,
      },
    },
  })

  return <QueryClientProvider client={client}>{props.children}</QueryClientProvider>
}

function BodyTypography() {
  createRenderEffect(() => {
    if (typeof document === "undefined") return
    document.body.classList.remove("text-12-regular")
    document.body.classList.add("font-(family-name:--font-family-text)", "text-[13px]", "font-[440]")
  })

  return null
}

export function AppBaseProviders(
  props: ParentProps<{
    locale?: Locale
    onNativeTranslations?: Parameters<typeof LanguageProvider>[0]["onNativeTranslations"]
    onThemeApplied?: (mode: "light" | "dark", scheme: "system" | "light" | "dark") => void
  }>,
) {
  return (
    <MetaProvider>
      <Title>{import.meta.env.AWMATE_BUILD === "true" ? "AWMate" : "OpenCode"}</Title>
      <Font />
      <ThemeProvider onThemeApplied={(mode, scheme) => props.onThemeApplied?.(mode, scheme)}>
        <LanguageProvider locale={props.locale} onNativeTranslations={props.onNativeTranslations}>
          <UiI18nBridge>
            <ErrorBoundary
              fallback={(error) => {
                void import("@sentry/solid").then(({ captureException }) => captureException(error))

                return <ErrorPage error={error} />
              }}
            >
              <QueryProvider>
                <DialogProvider>
                  <PluginRoot>
                    <FileComponentProvider component={File}>{props.children}</FileComponentProvider>
                  </PluginRoot>
                </DialogProvider>
              </QueryProvider>
            </ErrorBoundary>
          </UiI18nBridge>
        </LanguageProvider>
      </ThemeProvider>
    </MetaProvider>
  )
}

export function AppInterface(props: {
  children?: JSX.Element
  canonicalLocalServer?: ServerConnection.Key
  servers?: Array<ServerConnection.Any>
  router?: Component<BaseRouterProps>
}) {
  // The visual layout lives in the router root so it remains mounted across
  // route changes. Draft and session routes override only their server-bound data
  // providers beneath it.
  const Root = (rootProps: ParentProps) => (
    <TabsProvider>
      <GlobalProvider>
        <ProjectIconsProvider>
          <BodyTypography />
          <CommandProvider>
            <DesktopCommands />
            <VoiceProvider>
              {props.children}
              {rootProps.children}
              <VoiceOverlay />
            </VoiceProvider>
          </CommandProvider>
        </ProjectIconsProvider>
      </GlobalProvider>
    </TabsProvider>
  )

  return (
    <AWMateAccessGate>
      <ServersProvider canonicalLocalServer={props.canonicalLocalServer} servers={props.servers}>
        <SettingsProvider>
          <Dynamic component={props.router ?? Router} root={Root}>
            <AppRoutes />
          </Dynamic>
        </SettingsProvider>
      </ServersProvider>
    </AWMateAccessGate>
  )
}

function AWMateAccessGate(props: ParentProps) {
  const platform = usePlatform()
  const language = useLanguage()
  // Modified for AWMate: the renderer build injects the string "true" for AWMate builds.
  const required = import.meta.env.AWMATE_BUILD === "true"
  const [state, setState] = createStore({
    phase: required ? "checking" : "approved",
    busy: false,
    message: "",
    secondsRemaining: 60,
  })
  let attempt = 0
  let signInTimer: number | undefined
  let signInCountdown: number | undefined

  const check = async () => {
    if (!required || state.busy) return
    const current = ++attempt
    // Modified for AWMate: background refresh keeps the workspace mounted.
    try {
      const account = await platform.awmateAuthStatus?.()
      if (current !== attempt) return
      setState({ phase: account ? "approved" : "signed-out", message: "" })
    } catch (error) {
      if (current !== attempt || state.phase === "approved") return
      setState({ phase: "signed-out", message: error instanceof Error ? error.message : language.t("awmate.auth.unavailable") })
    }
  }

  const signIn = async () => {
    if (!required || state.busy) return
    const current = ++attempt
    const startedAt = Date.now()
    setState({ phase: "signing-in", busy: true, message: "", secondsRemaining: 60 })
    window.clearTimeout(signInTimer)
    window.clearInterval(signInCountdown)
    signInCountdown = window.setInterval(() => {
      if (current !== attempt) return
      setState("secondsRemaining", Math.max(0, 60 - Math.floor((Date.now() - startedAt) / 1000)))
    }, 1000)
    signInTimer = window.setTimeout(() => {
      if (current !== attempt) return
      attempt++
      window.clearInterval(signInCountdown)
      signInCountdown = undefined
      setState({
        phase: "signed-out",
        busy: false,
        secondsRemaining: 0,
        message: language.t("awmate.auth.timeout"),
      })
    }, 60_000)
    try {
      if (!platform.awmateAuthSignIn) throw new Error(language.t("awmate.auth.unavailable"))
      await platform.awmateAuthSignIn()
      if (!(await platform.awmateAuthStatus?.())) throw new Error(language.t("awmate.auth.notApproved"))
      if (current === attempt) setState({ phase: "approved", busy: false, message: "" })
    } catch (error) {
      if (current === attempt)
        setState({
          phase: "signed-out",
          busy: false,
          message: error instanceof Error ? error.message : typeof error === "string" ? error : language.t("awmate.auth.unavailable"),
        })
    } finally {
      if (current === attempt) {
        window.clearTimeout(signInTimer)
        window.clearInterval(signInCountdown)
        signInTimer = undefined
        signInCountdown = undefined
      }
    }
  }

  onMount(() => {
    if (!required) return
    void check()
    const timer = window.setInterval(() => void check(), 30_000)
    onCleanup(() => {
      attempt++
      window.clearTimeout(signInTimer)
      window.clearInterval(signInCountdown)
      signInTimer = undefined
      signInCountdown = undefined
      window.clearInterval(timer)
    })
  })

  return (
    <Show
      when={!required || state.phase === "approved"}
      fallback={
        <main class="flex min-h-screen items-center justify-center bg-v2-background-bg-base px-5 py-10 text-v2-text-text-base">
          <section class="w-full max-w-lg rounded-3xl border border-v2-border-border-muted bg-v2-background-bg-layer-01 p-7 shadow-xl sm:p-10">
            <header class="flex items-center gap-3">
              <span class="flex size-11 items-center justify-center rounded-xl bg-v2-background-bg-layer-02 text-16-semibold text-v2-icon-icon-accent"><img src="./awmate-logo.png" alt="" class="size-full object-contain" /></span>
              <div>
                <p class="text-14-semibold">AWMate</p>
                <p class="text-12-regular text-v2-text-text-muted">Your Assistive Workmate</p>
              </div>
            </header>

            <div class="mb-7 mt-9">
              <p class="mb-3 text-12-medium uppercase tracking-wider text-v2-text-text-muted">
                {language.t("awmate.auth.eyebrow")}
              </p>
              <h1 class="mb-3 text-28-semibold">{language.t("awmate.auth.title")}</h1>
              <p class="text-14-regular leading-6 text-v2-text-text-muted">{language.t("awmate.auth.body")}</p>
            </div>

            <Show when={state.phase === "checking"}>
              <div class="mb-5 flex items-center gap-3 rounded-xl border border-v2-border-border-muted bg-v2-background-bg-base p-4 text-13-regular text-v2-text-text-muted" role="status">
                <span class="size-4 animate-spin rounded-full border-2 border-v2-border-border-muted border-t-v2-icon-icon-accent" />
                {language.t("awmate.auth.checking")}
              </div>
            </Show>

            <Show when={state.busy}>
              <div class="mb-5 flex items-start gap-3 rounded-xl border border-v2-border-border-muted bg-v2-background-bg-base p-4" role="status" aria-live="polite">
                <span class="mt-0.5 size-4 shrink-0 animate-spin rounded-full border-2 border-v2-border-border-muted border-t-v2-icon-icon-accent" />
                <div class="min-w-0 flex-1">
                  <p class="text-13-medium">{language.t("awmate.auth.browserOpen")}</p>
                  <p class="mt-1 text-12-regular leading-5 text-v2-text-text-muted">
                    {language.t("awmate.auth.browserReturn")}
                  </p>
                </div>
                <span class="shrink-0 text-12-medium tabular-nums text-v2-text-text-muted">
                  {state.secondsRemaining}s
                </span>
              </div>
            </Show>

            <Show when={state.message}>
              <p class="mb-5 rounded-xl border border-v2-border-border-muted bg-v2-background-bg-base p-4 text-13-regular leading-5 text-v2-text-text-danger" role="alert">
                {state.message}
              </p>
            </Show>

            <Button
              class="mb-6 w-full"
              variant="submit"
              disabled={state.busy || state.phase === "checking"}
              onClick={() => void signIn()}
            >
              {state.busy
                ? language.t("awmate.auth.waiting")
                : state.message
                  ? language.t("awmate.auth.retry")
                  : language.t("awmate.auth.continue")}
            </Button>

            <footer class="flex items-center justify-between border-t border-v2-border-border-muted pt-5 text-12-regular text-v2-text-text-muted">
              <span>{language.t("awmate.auth.secureNote")}</span>
              <a class="underline underline-offset-4 hover:text-v2-text-text-base" href="mailto:support@nxtgensec.org">
                {language.t("awmate.auth.support")}
              </a>
            </footer>
          </section>
        </main>
      }
    >
      {props.children}
    </Show>
  )
}
