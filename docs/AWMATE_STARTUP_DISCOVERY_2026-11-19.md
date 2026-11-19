# AWMate service discovery repair — 2026-11-19

Modified for AWMate.

## Report

Some Windows users on 2.2.47 saw `Desktop IPC handler failed`, wrapping
`Background service failed to start`. This is a generic health-check failure;
the screenshot does not identify the server's underlying boot exception.

## Confirmed defect and change

The CLI derives its state directory from `Global` using the `awmate` namespace.
The shared client still discovered `XDG_STATE_HOME/opencode/service.json`.
The desktop's explicit local-channel path also still used `opencode`.
Consequently discovery could inspect a stale registration or fail to find the
new service. Both paths now use `awmate`, matching the CLI writer. The default
home-directory fallback remains `.local/state`, with the AWMate subdirectory.

No databases, credentials, sessions, provider URLs or gateway budgets are reset
or changed by this patch. Explicit client registration paths remain supported.

## Verification

- Promise service and decision tests: 22 pass, 2 platform-specific skips.
- New real-process discovery regression places the live registration under
  `awmate` and an invalid old registration under `opencode`.
- Reverting the namespace makes that regression fail; restoring the patch passes.
- Desktop typecheck: no errors across 3,456 files / 2 projects.
- CLI debug-paths smoke tests: 2 pass with a 60-second timeout; the initial
  five-second timeout was insufficient for source CLI startup on this machine.

## Release and remaining diagnosis

Push through the development branch and then main; the existing Windows release
workflow calculates the next installer patch version and publishes update assets.
Confirm the workflow and published assets before calling the installer available.

If the error persists after updating, export logs from the error screen and locate
`background service boot failed` and its nested cause. A database/configuration
failure is a separate issue; do not delete user data or promise that this path
repair cures every startup exception. Record the installed version, failure time,
and whether this was a fresh installation or upgrade with the logs.
