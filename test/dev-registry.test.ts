import {createLogger, createServer} from 'vite';
import {describe, expect, it} from 'vitest';
import {plainCssModules} from '../src/index.js';
import {fixture} from './fixture.js';

async function devServer(files: Record<string, string>) {
    const project = fixture(files);
    const log: string[] = [];
    const logger = createLogger('silent');
    logger.warn = (message) => void log.push(`warn ${message}`);
    logger.info = (message) => void log.push(`info ${message}`);
    logger.error = () => {};
    const server = await createServer({
        root: project.root,
        configFile: false,
        customLogger: logger,
        server: {middlewareMode: true, watch: null},
        plugins: [plainCssModules()],
    });
    const compile = async (url: string) => {
        server.moduleGraph.invalidateAll();
        await server.transformRequest(url).catch(() => undefined);
    };
    const settled = () => new Promise((resolve) => setTimeout(resolve, 150));
    return {...project, server, log, compile, settled};
}

describe('vite dev registry', () => {
    it('keeps a standing collision through requests and compiles that do not name classes', async () => {
        const dev = await devServer({
            'a/Card.module.css': '.root { color: red }',
            'b/Card.module.css': '.title { color: blue }',
        });
        try {
            await dev.compile('/a/Card.module.css');
            await dev.compile('/b/Card.module.css');
            await expect.poll(() => dev.log).toEqual([expect.stringMatching(/^warn [\s\S]*a\/Card[\s\S]*b\/Card/)]);

            await dev.compile('/a/Card.module.css?raw');
            dev.write('a/Card.module.css', '.root { color: red');
            await dev.compile('/a/Card.module.css');
            await dev.settled();
            expect(dev.log).toHaveLength(1);
        } finally {
            await dev.server.close();
        }
    });

    it('drops the names a recompiled module no longer declares', async () => {
        const dev = await devServer({
            'A.module.css': '.b_c { color: red }',
            'A_b.module.css': '.c { color: blue }',
        });
        try {
            await dev.compile('/A.module.css');
            await dev.compile('/A_b.module.css');
            await expect.poll(() => dev.log).toEqual([expect.stringMatching(/^warn [\s\S]*\.A_b_c/)]);

            dev.write('A.module.css', '.other { color: red }');
            await dev.compile('/A.module.css');
            await expect.poll(() => dev.log).toEqual([expect.any(String), expect.stringMatching(/^info .*resolved/)]);
        } finally {
            await dev.server.close();
        }
    });
});
