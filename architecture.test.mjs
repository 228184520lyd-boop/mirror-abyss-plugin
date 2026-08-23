import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function filesUnder(directory) {
  const output = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) output.push(...await filesUnder(target));
    else if (/\.(?:js|css|json|md)$/u.test(entry.name)) output.push(target);
  }
  return output;
}

test('Source contains one directed dependency chain', async () => {
  const files = (await filesUnder(path.join(root, 'src'))).filter(file => file.endsWith('.js'));
  const rank = file => file.includes('/core/') ? 0 : file.includes('/adapters/') ? 1 : file.includes('/application/') ? 2 : file.includes('/ui/') ? 3 : 4;
  for (const file of files) {
    const source = await readFile(file, 'utf8');
    for (const match of source.matchAll(/from\s+['"](\.\.?\/[^'"]+)['"]/gu)) {
      const target = path.resolve(path.dirname(file), match[1]);
      assert.ok(rank(target) <= rank(file), `${path.relative(root, file)} has a reverse dependency on ${path.relative(root, target)}`);
    }
  }
});

test('Worldbook reads and writes have one owner', async () => {
  const files = await filesUnder(root);
  const readers = [];
  const writers = [];
  for (const file of files.filter(file => file.endsWith('.js'))) {
    const source = await readFile(file, 'utf8');
    if (/\.loadWorldInfo\s*\(/u.test(source)) readers.push(path.relative(root, file));
    if (/\.saveWorldInfo\s*\(/u.test(source)) writers.push(path.relative(root, file));
  }
  assert.deepEqual(readers, ['src/adapters/worldbook.js']);
  assert.deepEqual(writers, ['src/adapters/worldbook.js']);
});

test('Controller orchestrates without owning worldbook item rules', async () => {
  const source = await readFile(path.join(root, 'src/application/controller.js'), 'utf8');
  assert.doesNotMatch(source, /core\/entry|WorldbookRepository|\.worldbook\b/u);
});

test('Host contracts follow the documented extension boundary', async () => {
  const host = await readFile(path.join(root, 'src/adapters/host.js'), 'utf8');
  const worldbook = await readFile(path.join(root, 'src/adapters/worldbook.js'), 'utf8');
  const manifest = JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8'));
  const entry = await readFile(path.join(root, 'index.js'), 'utf8');
  assert.match(host, /globalThis\.SillyTavern\?\.getContext/u);
  assert.doesNotMatch(host, /from ['"]\/scripts\//u);
  assert.match(worldbook, /createNewWorldInfo[\s\S]*createWorldInfoEntry[\s\S]*from ['"]\/scripts\/world-info\.js['"]/u);
  for (const hook of Object.values(manifest.hooks)) assert.match(entry, new RegExp(`export async function ${hook}\\b`, 'u'));
});

test('Boundary failures are not created as anonymous Error values', async () => {
  const files = (await filesUnder(path.join(root, 'src'))).filter(file => file.endsWith('.js'));
  const source = (await Promise.all(files.map(file => readFile(file, 'utf8')))).join('\n');
  assert.doesNotMatch(source, /throw new Error\s*\(/u);
  assert.match(source, /MirrorAbyssError\(source, code, message, cause\)/u);
});

test('No parallel storage, semantic guessing, or obsolete envelope exists', async () => {
  const files = await filesUnder(root);
  const source = (await Promise.all(files.map(file => readFile(file, 'utf8')))).join('\n');
  assert.doesNotMatch(source, /localStorage|indexedDB|runtimeMemory|similarity|levenshtein/iu);
  assert.doesNotMatch(source, /<<<|KEYWORDS>>>|CONTENT>>>/u);
  assert.doesNotMatch(source, /fallbackPrompt|migrationPlan|migrationReview/u);
});

test('Mobile layout owns the viewport without competing inner widths', async () => {
  const css = await readFile(path.join(root, 'style.css'), 'utf8');
  assert.match(css, /@media \(max-width: 720px\)[\s\S]*\.ma-panel\s*\{[^}]*inset:\s*0[^}]*width:\s*100vw[^}]*height:\s*100dvh/u);
  assert.match(css, /\.ma-main\s*\{[^}]*min-height:\s*0[^}]*overflow:\s*auto/u);
  assert.match(css, /\.ma-root, \.ma-root \*\s*\{\s*box-sizing:\s*border-box/u);
});

test('Source units stay reviewable', async () => {
  const files = (await filesUnder(path.join(root, 'src'))).filter(file => file.endsWith('.js'));
  for (const file of files) {
    const lines = (await readFile(file, 'utf8')).split('\n').length;
    assert.ok(lines <= 430, `${path.relative(root, file)} is ${lines} lines; split its responsibilities`);
  }
});
