import {expect, it} from 'vitest';
import {CollisionRegistry} from '../src/collisions.js';

// Under `build --watch`, A's cached direct compile (with `.b_c` from Sass additionalData) stays in the
// bundle while a new `composes` reads A raw and names only `.root`; A's earlier names must survive.
it('keeps a file’s names when a later cycle names only some of them', () => {
    const registry = new CollisionRegistry();
    registry.nextCycle();
    registry.record('/p/A.module.scss', 'A', 'A_root');
    registry.record('/p/A.module.scss', 'A', 'A_b_c');
    registry.nextCycle();
    registry.record('/p/A.module.scss', 'A', 'A_root');
    registry.record('/p/A_b.module.css', 'A_b', 'A_b_c');
    expect(registry.report('/p')).toMatch(/\.A_b_c[\s\S]*A\.module\.scss[\s\S]*A_b\.module\.css/);
});
