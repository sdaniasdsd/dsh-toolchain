#!/usr/bin/env node
// 运行时验收脚本：给一个运行时根目录（含 python/、libreoffice/、poppler/ 的那一层），
// 逐项检查并打印结论。退出码 0 = 全部通过，1 = 有缺项或版本不符。
//
//   node scripts/verify-runtime.mjs <runtimeRoot>            人类可读输出
//   node scripts/verify-runtime.mjs <runtimeRoot> --json     机器可读输出
//
// 检查什么（都是 DSH office 插件真正会用到的东西，不是"目录看起来对不对"）：
//   1. 三件二进制的存在与自报版本；
//   2. 插件 Python 侧真正 import 的包：lxml / pptx / PIL / xlsxwriter / typing_extensions；
//   3. 每个组件的体积与文件数；
//   4. 同目录或上一级若有 runtime.json，校验其 schema / version / platform / components.present。
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const asJson = process.argv.includes('--json');
const runtimeRoot = resolve(args[0] ?? '.');
const manifestPath = [join(runtimeRoot, 'runtime.json'), join(runtimeRoot, '..', 'runtime.json'), join(runtimeRoot, '..', '..', 'runtime.json')].find((path) => existsSync(path)) ?? null;

const results = [];
const record = (id, ok, detail) => { results.push({ id, ok, detail }); };

const run = (command, commandArgs, timeout = 30000) => spawnSync(command, commandArgs, { encoding: 'utf8', windowsHide: true, timeout });

// ---- 1. 三件二进制 -----------------------------------------------------------
const binaries = [
  { id: 'python', path: join(runtimeRoot, 'python', 'python.exe'), args: ['--version'] },
  { id: 'libreoffice', path: join(runtimeRoot, 'libreoffice', 'program', 'soffice.com'), args: ['--version'], timeout: 60000 },
  { id: 'poppler', path: join(runtimeRoot, 'poppler', 'poppler-26.09.0', 'Library', 'bin', 'pdftoppm.exe'), args: ['-v'] },
];
for (const binary of binaries) {
  if (!existsSync(binary.path)) { record(`binary:${binary.id}`, false, `缺失 ${binary.path}`); continue; }
  const probe = run(binary.path, binary.args, binary.timeout ?? 30000);
  const output = `${probe.stdout ?? ''}${probe.stderr ?? ''}`.trim().split('\n')[0] ?? '';
  record(`binary:${binary.id}`, probe.status === 0 && Boolean(output), output || `exit ${probe.status}`);
}

// ---- 2. Python 侧真正用到的包 ------------------------------------------------
const python = join(runtimeRoot, 'python', 'python.exe');
if (existsSync(python)) {
  for (const name of ['lxml', 'pptx', 'PIL', 'xlsxwriter', 'typing_extensions']) {
    const probe = run(python, ['-c', `import ${name} as m; print(getattr(m, '__version__', 'ok'))`]);
    record(`python:${name}`, probe.status === 0, (probe.stdout ?? '').trim() || (probe.stderr ?? '').trim().split('\n').pop() || `exit ${probe.status}`);
  }
}

// ---- 3. 体积与文件数 ---------------------------------------------------------
const measure = (path) => {
  let bytes = 0; let files = 0;
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const child = join(dir, entry.name);
      if (entry.isDirectory()) walk(child);
      else if (entry.isFile()) { bytes += statSync(child).size; files += 1; }
    }
  };
  if (existsSync(path)) walk(path);
  return { bytes, files };
};
const sizes = {};
for (const name of ['python', 'libreoffice', 'poppler']) sizes[name] = measure(join(runtimeRoot, name));
record('sizes:none-empty', Object.values(sizes).every((entry) => entry.files > 0), JSON.stringify(sizes));

// ---- 4. runtime.json（若存在） ----------------------------------------------
let manifest = null;
if (manifestPath) {
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    record('manifest:schema', manifest.schema === 'dsh-office-runtime/v1', String(manifest.schema));
    record('manifest:platform', manifest.platform === 'win32-x64', String(manifest.platform));
    const missing = Object.entries(manifest.components ?? {}).filter(([, info]) => info.present !== true).map(([name]) => name);
    record('manifest:components', missing.length === 0, missing.length ? `标记为缺失：${missing.join(', ')}` : '三个组件都标 present');
  } catch (error) {
    record('manifest:parse', false, error.message);
  }
} else {
  record('manifest:found', false, '没找到 runtime.json（同目录或上一级）——打包成运行时包时需要它');
}

const failed = results.filter((entry) => !entry.ok);
if (asJson) {
  console.log(JSON.stringify({ runtimeRoot, manifestPath, passed: results.length - failed.length, failed: failed.length, results, sizes, manifest }, null, 2));
} else {
  console.log(`运行时根目录: ${runtimeRoot}`);
  console.log(`runtime.json : ${manifestPath ?? '(未找到)'}`);
  for (const entry of results) console.log(`  ${entry.ok ? '✓' : '✗'} ${entry.id.padEnd(26)} ${entry.detail}`);
  console.log(`\n体积：${Object.entries(sizes).map(([name, info]) => `${name} ${(info.bytes / 1048576).toFixed(0)}MB/${info.files} files`).join('，')}`);
  console.log(failed.length ? `\n结论：${failed.length} 项未通过 —— ${failed.map((entry) => entry.id).join(', ')}` : '\n结论：全部通过');
}
process.exit(failed.length ? 1 : 0);
