# AWMate Windows releases

A push to main builds a Windows x64 installer and ZIP. The workflow increments the patch number in the latest published installer metadata and uses the same version for Electron and the GitHub release tag. Publishing follows successful packaging and manifest checks.

Packaged AWMate checks at startup and applies an available update through its existing Electron restart flow. While running, it checks every 30 minutes and exposes the existing updater action. Older installations can download the ZIP from https://github.com/devnxtgensec/awmate/releases/latest/download/awmate-desktop-win-x64.zip . Installers using an earlier application ID may require a manual install and keep a separate profile.

This release also includes the accumulated desktop account, access refresh, sidebar, project layout and storage isolation changes. Related Cloudflare platform changes have a separate deployment.
