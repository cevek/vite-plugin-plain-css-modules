import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {afterEach} from 'vitest';

const dirs: string[] = [];

afterEach(() => {
    for (const dir of dirs.splice(0)) fs.rmSync(dir, {recursive: true, force: true});
});

/** A throwaway project: `files` maps project-relative paths to contents. */
export function fixture(files: Record<string, string>): {root: string; write(file: string, content: string): void; remove(file: string): void} {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'plain-css-modules-')));
    dirs.push(root);
    const write = (file: string, content: string) => {
        const target = path.join(root, file);
        fs.mkdirSync(path.dirname(target), {recursive: true});
        fs.writeFileSync(target, content);
    };
    for (const [file, content] of Object.entries(files)) write(file, content);
    return {root, write, remove: (file) => fs.rmSync(path.join(root, file))};
}

export function readDist(root: string): string {
    const dist = path.join(root, 'dist');
    return fs
        .readdirSync(dist, {recursive: true, encoding: 'utf8'})
        .filter((file) => fs.statSync(path.join(dist, file)).isFile())
        .map((file) => fs.readFileSync(path.join(dist, file), 'utf8'))
        .join('\n');
}
