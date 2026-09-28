import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { componentPath, loadToolchainLock, platformDefinition, repositoryRoot, runtimeRoot } from '../scripts/runtime-contract.mjs';

test('lock declares a complete Windows profile without making Java a bundled requirement', () => {
  const lock = loadToolchainLock();
  const profile = platformDefinition(lock);
  assert.equal(lock.schema, 'dsh-office-toolchain/v1');
  for (const id of ['python', 'libreoffice', 'poppler']) assert.equal(profile.components[id].required, true);
  assert.equal(profile.components.java.required, false);
  assert.equal(profile.components.java.hostOwned, true);
});

test('every bundled component resolves inside the declared runtime root', () => {
  const lock = loadToolchainLock();
  const profile = platformDefinition(lock);
  const root = runtimeRoot(lock);
  for (const id of ['python', 'libreoffice', 'poppler']) {
    const path = componentPath(root, profile.components[id]);
    assert.ok(path?.startsWith(root));
  }
});

test('all fetched artifacts and Python wheels are hash pinned', () => {
  const profile = platformDefinition(loadToolchainLock());
  for (const artifact of [...Object.values(profile.artifacts), ...profile.pythonWheels]) {
    assert.match(artifact.sha256, /^[a-f0-9]{64}$/);
    assert.match(artifact.url, /^https:\/\//);
  }
});

test('the example manifest follows the canonical forward-slash entry contract', () => {
  const example = JSON.parse(readFileSync(new URL('../runtime.example.json', import.meta.url), 'utf8'));
  const profile = platformDefinition(loadToolchainLock());
  assert.equal(repositoryRoot.endsWith('dsh-toolchain'), true);
  for (const id of ['python', 'libreoffice', 'poppler']) {
    assert.equal(example.components[id].entry, profile.components[id].entry);
    assert.equal(example.components[id].entry.includes('\\'), false);
  }
});
