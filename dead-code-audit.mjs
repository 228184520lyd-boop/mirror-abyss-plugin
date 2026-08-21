#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const bundlePath = resolve(process.argv.find((value) => value.endsWith('.js')) || './app.js');
const source = await readFile(bundlePath, 'utf8');

function stripCommentsAndStrings(input) {
  let output = '';
  let state = 'code';
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    const next = input[index + 1];
    if (state === 'code') {
      if (char === '/' && next === '/') { state = 'line'; output += '  '; index += 1; continue; }
      if (char === '/' && next === '*') { state = 'block'; output += '  '; index += 1; continue; }
      if (char === "'") { state = 'single'; output += ' '; continue; }
      if (char === '"') { state = 'double'; output += ' '; continue; }
      if (char === '`') { state = 'template'; output += ' '; continue; }
      output += char;
      continue;
    }
    if (state === 'line') {
      if (char === '\n') { state = 'code'; output += '\n'; } else output += ' ';
      continue;
    }
    if (state === 'block') {
      if (char === '*' && next === '/') { state = 'code'; output += '  '; index += 1; }
      else output += char === '\n' ? '\n' : ' ';
      continue;
    }
    if (char === '\\') { output += '  '; index += 1; continue; }
    const closes = (state === 'single' && char === "'")
      || (state === 'double' && char === '"')
      || (state === 'template' && char === '`');
    if (closes) state = 'code';
    output += char === '\n' ? '\n' : ' ';
  }
  return output;
}

const executable = stripCommentsAndStrings(source);
const declarations = [...executable.matchAll(/\b(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g)]
  .map((match) => match[1]);
const uniqueDeclarations = [...new Set(declarations)];
const unreferenced = uniqueDeclarations.filter((name) => {
  const occurrences = executable.match(new RegExp(`\\b${name.replace(/[$]/g, '\\$&')}\\b`, 'g')) ?? [];
  return occurrences.length === 1;
});
const methodNames = [...executable.matchAll(/^\s+(?:async\s+)?([A-Za-z_$][\w$]*)\s*\([^\n{}]*\)\s*\{/gm)]
  .map((match) => match[1])
  .filter((name) => !['constructor', 'if', 'for', 'while', 'switch', 'catch'].includes(name));
const unreferencedMethods = [...new Set(methodNames)].filter((name) => {
  const occurrences = executable.match(new RegExp(`\\b${name.replace(/[$]/g, '\\$&')}\\b`, 'g')) ?? [];
  return occurrences.length === 1;
});

console.log(JSON.stringify({
  bundlePath,
  declaredFunctions: uniqueDeclarations.length,
  unreferenced,
  unreferencedMethods,
}, null, 2));

if (unreferenced.length || unreferencedMethods.length) process.exitCode = 1;
