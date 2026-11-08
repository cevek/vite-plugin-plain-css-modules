import {describe, expect, it} from 'vitest';
import {classPrefix, scopedName} from '../src/scoped-name.js';

// Verbatim from amiro/vite.config.ts (css.modules.generateScopedName) — the naming this package extracts.
function amiroGenerateScopedName(name: string, filename: string) {
    const base = filename
        .replace(/\\/g, '/')
        .split('/')
        .pop()!
        .replace(/\.module\.(scss|sass|css|less)$/i, '')
        .replace(/[^A-Za-z0-9_-]+/g, '_');
    return `${base}_${name}`;
}

describe('scopedName', () => {
    it.each([
        '/src/components/Card/Card.module.scss',
        '/src/routes/patients_.$id.module.scss',
        '/src/a/Some-Thing.module.css',
        'C:\\repo\\src\\Card\\Card.module.sass',
        '/src/x/Legacy.module.less',
    ])('names %s exactly as amiro did', (file) => {
        expect(scopedName('root', file)).toBe(amiroGenerateScopedName('root', file));
    });

    it.each([
        ['/src/Card.module.css?used', 'Card'],
        ['/src/Card.module.styl', 'Card'],
        ['/src/2col.module.css', '_2col'],
        ['/src/-1col.module.css', '_-1col'],
    ])('prefix of %s is %s', (file, prefix) => {
        expect(classPrefix(file)).toBe(prefix);
    });

    it('gives one prefix to basenames that differ only in characters a selector cannot hold', () => {
        expect(classPrefix('/a/a$b.module.scss')).toBe(classPrefix('/b/a_b.module.css'));
    });
});
