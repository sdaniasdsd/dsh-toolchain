import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { loadToolchainLock, repositoryRoot, runtimeRoot } from './runtime-contract.mjs';

const minimumNode = 20;
const major = Number(process.versions.node.split('.')[0]);
if (!Number.isInteger(major) || major < minimumNode) throw new Error(`Node.js ${minimumNode}+ is required; found ${process.version}.`);

const lock = loadToolchainLock();
const root = runtimeRoot(lock);
const withRuntime = process.argv.includes('--with-runtime');
console.log(`DSH toolchain bootstrap: ${lock.version} (${root})`);

if (withRuntime && !existsSync(root)) {
  const powershell = process.platform === 'win32' ? 'pwsh.exe' : 'pwsh';
  const fetched = spawnSync(powershell, ['-File', 'scripts/fetch-runtime.ps1', '-RuntimeRoot', root], { cwd: repositoryRoot, stdio: 'inherit', windowsHide: true });
  if (fetched.status !== 0) process.exit(fetched.status ?? 1);
}

if (existsSync(root)) {
  const verified = spawnSync(process.execPath, ['scripts/verify-runtime.mjs', root], { cwd: repositoryRoot, stdio: 'inherit', windowsHide: true });
  if (verified.status !== 0) process.exit(verified.status ?? 1);
} else {
  console.log('Runtime is intentionally absent. Run npm run bootstrap:with-runtime or npm run prepare:runtime when an offline runtime is needed.');
}

console.log('Bootstrap complete: lock and profile are valid. No Agent, model, UI, or background service was started.');
