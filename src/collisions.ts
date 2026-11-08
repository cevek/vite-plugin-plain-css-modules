import path from 'node:path';

export const PLUGIN_NAME = 'plain-css-modules';

class Owners {
    private readonly filesByKey = new Map<string, Set<string>>();
    private readonly keysByFile = new Map<string, Set<string>>();

    add(key: string, file: string): boolean {
        let keys = this.keysByFile.get(file);
        if (keys?.has(key)) return false;
        if (!keys) this.keysByFile.set(file, (keys = new Set()));
        keys.add(key);
        let files = this.filesByKey.get(key);
        if (!files) this.filesByKey.set(key, (files = new Set()));
        files.add(file);
        return true;
    }

    removeFile(file: string): boolean {
        const keys = this.keysByFile.get(file);
        if (!keys) return false;
        this.keysByFile.delete(file);
        for (const key of keys) {
            const files = this.filesByKey.get(key)!;
            files.delete(file);
            if (files.size === 0) this.filesByKey.delete(key);
        }
        return true;
    }

    shared(isLive: (file: string) => boolean): Array<[key: string, files: string[]]> {
        const groups: Array<[string, string[]]> = [];
        for (const [key, owners] of this.filesByKey) {
            const files = [...owners].filter(isLive).sort();
            if (files.length > 1) groups.push([key, files]);
        }
        return groups.sort(([a], [b]) => a.localeCompare(b));
    }
}

/**
 * Two checks: a class prefix (file basename) belongs to one file — the naming policy, which flags
 * a clash before any class is shared — and a generated class name belongs to one file, which also
 * catches `A_b.module.css .c` against `A.module.css .b_c` (both `A_b_c`).
 */
export class CollisionRegistry {
    private readonly prefixes = new Owners();
    private readonly names = new Owners();
    private readonly prefixOf = new Map<string, string>();
    private readonly sourceOf = new Map<string, string>();
    private readonly cycleOf = new Map<string, number>();
    private cycle = 0;

    /** Starts a build cycle; `recordedThisCycle` tells which files the cycle compiled. */
    nextCycle(): void {
        this.cycle++;
    }

    recordedThisCycle(file: string): boolean {
        return this.cycleOf.get(file) === this.cycle;
    }

    /**
     * `source` is the module's CSS as compiled now. A source the file was not recorded with means a
     * fresh compile reached naming, so the file's previous names are replaced. Nothing is dropped
     * before that point: a compile that fails, or a request that never compiles (`?raw`), leaves the
     * last successful names in place. Returns true when this changed the registry.
     */
    record(file: string, source: string, prefix: string, name: string): boolean {
        this.cycleOf.set(file, this.cycle);
        let replaced = false;
        if (this.sourceOf.get(file) !== source) {
            replaced = this.forget(file);
            this.sourceOf.set(file, source);
        }
        this.prefixOf.set(file, prefix);
        const newPrefix = this.prefixes.add(prefix, file);
        const newName = this.names.add(name, file);
        return replaced || newPrefix || newName;
    }

    /** Returns true when the file was known. */
    forget(file: string): boolean {
        this.prefixOf.delete(file);
        this.sourceOf.delete(file);
        const hadPrefix = this.prefixes.removeFile(file);
        const hadNames = this.names.removeFile(file);
        return hadPrefix || hadNames;
    }

    /** `''` when nothing collides. */
    report(root: string, isLive: (file: string) => boolean = () => true): string {
        const prefixGroups = this.prefixes.shared(isLive);
        // Names shared by files of one prefix are already explained by that prefix group.
        const nameGroups = this.names
            .shared(isLive)
            .filter(([, files]) => new Set(files.map((file) => this.prefixOf.get(file))).size > 1);
        if (prefixGroups.length === 0 && nameGroups.length === 0) return '';
        const lines = [`[${PLUGIN_NAME}] CSS module class names collide:`];
        for (const [prefix, files] of prefixGroups) {
            lines.push(`  ${prefix}_* — one basename, several CSS modules:`);
            for (const file of files) lines.push(`    ${displayPath(root, file)}`);
        }
        for (const [name, files] of nameGroups) {
            lines.push(`  .${name} — one class name from several CSS modules:`);
            for (const file of files) lines.push(`    ${displayPath(root, file)}`);
        }
        lines.push('Rename one CSS module in each group.');
        return lines.join('\n');
    }
}

function displayPath(root: string, file: string): string {
    const relative = path.relative(root, file).replace(/\\/g, '/');
    return relative.startsWith('..') ? file : relative;
}
