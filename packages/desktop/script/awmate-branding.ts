import type { Plugin } from "vite"

// Modified for AWMate: transform product copy in desktop locale bundles only.
// Provider names, upstream attribution, commands and protocol identifiers retain their meaning.
export function awmateBranding(): Plugin {
  const productKeys = /^(desktop\.(?:recovery\.|menu\.(?:app$|ariaLabel$)|.*Usage$)|onboarding\.(?:wslUnavailable\.description|windowsRestartRequired)|provider\.connect\.apiKey\.description|voice\.assistant|dialog\.provider\.description|provider\.connect\.(chatgptWelcome\.description|.*apiKey.*description)|settings\.about\.(description|notices\.description)|settings\.general\.row\.(language|colorScheme|theme)\.description|project\.settings\.|settings\.workspaces\.empty\.description|error\.page\.report\.prefix|action\.download|toast\.latest\.description|web\.ready\.message|setup\.(mcp|plugins|skills)|screenActive\.description|onboarding\.(windowsRestartRequired|wslUnavailable\.description))/
  return {
    name: "awmate-desktop-branding",
    enforce: "pre",
    transform(code, id) {
      if (!id.replaceAll("\\", "/").includes("/i18n/") || !id.endsWith(".ts")) return
      return code.replace(/^(\s*)"([^"]+)"(:\s*)"([^"\n]*)"/gm, (line, indent, key, separator, value) => {
        if (key === "error.page.report.discord") return indent + JSON.stringify(key) + separator + '"support@nxtgensec.org"'
        if (!productKeys.test(key) && !value.includes(" models in OpenCode")) return line
        return indent + JSON.stringify(key) + separator + '"' + value.replace(/OpenCode(?! (?:Go|Free|Console))/gi, "AWMate") + '"'
      })
    },
    transformIndexHtml(html) {
      return html.replace("<title data-sm>OpenCode", "<title data-sm>AWMate")
        .replace(/<link rel="(?:icon|shortcut icon|apple-touch-icon)"[^>]*>/g, "")
        .replace("</head>", '<link rel="icon" href="./awmate-logo.png" /></head>')
        .replaceAll("./social-share.png", "./awmate-logo.png")
    },
  }
}
