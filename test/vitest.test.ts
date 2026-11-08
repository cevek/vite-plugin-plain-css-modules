import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {expect, it} from 'vitest';
import {fixture} from './fixture.js';

const plugin = fileURLToPath(new URL('../src/index.ts', import.meta.url));
const vitestBin = fileURLToPath(new URL('../node_modules/vitest/vitest.mjs', import.meta.url));

// A consumer's vite.config.ts also drives their unit tests; vitest assigns its own class names there.
it('steps aside when the config runs under vitest', () => {
    const {root} = fixture({
        'vite.config.ts': `import {plainCssModules} from ${JSON.stringify(plugin)};
export default {plugins: [plainCssModules()], test: {globals: true, css: true}};`,
        'Card.module.css': '.root { color: red }',
        'card.test.js': `import s from './Card.module.css';
test('vitest names the class', () => { expect(s.root).toMatch(/root/); });`,
    });
    const run = spawnSync(process.execPath, [vitestBin, 'run', '--root', root], {encoding: 'utf8', env: {...process.env, CI: '1'}});
    expect(run.stdout + run.stderr).toMatch(/1 passed/);
    expect(run.status).toBe(0);
});
