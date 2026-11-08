---
id: t-twvb1m
title: 'vite-plugin-plain-css-modules: readable CSS-module class names with a built-in collision guard'
status: review
priority: medium
author: mb-777f7ebc
assignee: mb-777f7ebc
created: '2026-11-08T18:00:16.879Z'
---
## Problem
`amiro` names CSS-module classes `<FileBase>_<local>` (no hash) through an inline `css.modules.generateScopedName` in `vite.config.ts`, and relies on a git pre-commit script (`scripts/check-scss-collisions.sh`) to keep `*.module.scss` basenames unique. The naming and its guard live in two places; the guard runs only at commit time and only in that repo. The existing npm package `vite-plugin-readable-css-modules` (arusak, 0.7.0) is dev-only, matches only `.module.css` (a `.module.scss` yields an empty prefix) and has no collision check, so it does not cover this.

## План
**Scope** — new standalone package `~/Dev/vite-plugin-plain-css-modules` (ESM, TypeScript → `dist/`, peer `vite ^8`). `amiro` is not touched; publishing is a separate, user-approved step.

**API** — `plugins: [plainCssModules()]`, zero config. The plugin's `config` hook sets `css.modules.generateScopedName`.

**Naming** — prefix = file basename minus `.module.<css|scss|sass|less|styl|stylus|pcss|postcss|sss>`, `?query` stripped, runs of `[^A-Za-z0-9_-]` → `_` (TanStack route files such as `patients_.$id`), `_` prepended when the prefix starts with `-?digit` (invalid selector otherwise). Class = `${prefix}_${local}`. Same output as amiro's function for every amiro input.

**Collision source** (fork: scan the filesystem vs record inside `generateScopedName`) → record. `Map<prefix, Set<file>>` filled by `generateScopedName`: no directory config to guess, unused/dead files never report, linked packages outside root are covered. Cost: in dev a collision surfaces when the second module is compiled — exactly when it can break the page. Key = sanitized prefix, so `a$b.module.scss` vs `a_b.module.scss` and `Card.module.css` vs `Card.module.scss` collide (the old script compared raw basenames and missed both). Deleted files leave the map (dev: `server.watcher` `unlink`; build `--watch`: `watchChange` delete).

**Reporting**
- build: `buildEnd` → `this.error(report)` naming every colliding file (relative to root); the build fails. Nothing is injected into the bundle.
- dev terminal: `config.logger.warn`, debounced, printed only when the report text changes (generateScopedName fires per class).
- dev browser: `transformIndexHtml` (serve only) injects `<script type="module" src="${base}@id/__x00__virtual:plain-css-modules/client">`; the client sends `plain-css-modules:hello` over the HMR channel and prints every `plain-css-modules:collisions` payload with `console.error` (and a `console.info` once it clears). The server answers hello with the current report and broadcasts on every change, so a reload or late connect never loses the message.

**Loud misconfiguration** — throws in `configResolved`/`config` when `css.transformer === 'lightningcss'` (vite ignores `css.modules` there, the plugin would silently do nothing) and when the user config already sets `css.modules.generateScopedName` (would be silently overridden).

**Proof (vitest, fixtures are plain `.module.css` in a temp dir, no sass)**
1. `build()` with two `Card.module.css` in different dirs → rejects, message names both paths. Without it a broken detector stays green.
2. clean `build()` with a route-style file `patients_.$id.module.css` → emitted CSS carries the class amiro's function (copied verbatim as oracle) produces, and `dist` contains no `plain-css-modules` client code.
3. dev: `createServer` + `listen` on a free port; fetch `index.html` → script tag present; fetch the client module url → 200; load both colliding modules, connect a real HMR WebSocket (`vite-hmr` protocol, token), send hello → collision payload names both files; terminal logger got one warn.
4. misconfiguration: lightningcss and a user `generateScopedName` both throw.

**Reviewers** — bug-reviewer (codex) on the full diff.

## План — правки после план-ревью (mb-e12ce67f, 8b49aa8)
- **Две проверки, не одна.** (a) policy: a prefix belongs to one file (unique basenames, catches the clash before it bites); (b) exact: a generated class name belongs to one file — `A_b.module.css .c` and `A.module.css .b_c` both give `A_b_c` with different prefixes, (a) alone misses it.
- **Freshness of the name map.** A `transform` hook (`enforce: 'pre'`, runs before `vite:css`) drops a CSS module's recorded class names before each compile, so a file whose local classes changed or vanished (rules turned `:global`, emptied) never keeps stale names.
- **Build owns its graph.** `buildEnd` reports only files in `this.getModuleIds()`: a file still on disk but no longer imported (`build --watch` after an import is removed) stops counting. Dev keeps a file until it is deleted or the server restarts — a module dropped from imports stays in Vite's dev module graph too; accepted, documented in README.
- **Proof additions.** Naming table test (extensions, `?query`, Windows path, leading digit, route file, pairs equal after sanitizing) with amiro's function as oracle on its own inputs. Browser proof in a real Chromium (playwright-core): collision present at page open → `console.error`; collision introduced after load → `console.error`; collision removed → `console.info`; dev server with `base: '/app/'`. `build --watch` test: add conflicting import → error, remove import (file stays) → green rebuild. Exact-name collision test via `A_b`/`A`.

## План — vitest
A consumer's `vite.config.ts` also drives vitest, whose `pre` plugins (`vitest`, `vitest:project`) assign their own `css.modules.generateScopedName` (`classNameStrategy`, default `stable`). Plugin left active → the consumer's whole unit run dies on the "already set" refusal. Fork: env `VITEST` vs plugin names → plugin names. `process.env.VITEST` is set in every vitest process, including one that calls `build()` itself (this package's own tests), so it would switch the guard off silently there. When a vitest plugin is in the config, the plugin is inactive (no naming, no guard). Proof: a real `vitest run` subprocess on a fixture whose config carries the plugin and whose test imports a CSS module; red without the guard (checked once by disabling it).

## Notes
- Duplicate browser report found by the dev test: the hello answer and the post-compile broadcast carry the same text → the client prints a report only when it differs from the last one shown.
- `transform` forget (pre) and publish (post, companion plugin `plain-css-modules:settle`) are split so a recompile never flashes "resolved" between forgetting and re-recording.
- Live check on amiro (temporary config outside the repo, inline `generateScopedName` removed, plugin added): `vite build` CSS md5 and every asset file name equal to the original build.

## Bug review round 1 (mb-1932e449, a7bac2e) — 3 BLOCK, fixed
Root of all three: the registry dropped a file at the *start* of a transform (pre-hook forget) and relied on the compile to re-record it.
- `?raw` (and any request vite:css skips) forgot a compiled module without re-recording → false "resolved".
- A failing Sass/PostCSS compile forgot the last good names → false "resolved" while the old CSS still runs.
- `composes: x from './a/Card.module.css'` names a/Card through postcss-modules' FileSystemLoader (fs read, not a bundler module) → the `getModuleIds` filter dropped it and a real collision built green.
Fix: replacement keyed on the compiled source — `generateScopedName`'s third argument is the CSS of `filename` itself; a source the file was not recorded with means a compile reached naming, and only then are the file's old names replaced. The pre/post transform pair (and the companion plugin) is gone. Build liveness = recorded in this build cycle (`buildStart` bumps it; composed files included) OR in the graph (watch-mode cached modules).
Accepted residue: a module edited to declare no local class at all never reaches `generateScopedName`, so its old names stay counted in dev until the file is deleted or the server restarts (loud false positive, not a silent miss). Under `build --watch`, a file reached only through `composes` from an *unchanged* cached owner is not re-recorded in that cycle and drops out of the check for that rebuild.

## Bug review round 2 (mb-bb104f85, 3f3f917) — 2 BLOCK, fixed
Refuted: "the `css` argument of generateScopedName versions the file". (1) postcss-modules-scope names classes and only then rejects a missing `composes` target, so a failing compile still reaches naming with a new source and wiped the last good names → false "resolved". (2) One file is named twice with different sources: directly after Vite's preprocessors (`additionalData`, Sass), and raw through `composes`' FileSystemLoader — each wiped the other's names.
Fact behind the fix: no compile signals "these are now all of this file's names". So names only grow within a cycle and are replaced on the first naming of a new build cycle (`buildStart`). Dev runs one cycle → monotonic: a renamed/removed class keeps counting until the file is deleted or the server restarts (loud false positive, documented in README); never a silent miss. Build cycle reset keeps `build --watch` honest; a compile error fails that build anyway.
Test hardening: the dev browser test's "no reload" assertion moved to the moment the post-load collision appears — Vite itself may reload after a file still in its graph is deleted. The `--watch` test waits for the watcher to go quiet (a fresh fixture can trigger one extra rebuild under load).
Live run on amiro through `pnpm link` (worktree `plain-css-modules-link`, inline `generateScopedName` replaced by the plugin): `pnpm run build` green, CSS asset `app-90hRIYhR.css` identical to the build without the plugin. The amiro unit run (vitest loads the same config) had 2 failures in local-api tests (`surfaces-flag`, `presale-message-join`: nav surfaces / time), unrelated to CSS naming; not investigated.

## Bug review round 3 (mb-14a757ea, 854dfa2) — 1 BLOCK, fixed
Refuted: "replace a file's names on the first naming of a new build cycle". Under `build --watch` a file's cached direct compile (Sass `additionalData` adding `.b_c`) stays in the bundle while a new `composes` reads it raw and names only `.root`; the reset wiped `A_b_c` and a real `.A_b_c` collision built green. Same reset in dev via `server.perEnvironmentStartEndDuringDev` (a late environment's `buildStart` bumped the shared cycle).
Fix: names are monotonic per file until the file is deleted or the process restarts; cycles (bumped only for `command === 'build'`) decide liveness only. Accepted residue, documented in README: after renaming a class to fix a collision, restart `vite` / `build --watch`. Pinned by `test/collisions.test.ts`.
Live dev on amiro (link worktree, `VITE_LOCAL_API=1`, own port): clean app — client injected, no plugin output; temporary second `AppSidebar.module.scss` imported from `main.tsx` → terminal warn + browser `console.error` naming both files; revert → terminal "resolved".
