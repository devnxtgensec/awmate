<p align="center">
  <picture>
    <source srcset=".github/assets/awmate-logo-dark.svg" media="(prefers-color-scheme: dark)">
    <source srcset=".github/assets/awmate-logo.svg" media="(prefers-color-scheme: light)">
    <img src=".github/assets/awmate-logo.svg" alt="AWMate" width="420">
  </picture>
</p>
<p align="center"><strong>The AI coding agent by NxtGenSec.</strong></p>
<p align="center">
  <a href="https://www.npmjs.com/package/@awmate/cli"><img alt="npm" src="https://img.shields.io/npm/v/@awmate/cli?style=flat-square&label=%40awmate%2Fcli" /></a>
  <a href="https://github.com/devnxtgensec/awmate/releases/latest"><img alt="Release" src="https://img.shields.io/github/v/release/devnxtgensec/awmate?style=flat-square" /></a>
  <a href="https://github.com/devnxtgensec/awmate/actions/workflows/awmate-release.yml"><img alt="Build status" src="https://img.shields.io/github/actions/workflow/status/devnxtgensec/awmate/awmate-release.yml?style=flat-square&branch=main" /></a>
  <a href="https://awmate.nxtgensec.org"><img alt="Website" src="https://img.shields.io/website?style=flat-square&url=https%3A%2F%2Fawmate.nxtgensec.org" /></a>
</p>

---

AWMate (Assistive Workmate) is an AI coding agent for your terminal and desktop: it
understands your codebase, edits files, runs commands, and handles multi-step work —
with plans in rupees, a free daily allowance, and a gateway that routes to the best
models. Sign in with `awmate login` and start working.

## Installation

```bash
# macOS and Linux
curl -fsSL https://awmate.nxtgensec.org/install | bash

# Windows (PowerShell)
irm https://awmate.nxtgensec.org/install.ps1 | iex

# npm (all platforms)
npm i -g @awmate/cli@latest

# Homebrew (macOS and Linux)
brew install devnxtgensec/tap/awmate
```

The installers verify every download (SHA-256) and support in-place upgrades while
AWMate is running — reopen the app to finish an update.

### Desktop app

AWMate is also available as a desktop application for [download](https://awmate.nxtgensec.org/download).

| Platform              | Status                                  | Download                              |
| --------------------- | --------------------------------------- | ------------------------------------- |
| Windows 10 / 11       | ✅ Available                            | `awmate-desktop-win-x64.exe`          |
| macOS (Apple Silicon) | Beta                                    | `awmate-desktop-mac-arm64.zip`        |
| macOS (Intel)         | Beta                                    | `awmate-desktop-mac-x64.zip`          |
| Linux                 | Beta                                    | `.deb`, `.rpm`, or `.AppImage`        |

## Agents

AWMate includes two built-in agents you can switch between with the `Tab` key.

- **build** — default, full-access agent for development work
- **plan** — read-only agent for analysis and code exploration
  - Denies file edits by default
  - Asks permission before running bash commands
  - Ideal for exploring unfamiliar codebases or planning changes

A **general** subagent for complex searches and multi-step tasks is also included and
can be invoked with `@general` in messages.

## Documentation

Configuration, providers, agents, plugins, skills, MCP, the SDK and the HTTP API are
documented at [**awmate.nxtgensec.org/docs**](https://awmate.nxtgensec.org/docs).

## Pricing

Start free — every account gets ₹9 of usage daily, no plan needed. When you need more,
pick a plan at [awmate.nxtgensec.org](https://awmate.nxtgensec.org): one credit equals
₹1 of usage.

## Attribution

AWMate is built on [OpenCode](https://github.com/anomalyco/opencode) by Anomaly
Innovations, licensed under the MIT license. This repository is an independent product
maintained by [NxtGenSec](https://github.com/devnxtgensec) and is not built by, or
affiliated with, the OpenCode team.
