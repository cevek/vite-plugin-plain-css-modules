import fs from 'node:fs';
import path from 'node:path';
import {build, type InlineConfig, type Rolldown} from 'vite';
import {describe, expect, it} from 'vitest';
import {plainCssModules} from '../src/index.js';
import {fixture, readDist} from './fixture.js';

const page = '<!doctype html><script type="module" src="/main.js"></script>';

function config(root: string, extra: InlineConfig = {}): InlineConfig {
    return {root, configFile: false, logLevel: 'silent', plugins: [plainCssModules()], ...extra};
}

describe('vite build', () => {
    it('fails when two CSS modules share a basename, naming both', async () => {
        const {root} = fixture({
            'index.html': page,
            'main.js': `import a from './a/Card.module.css'; import b from './b/Card.module.css'; console.log(a, b);`,
            'a/Card.module.css': '.root { color: red }',
            'b/Card.module.css': '.title { color: blue }',
        });
        await expect(build(config(root))).rejects.toThrow(/Card_\*[\s\S]*a\/Card\.module\.css[\s\S]*b\/Card\.module\.css/);
    });

    it('fails when two CSS modules with different basenames generate one class name', async () => {
        const {root} = fixture({
            'index.html': page,
            'main.js': `import a from './A.module.css'; import b from './A_b.module.css'; console.log(a, b);`,
            'A.module.css': '.b_c { color: red }',
            'A_b.module.css': '.c { color: blue }',
        });
        await expect(build(config(root))).rejects.toThrow(/\.A_b_c[\s\S]*A\.module\.css[\s\S]*A_b\.module\.css/);
    });

    it('emits plain class names and no dev client', async () => {
        const {root} = fixture({
            'index.html': page,
            'main.js': `import s from './routes/patients_.$id.module.css'; document.body.className = s.root;`,
            'routes/patients_.$id.module.css': '.root { color: red }',
        });
        await build(config(root));
        const dist = readDist(root);
        expect(dist).toContain('.patients__id_root');
        expect(dist).toMatch(/root:.patients__id_root./);
        expect(dist).not.toContain('plain-css-modules');
    });

    it('under --watch, counts only the modules of the current build', async () => {
        const {root, write} = fixture({
            'index.html': page,
            'main.js': `import a from './a/Card.module.css'; console.log(a);`,
            'a/Card.module.css': '.root { color: red }',
            'b/Card.module.css': '.title { color: blue }',
        });
        const watcher = (await build(config(root, {build: {watch: {}}}))) as Rolldown.RolldownWatcher;
        const outcomes: string[] = [];
        let settled: (() => void) | undefined;
        watcher.on('event', (event) => {
            if (event.code === 'BUNDLE_END' || event.code === 'ERROR') {
                outcomes.push(event.code === 'ERROR' ? `error ${event.error.message}` : 'ok');
                event.result?.close();
                settled?.();
            }
        });
        const next = () => new Promise<void>((resolve) => (settled = resolve));
        try {
            await expect.poll(() => outcomes.length).toBe(1);
            const imported = next();
            write('main.js', `import a from './a/Card.module.css'; import b from './b/Card.module.css'; console.log(a, b);`);
            await imported;
            const dropped = next();
            // b/Card.module.css stays on disk; it is just no longer part of the build.
            write('main.js', `import a from './a/Card.module.css'; console.log(a);`);
            await dropped;
        } finally {
            await watcher.close();
        }
        expect(outcomes[0]).toBe('ok');
        expect(outcomes[1]).toMatch(/^error [\s\S]*b\/Card\.module\.css/);
        expect(outcomes[2]).toBe('ok');
        expect(fs.existsSync(path.join(root, 'b/Card.module.css'))).toBe(true);
    });

    it('refuses a config where it would silently do nothing', async () => {
        const {root} = fixture({'index.html': page, 'main.js': ''});
        await expect(build(config(root, {css: {transformer: 'lightningcss'}}))).rejects.toThrow(/lightningcss/);
        await expect(build(config(root, {css: {modules: {generateScopedName: '[local]'}}}))).rejects.toThrow(
            /generateScopedName is already set/,
        );
    });
});
