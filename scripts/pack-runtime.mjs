import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { findRuntimeManifest, loadToolchainLock, repositoryRoot, runtimeRoot as defaultRuntimeRoot } from './runtime-contract.mjs';

const lock = loadToolchainLock();
const source = resolve(process.argv.find(value => !value.startsWith('--') && value !== process.argv[0] && value !== process.argv[1]) ?? defaultRuntimeRoot(lock));
const output = resolve(repositoryRoot, 'dist', 'dsh-docx-runtime');
if (!existsSync(source)) throw new Error(`Runtime root is missing: ${source}`);
const manifest = findRuntimeManifest(source);
if (!manifest || manifest.value.schema !== lock.runtimeManifestSchema) throw new Error(`A valid ${lock.runtimeManifestSchema} manifest is required before packaging.`);

await rm(output, { recursive: true, force: true });
await mkdir(join(output, 'runtime', 'win32-x64'), { recursive: true });
await cp(source, join(output, 'runtime', 'win32-x64'), { recursive: true });
await cp(manifest.path, join(output, 'runtime.json'));
await writeFile(join(output, 'package.json'), JSON.stringify({ name: lock.package.name, version: lock.package.version, private: false, type: 'module', files: ['runtime', 'runtime.json', 'README.md'], os: ['win32'], cpu: ['x64'], description: 'Hash-verified DSH Office runtime; no install scripts and no runtime downloads.' }, null, 2) + '\n');
await writeFile(join(output, 'README.md'), `# ${lock.package.name} ${lock.package.version}\n\nOffline DSH Office runtime package built from the pinned \`toolchain.lock.json\`. It contains Python, LibreOffice and Poppler only; Agent, model, UI and background services are out of scope.\n`);
const packed = spawnSync('npm', ['pack', output, '--pack-destination', dirname(output)], { cwd: repositoryRoot, stdio: 'inherit', windowsHide: true, shell: process.platform === 'win32' });
process.exit(packed.status ?? 1);
