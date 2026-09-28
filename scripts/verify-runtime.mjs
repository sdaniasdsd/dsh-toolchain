#!/usr/bin/env node
// Strict acceptance gate for a host-owned DSH runtime. The version pins,
// executable paths and Python imports all come from toolchain.lock.json.
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { componentPath, findRuntimeManifest, loadToolchainLock, platformDefinition } from './runtime-contract.mjs';

const args = process.argv.slice(2).filter(value => !value.startsWith('--'));
const asJson = process.argv.includes('--json');
const runtimeRoot = resolve(args[0] ?? '.');
const lock = loadToolchainLock();
const platform = platformDefinition(lock);
const results = [];
const record = (id, ok, detail) => results.push({ id, ok, detail });
const run = (command, commandArgs, timeout = 30000) => spawnSync(command, commandArgs, { encoding: 'utf8', windowsHide: true, timeout });

for (const [id, component] of Object.entries(platform.components)) {
  if (!component.required) continue;
  const path = componentPath(runtimeRoot, component);
  if (!path || !existsSync(path)) { record(`binary:${id}`, false, `missing ${path ?? 'entry is undefined'}`); continue; }
  const probe = run(path, component.probe ?? ['--version'], component.timeoutMs ?? 30000);
  const output = `${probe.stdout ?? ''}${probe.stderr ?? ''}`.trim().split('\n')[0] ?? '';
  record(`binary:${id}`, probe.status === 0 && Boolean(output), output || `exit ${probe.status}`);
}

const python = componentPath(runtimeRoot, platform.components.python);
if (python && existsSync(python)) {
  for (const wheel of platform.pythonWheels) {
    const probe = run(python, ['-c', `import ${wheel.import} as m; print(getattr(m, '__version__', 'ok'))`]);
    record(`python:${wheel.import}`, probe.status === 0, (probe.stdout ?? '').trim() || (probe.stderr ?? '').trim().split('\n').pop() || `exit ${probe.status}`);
  }
}

const measure = path => {
  let bytes = 0; let files = 0;
  const walk = directory => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const child = join(directory, entry.name);
      if (entry.isDirectory()) walk(child);
      else if (entry.isFile()) { bytes += statSync(child).size; files += 1; }
    }
  };
  if (existsSync(path)) walk(path);
  return { bytes, files };
};
const sizes = {};
for (const [id, component] of Object.entries(platform.components)) {
  if (!component.required || typeof component.entry !== 'string') continue;
  sizes[id] = measure(join(runtimeRoot, component.entry.split('/')[0]));
}
record('sizes:none-empty', Object.values(sizes).every(entry => entry.files > 0), JSON.stringify(sizes));

const found = findRuntimeManifest(runtimeRoot);
let manifest = null;
if (!found) {
  record('manifest:found', false, 'runtime.json was not found next to the runtime package');
} else {
  manifest = found.value;
  record('manifest:schema', manifest.schema === lock.runtimeManifestSchema, String(manifest.schema));
  record('manifest:version', manifest.version === lock.runtimeVersion, String(manifest.version));
  record('manifest:platform', manifest.platform === 'win32-x64', String(manifest.platform));
  for (const [id, component] of Object.entries(platform.components)) {
    if (!component.required) continue;
    const actual = manifest.components?.[id];
    record(`manifest:component:${id}`, actual?.present === true && actual.entry === component.entry, actual ? JSON.stringify(actual) : 'missing');
  }
}

const failed = results.filter(entry => !entry.ok);
if (asJson) console.log(JSON.stringify({ runtimeRoot, manifestPath: found?.path ?? null, passed: results.length - failed.length, failed: failed.length, results, sizes, manifest }, null, 2));
else {
  console.log(`Runtime root : ${runtimeRoot}`);
  console.log(`runtime.json : ${found?.path ?? '(not found)'}`);
  for (const entry of results) console.log(`  ${entry.ok ? '✓' : '✗'} ${entry.id.padEnd(32)} ${entry.detail}`);
  console.log(`\nSizes: ${Object.entries(sizes).map(([name, info]) => `${name} ${(info.bytes / 1048576).toFixed(0)}MB/${info.files} files`).join(', ')}`);
  console.log(failed.length ? `\nResult: ${failed.length} check(s) failed — ${failed.map(entry => entry.id).join(', ')}` : '\nResult: all checks passed');
}
process.exit(failed.length ? 1 : 0);
