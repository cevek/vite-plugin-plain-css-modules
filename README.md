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

Only modules that are actually compiled count — an unused file never trips the guard. In dev a module stays
counted until its file is deleted or the server restarts, even if nothing imports it any more; `vite build`
(including `--watch`) counts only the modules of the current build.

The browser report needs Vite's HMR client and an HTML entry (`index.html`), into which the plugin injects a
small dev-only script. Nothing is injected into the production bundle.

## Refused configurations

The plugin throws instead of silently doing nothing when:

- `css.transformer` is `'lightningcss'` (Vite ignores `css.modules` there);
- `css.modules` is `false`, or `css.modules.generateScopedName` is already set.

## License

MIT
