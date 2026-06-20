#!/usr/bin/env node
// Analisa os commits do dia no diretório copa/ e gera um resumo
// no changelog.json. Roda automaticamente via hook pós-commit.
//
// Uso: node scripts/update-changelog.mjs
//   --date YYYY-MM-DD   (padrão: hoje)
//   --dry-run            (mostra o que seria gerado sem gravar)

import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CHANGELOG_PATH = resolve(__dirname, '../copa/data/changelog.json');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const dateIdx = args.indexOf('--date');
const targetDate = dateIdx >= 0 && args[dateIdx + 1] ? args[dateIdx + 1] : new Date().toISOString().slice(0, 10);

const IGNORE = [
  /^chore:/i,
  /^merge/i,
  /atualiza dados da copa/i,
  /^Co-Authored-By:/i,
  /^Claude-Session:/i,
  /^debug:/i,
  /gitignore/i,
  /node_modules/i,
  /\.claude/i,
  /^Corrige badge/i,
  /^Posiciona badge/i,
  /barra de rolagem/i,
  /^Add files via upload/i,
  /^Create /i,
];

function getCommitsForDate(date) {
  try {
    const since = `${date}T00:00:00`;
    const until = `${date}T23:59:59`;
    const raw = execSync(
      `git log --after="${since}" --before="${until}" --format="%s" -- copa/ copa-simulador/`,
      { encoding: 'utf8', cwd: resolve(__dirname, '..') }
    ).trim();
    if (!raw) return [];
    return raw.split('\n').filter(msg => !IGNORE.some(re => re.test(msg)));
  } catch {
    return [];
  }
}

function commitToItem(msg) {
  const clean = msg
    .replace(/^(feat|fix|refactor|style|perf|docs|test|ci|build|chore)\s*:\s*/i, '')
    .replace(/\s*\(#\d+\)\s*$/, '')
    .trim();

  if (!clean) return null;

  const first = clean.charAt(0).toUpperCase() + clean.slice(1);
  const parts = first.split(/\s*[-–—]\s*/);
  if (parts.length >= 2) {
    return `**${parts[0].trim()}** — ${parts.slice(1).join(' — ').trim()}`;
  }
  return first;
}

function main() {
  const commits = getCommitsForDate(targetDate);
  if (commits.length === 0) {
    console.log(`Nenhum commit relevante em ${targetDate}. Nada a fazer.`);
    return;
  }

  const items = commits.map(commitToItem).filter(Boolean);
  const unique = [...new Set(items)];

  if (unique.length === 0) {
    console.log('Nenhuma novidade para registrar.');
    return;
  }

  const changelog = JSON.parse(readFileSync(CHANGELOG_PATH, 'utf8'));
  const existing = changelog.entries.find(e => e.date === targetDate);

  if (existing) {
    console.log(`Dia ${targetDate} já tem ${existing.items.length} novidade(s) curadas. Nada a fazer.`);
    console.log('(Use --force para adicionar commits como rascunho mesmo assim.)');
    if (!args.includes('--force')) return;
    const newItems = unique.filter(item => !existing.items.some(
      ex => ex.toLowerCase().includes(item.toLowerCase().slice(0, 30))
    ));
    if (newItems.length === 0) {
      console.log('Todas as novidades já estão registradas.');
      return;
    }
    existing.items.push(...newItems);
    console.log(`Adicionadas ${newItems.length} novidade(s) ao dia ${targetDate}:`);
    newItems.forEach(i => console.log(`  + ${i}`));
  } else {
    changelog.entries.unshift({ date: targetDate, items: unique });
    console.log(`Criada entrada para ${targetDate} com ${unique.length} novidade(s):`);
    unique.forEach(i => console.log(`  + ${i}`));
  }

  if (dryRun) {
    console.log('\n(dry-run — nada foi gravado)');
    return;
  }

  writeFileSync(CHANGELOG_PATH, JSON.stringify(changelog, null, 2) + '\n');
  console.log('\nchangelog.json atualizado.');
}

main();
