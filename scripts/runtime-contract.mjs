import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const repositoryRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
export const TOOLCHAIN_SCHEMA = 'dsh-office-toolchain/v1';

export function loadToolchainLock(root = repositoryRoot) {
  const path = join(root, 'toolchain.lock.json');
  const value = JSON.parse(readFileSync(path, 'utf8'));
  if (value?.schema !== TOOLCHAIN_SCHEMA || typeof value.version !== 'string' || !value.platforms || typeof value.platforms !== 'object') {
    throw new Error(`Invalid toolchain lock: ${path}`);
  }
  return value;
}

export function platformDefinition(lock, platform = 'win32-x64') {
  const value = lock.platforms?.[platform];
  if (!value?.runtimeLayout || !value.components || !value.artifacts || !Array.isArray(value.pythonWheels)) {
    throw new Error(`Toolchain lock does not define a complete ${platform} profile.`);
  }
  return value;
}

export function runtimeRoot(lock, root = repositoryRoot, platform = 'win32-x64') {
  return resolve(root, platformDefinition(lock, platform).runtimeLayout);
}

export function componentPath(root, component) {
  if (typeof component?.entry !== 'string' || component.entry.length === 0) return undefined;
  return resolve(root, component.entry);
}

export function manifestCandidates(root) {
  return [join(root, 'runtime.json'), join(root, '..', 'runtime.json'), join(root, '..', '..', 'runtime.json')];
}

export function findRuntimeManifest(root) {
  const path = manifestCandidates(root).find(existsSync);
  return path ? { path, value: JSON.parse(readFileSync(path, 'utf8')) } : undefined;
}
