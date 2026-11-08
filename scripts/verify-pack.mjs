// Runs before publish, after the build: the tarball must hold the built entry and its types,
// and the entry must load and produce the plugin.
import {execFileSync} from 'node:child_process';

const [pack] = JSON.parse(execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {encoding: 'utf8'}));
const files = pack.files.map((f) => f.path);
const required = ['package.json', 'README.md', 'dist/index.js', 'dist/index.d.ts'];
const missing = required.filter((f) => !files.includes(f));
const stray = files.filter((f) => !required.includes(f) && !f.startsWith('dist/'));
if (missing.length || stray.length) {
    console.error(`verify-pack: missing ${JSON.stringify(missing)}, unexpected ${JSON.stringify(stray)}`);
    process.exit(1);
}

const {plainCssModules} = await import('../dist/index.js');
const plugin = plainCssModules();
if (plugin?.name !== 'plain-css-modules') {
    console.error('verify-pack: dist/index.js does not produce the plugin');
    process.exit(1);
}
console.log(`verify-pack: ${pack.name}@${pack.version}, ${files.length} files OK`);
