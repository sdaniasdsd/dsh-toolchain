import { spawnSync } from 'node:child_process';
import { loadToolchainLock, repositoryRoot, runtimeRoot } from './runtime-contract.mjs';

const lock = loadToolchainLock();
const root = runtimeRoot(lock);
if (process.argv.includes('--plan')) {
  const profile = lock.platforms['win32-x64'];
  console.log(JSON.stringify({ schema: lock.schema, version: lock.version, runtimeRoot: root, components: profile.components, artifacts: Object.values(profile.artifacts).map(value => ({ name: value.name, sha256: value.sha256 })), pythonWheels: profile.pythonWheels.map(value => ({ name: value.name, sha256: value.sha256 })) }, null, 2));
  process.exit(0);
}
const powershell = process.platform === 'win32' ? 'pwsh.exe' : 'pwsh';
const result = spawnSync(powershell, ['-File', 'scripts/fetch-runtime.ps1', '-RuntimeRoot', root], { cwd: repositoryRoot, stdio: 'inherit', windowsHide: true });
process.exit(result.status ?? 1);
