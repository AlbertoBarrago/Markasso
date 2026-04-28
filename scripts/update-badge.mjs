import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const summary = JSON.parse(
  readFileSync(resolve(root, 'coverage/coverage-summary.json'), 'utf8'),
);

const total = summary.total;
const pct = Math.floor(total.statements.pct);
const color = pct >= 80 ? 'brightgreen' : pct >= 60 ? 'yellow' : 'red';
const badge = `https://img.shields.io/badge/coverage-${pct}%25-${color}`;

const readmePath = resolve(root, 'README.md');
const readme = readFileSync(readmePath, 'utf8');
const updated = readme.replace(
  /!\[Coverage\]\(https:\/\/img\.shields\.io\/badge\/coverage-[^)]+\)/,
  `![Coverage](${badge})`,
);
writeFileSync(readmePath, updated);
console.log(`Coverage badge updated: ${pct}% (${color})`);
