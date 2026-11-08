import type {Plugin, PluginOption, ResolvedConfig, ViteDevServer} from 'vite';
import {CollisionRegistry, PLUGIN_NAME} from './collisions.js';
import {classPrefix, isCssModule, modulePath, scopedName} from './scoped-name.js';

export {classPrefix, scopedName} from './scoped-name.js';

const CLIENT_ID = `virtual:${PLUGIN_NAME}/client`;
const RESOLVED_CLIENT_ID = `\0${CLIENT_ID}`;
const REPORT_EVENT = `${PLUGIN_NAME}:collisions`;
const HELLO_EVENT = `${PLUGIN_NAME}:hello`;
const RESOLVED_MESSAGE = `[${PLUGIN_NAME}] CSS module class name collisions resolved.`;

// The client asks for the current report instead of waiting for a broadcast: a broadcast sent
// before the page connected (server start, full reload) would otherwise be lost. The answer and
// a broadcast can carry the same report, hence the comparison with the last one shown.
const CLIENT_CODE = `
let shown = '';
if (import.meta.hot) {
    import.meta.hot.on(${JSON.stringify(REPORT_EVENT)}, (report) => {
        if (report === shown) return;
        if (report) console.error(report);
        else console.info(${JSON.stringify(RESOLVED_MESSAGE)});
        shown = report;
    });
    import.meta.hot.send(${JSON.stringify(HELLO_EVENT)});
}
`;

/**
 * CSS module classes become `<FileBase>_<local>` (`Card.module.scss` `.root` → `Card_root`) in dev
 * and in the build. Two modules with one basename would share class names, so the plugin records
 * every compiled module: a collision fails `vite build` and is reported to the terminal and the
 * browser console in dev.
 */
export function plainCssModules(): Plugin[] {
    const collisions = new CollisionRegistry();
    let config: ResolvedConfig;
    let server: ViteDevServer | undefined;
    let published = '';
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Under vitest the plugin steps aside: vitest assigns its own generateScopedName (its
    // `css.modules.classNameStrategy`) from a `pre` config hook, and a test run has no page to warn.
    let active = true;

    function generateScopedName(local: string, filename: string): string {
        const name = scopedName(local, filename);
        if (collisions.record(modulePath(filename), classPrefix(filename), name)) schedulePublish();
        return name;
    }

    function forget(file: string): void {
        if (collisions.forget(modulePath(file))) schedulePublish();
    }

    // Publishing between forgetting a recompiled module and its re-recording would flash a
    // "resolved" for a collision that still stands, so the companion plugin publishes after compile.
    const settle: Plugin = {
        name: `${PLUGIN_NAME}:settle`,
        transform: {
            order: 'post',
            handler(_code, id) {
                if (active && isCssModule(id)) schedulePublish();
                return undefined;
            },
        },
    };

    // generateScopedName fires once per class; one report per burst of compiled modules.
    function schedulePublish(): void {
        if (!server) return;
        clearTimeout(timer);
        timer = setTimeout(publish, 50);
    }

    function publish(): void {
        const report = collisions.report(config.root);
        if (report === published) return;
        const wasShown = published !== '';
        published = report;
        if (report) config.logger.warn(report, {timestamp: true});
        else if (wasShown) config.logger.info(RESOLVED_MESSAGE, {timestamp: true});
        server?.ws.send(REPORT_EVENT, report);
    }

    const main: Plugin = {
        name: PLUGIN_NAME,

        config(userConfig) {
            if (hasVitestPlugin(userConfig.plugins)) {
                active = false;
                return undefined;
            }
            const modules = userConfig.css?.modules;
            if (modules === false) {
                throw new Error(`[${PLUGIN_NAME}] css.modules is false; remove the plugin or enable CSS modules.`);
            }
            if (modules?.generateScopedName !== undefined) {
                throw new Error(
                    `[${PLUGIN_NAME}] css.modules.generateScopedName is already set; the plugin owns class naming, remove it from the config.`,
                );
            }
            return {css: {modules: {generateScopedName}}};
        },

        configResolved(resolved) {
            config = resolved;
            if (!active) return;
            if (resolved.css.transformer === 'lightningcss') {
                throw new Error(
                    `[${PLUGIN_NAME}] css.transformer is 'lightningcss', which ignores css.modules; class names would stay hashed and unchecked.`,
                );
            }
            const modules = resolved.css.modules;
            if (!modules || modules.generateScopedName !== generateScopedName) {
                throw new Error(`[${PLUGIN_NAME}] another plugin replaced css.modules.generateScopedName.`);
            }
        },

        configureServer(devServer) {
            if (!active) return;
            server = devServer;
            devServer.ws.on(HELLO_EVENT, (_data, client) => {
                client.send(REPORT_EVENT, collisions.report(config.root));
            });
            devServer.watcher.on('unlink', forget);
            devServer.httpServer?.once('close', () => clearTimeout(timer));
        },

        // A recompiled module re-records its names; whatever it no longer declares must not linger.
        // `pre`: before `vite:css` compiles the module and calls generateScopedName.
        transform: {
            order: 'pre',
            handler(_code, id) {
                if (active && isCssModule(id)) collisions.forget(modulePath(id));
                return undefined;
            },
        },

        watchChange(id, change) {
            if (change.event === 'delete') forget(id);
        },

        resolveId(id) {
            return id === CLIENT_ID ? RESOLVED_CLIENT_ID : undefined;
        },

        load(id) {
            return id === RESOLVED_CLIENT_ID ? CLIENT_CODE : undefined;
        },

        transformIndexHtml() {
            if (!active || config.command !== 'serve') return undefined;
            return [
                {
                    tag: 'script',
                    attrs: {type: 'module', src: `${config.base}@id/__x00__${CLIENT_ID}`},
                    injectTo: 'head',
                },
            ];
        },

        buildEnd(error) {
            if (!active || error || server) return;
            // Under `build --watch` the registry outlives a removed import; only this build's graph counts.
            const live = new Set(Array.from(this.getModuleIds(), modulePath));
            const report = collisions.report(config.root, (file) => live.has(file));
            if (report) this.error(report);
        },
    };

    return [main, settle];
}

function hasVitestPlugin(plugins: PluginOption[] | undefined): boolean {
    return (plugins ?? []).some((plugin) =>
        Array.isArray(plugin)
            ? hasVitestPlugin(plugin)
            : !!plugin && 'name' in plugin && (plugin.name === 'vitest' || plugin.name === 'vitest:project'),
    );
}

export default plainCssModules;
