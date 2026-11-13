# AWMate Windows releases

A push to main builds a Windows x64 installer and ZIP. The workflow increments the patch number in the latest published installer metadata and uses the same version for Electron and the GitHub release tag. Publishing follows successful packaging and manifest checks.

Packaged AWMate checks at startup and applies an available update through its existing Electron restart flow. While running, it checks every 30 minutes and exposes the existing updater action. Older installations can download the ZIP from https://github.com/devnxtgensec/awmate/releases/latest/download/awmate-desktop-win-x64.zip . Installers using an earlier application ID may require a manual install and keep a separate profile.

This release also includes the accumulated desktop account, access refresh, sidebar, project layout and storage isolation changes. Related Cloudflare platform changes have a separate deployment.

## November 11 desktop branding and sidebar update

Updated the desktop product name, support links, window and installer artwork, and new-chat logo for AWMate. The sidebar now groups the AWMate menu, notification settings, and search above New chat and Projects. Settings in the AWMate menu and account menu displays “Still under beta.” The Windows release workflow builds the installer, ZIP, and updater manifest from main.
Public Windows build: Google sign-in includes AWMate Gateway, $1 per India calendar day and one optional $1 claim. Includes the bundled restricted runtime, sidebar actions, branding and Aura theme.
