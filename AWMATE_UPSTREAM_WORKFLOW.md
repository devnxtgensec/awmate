# AWMate upstream and branch workflow

## Repository layout

- AWMate fork: `https://github.com/devnxtgensec/awmate`
- OpenCode upstream: `https://github.com/anomalyco/opencode`
- OpenCode branch being tracked: `dev`
- `origin` means the AWMate repository; `upstream` means the original OpenCode repository.

## Branch purposes

- `dev` is AWMate's integration and development branch. It began from OpenCode's `dev` branch and will contain AWMate changes and reviewed upstream updates.
- `main` is the AWMate branch for changes reviewed and ready to release. Merge from AWMate `dev` into `main` after checks pass.
- `upstream/dev` is the fetched remote-tracking branch from OpenCode. It is not an AWMate working branch.

AWMate `dev` is not intended to remain a clean mirror once AWMate-specific commits are added.

## Initial setup recorded

On 2026-11-07, the AWMate GitHub repository was confirmed to be a fork whose parent is `anomalyco/opencode`. Before adding this document, AWMate `dev` and OpenCode `dev` both pointed to commit `78e066c9d497077ce2f645b1e7e64da1de857a04`. The AWMate repository initially used `dev` as its default branch and had no `main` branch. This setup adds this workflow document, creates `main` from the resulting `dev` commit, and makes `main` the default branch.

## Bring in OpenCode updates

1. Fetch the latest OpenCode refs:

   ```sh
   git fetch upstream
   ```

2. Start a sync branch from AWMate `dev` and merge the upstream changes:

   ```sh
   git switch dev
   git switch -c sync/opencode-YYYY-MM-DD
   git merge --no-ff upstream/dev
   ```

3. Resolve conflicts carefully. Review the upstream changelog and source changes, then run the relevant build and checks for the project.
4. Open a pull request from the sync branch into AWMate `dev`. After it is reviewed and checked, merge it.
5. Promote reviewed AWMate `dev` to `main` through a pull request when ready.
6. Push AWMate branches to `origin`. Never push AWMate changes to `upstream`.

Do not reset AWMate branches to `upstream/dev` or force-push upstream over AWMate work. Merging preserves committed AWMate history; changes to the same files can still need manual conflict resolution.

## Regular maintenance

- Sync upstream regularly so conflicts stay small.
- Keep AWMate-specific features isolated from OpenCode core where practical.
- For each sync, record the date, upstream commit or release, important conflicts, and checks performed in the pull request or a short log here.
- The `dev` branch can contain changes that are not part of a stable OpenCode release. Review upstream changes before promoting them to `main`.
- Preserve OpenCode's license and attribution notices when redistributing the fork.
- Keep local credentials out of Git. `.env.local` is excluded by `.gitignore`; never commit it.

## Upstream sync log

### 2026-11-10

- Fetched OpenCode `upstream/dev` at `d4aeee551e` (`fix(site): send every unhandled method a 405 listing what the address takes`). The shared base was `78e066c9d4`; upstream had 183 commits and 1,039 changed paths since that base.
- Merge simulations into AWMate `dev` and `main` reported no conflicts. Six files were changed on both sides; Git's clean merge retained both sides' edits, including AWMate's desktop protocol and 30-second plugin readiness customization.
- Installed the merged lockfile with `bun install --frozen-lockfile`. `bun run check` passed: lint reported 550 warnings and 0 errors, SDK documentation reported 0 problems, and typecheck completed all 34 tasks.
- Promoted the sync through AWMate `dev` (`832824d12c`) and merged it into AWMate `main` (`6ae6f68730`). The combined `main` passed `bun run check` (34/34 typecheck tasks; lint warnings, 0 errors) and `AWMATE_BUILD=1 OPENCODE_CHANNEL=dev OPENCODE_TARGET=windows-x64 bun run --cwd packages/desktop build` (desktop bundles verified). The build emitted CSS compatibility diagnostics for `::highlight()` and plugin timing notices, but completed successfully.
- This sync updates source and desktop bundles only. It does not publish a new installer or GitHub release; the existing download remains unchanged until a release is packaged and published.
