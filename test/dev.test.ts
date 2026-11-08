import {chromium, type Browser} from 'playwright-core';
import {createLogger, createServer, type ViteDevServer} from 'vite';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {plainCssModules} from '../src/index.js';
import {fixture} from './fixture.js';

const selfAccepting = 'if (import.meta.hot) import.meta.hot.accept();';
const importsA = `import a from './a/Card.module.css'; console.log(a); ${selfAccepting}`;
const importsBoth = `import a from './a/Card.module.css'; import b from './b/Card.module.css'; console.log(a, b); ${selfAccepting}`;

let browser: Browser;
beforeAll(async () => {
    browser = await chromium.launch();
});
afterAll(async () => {
    await browser?.close();
});

async function startDev(files: Record<string, string>) {
    const project = fixture({'index.html': '<!doctype html><script type="module" src="./main.js"></script>', ...files});
    const warnings: string[] = [];
    const logger = createLogger('silent');
    logger.warn = (message) => void warnings.push(message);
    const server: ViteDevServer = await createServer({
        root: project.root,
        configFile: false,
        base: '/app/',
        customLogger: logger,
        server: {port: 0, host: '127.0.0.1'},
        plugins: [plainCssModules()],
    });
    await server.listen();
    const page = await browser.newPage();
    const consoled: Array<{type: string; text: string}> = [];
    page.on('console', (message) => consoled.push({type: message.type(), text: message.text()}));
    await page.goto(server.resolvedUrls!.local[0]!);
    return {...project, server, page, consoled, warnings};
}

describe('vite dev', () => {
    it('reports a collision that exists when the page opens, in the terminal and the browser console', async () => {
        const dev = await startDev({
            'main.js': importsBoth,
            'a/Card.module.css': '.root { color: red }',
            'b/Card.module.css': '.title { color: blue }',
        });
        try {
            await expect
                .poll(() => dev.consoled.filter((m) => m.type === 'error').map((m) => m.text))
                .toEqual([expect.stringMatching(/Card_\*[\s\S]*a\/Card\.module\.css[\s\S]*b\/Card\.module\.css/)]);
            // The hello answer and the post-compile broadcast both carry this report; it must print once.
            await dev.page.waitForTimeout(300);
            expect(dev.consoled.filter((m) => m.type === 'error')).toHaveLength(1);
            expect(dev.warnings).toEqual([expect.stringMatching(/a\/Card\.module\.css[\s\S]*b\/Card\.module\.css/)]);
        } finally {
            await dev.page.close();
            await dev.server.close();
        }
    });

    it('reports a collision introduced after load and announces when it is gone', async () => {
        const dev = await startDev({
            'main.js': importsA,
            'a/Card.module.css': '.root { color: red }',
            'b/Card.module.css': '.title { color: blue }',
        });
        try {
            await expect.poll(() => dev.consoled.some((m) => m.text.includes('[vite] connected'))).toBe(true);
            expect(dev.consoled.filter((m) => m.type === 'error')).toEqual([]);

            dev.write('main.js', importsBoth);
            await expect
                .poll(() => dev.consoled.filter((m) => m.type === 'error').map((m) => m.text))
                .toEqual([expect.stringMatching(/b\/Card\.module\.css/)]);

            dev.write('main.js', importsA);
            dev.remove('b/Card.module.css');
            await expect
                .poll(() => dev.consoled.filter((m) => m.type === 'info').map((m) => m.text))
                .toContainEqual(expect.stringMatching(/collisions resolved/));
            // The page never reloaded: the reports above reached a live page through the HMR channel.
            expect(dev.consoled.filter((m) => m.text.includes('[vite] connected'))).toHaveLength(1);
        } finally {
            await dev.page.close();
            await dev.server.close();
        }
    });
});
