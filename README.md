# vite-plugin-plain-css-modules

Readable, hash-free CSS module class names for Vite — in dev **and** in the production build — with a
built-in guard that two CSS modules never share a class name.

```css
/* src/components/Card/Card.module.scss */
.root { … }   /* → .Card_root */
.title { … }  /* → .Card_title */
```

## Install

```sh
npm i -D vite-plugin-plain-css-modules
```

```ts
// vite.config.ts
import {defineConfig} from 'vite';
import {plainCssModules} from 'vite-plugin-plain-css-modules';

export default defineConfig({
    plugins: [plainCssModules()],
});
```

No options. The plugin owns `css.modules.generateScopedName`; do not set it yourself.

## Naming

`<prefix>_<class>`, where `<prefix>` is the file name without `.module.<ext>` (css, scss, sass, less,
styl, stylus, pcss, postcss, sss). Characters a class selector cannot hold become `_`
(`patients_.$id.module.scss` → `patients__id_*`); a prefix starting with a digit gets a leading `_`.

## Collision guard

Without a hash, two modules named `Card.module.scss` in different folders would silently share their
styles. The plugin records every CSS module Vite compiles and reports two kinds of collision:

- **one basename, several modules** — `a/Card.module.css` and `b/Card.module.css`;
- **one class name, several modules** — `A.module.css .b_c` and `A_b.module.css .c` are both `A_b_c`.

Where it is reported:

| | |
|---|---|
| `vite build` | the build fails with the colliding files listed |
| `vite` (dev) | a warning in the terminal and `console.error` in the browser; a `console.info` once it is resolved |

Only modules that are actually compiled count — an unused file never trips the guard, while a file pulled in
through `composes` does. The guard errs on the loud side: every class a module has ever declared stays
counted until its file is deleted or the process restarts, so after renaming a class to fix a collision,
restart `vite` / `vite build --watch`. A compile that fails part-way never clears a standing collision. In
dev a module also stays counted after nothing imports it any more; `vite build` (including `--watch`) counts
only files the current build compiled or bundled.

The browser report needs Vite's HMR client and an HTML entry (`index.html`), into which the plugin injects a
small dev-only script. Nothing is injected into the production bundle.

## Refused configurations

The plugin throws instead of silently doing nothing when:

- `css.transformer` is `'lightningcss'` (Vite ignores `css.modules` there);
- `css.modules` is `false`, or `css.modules.generateScopedName` is already set.

## Vitest

When the same config drives vitest, the plugin is inactive: vitest names classes itself
(`test.css.modules.classNameStrategy`) and a test run has no page to warn.

## Development

```sh
npm install
npx playwright-core install chromium-headless-shell   # the dev tests drive a real browser
npm run check     # typecheck + tests
npm run release   # check, build, verify the tarball, then npm publish
```

## License

MIT
