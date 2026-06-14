#!/usr/bin/env node
// Atualiza copa/data/{matches,groups}.json com dados públicos da ESPN
// (endpoint "scoreboard" não-oficial, sem necessidade de API key).
//
// Fluxo:
//   1. Se a data atual (UTC) estiver fora do período do torneio (com 1 dia de
//      margem para cobrir diferenças de fuso), não faz nada.
//   2. Busca o placar da ESPN para ontem/hoje/amanhã (UTC) e tenta casar cada
//      jogo retornado com um jogo da fase de grupos pelo par de times (usando
//      copa/data/team-name-aliases.json para lidar com nomes em inglês/PT-BR).
//   3. Atualiza status (scheduled/live/finished) e placar de matches.json.
//   4. Para jogos em andamento ou recém-finalizados, busca o resumo
//      ("summary") da ESPN para preencher cartões (campo "cards", usado no
//      critério de desempate "fair play") e artilheiros (campo "scorers").
//   5. Recalcula copa/data/groups.json a partir dos jogos com status "finished",
//      aplicando os critérios oficiais de desempate (copa/js/standings.js), e
//      copa/data/scorers.json a partir dos gols registrados em cada jogo.
//
// Se a ESPN não responder (endpoint não-oficial, pode mudar sem aviso), o
// script não grava nada e os dados atuais permanecem (fallback seguro). O
// mesmo vale para scorers.json: só é sobrescrito depois que pelo menos um
// jogo tiver cartões/artilheiros lidos com sucesso da ESPN (campo
// "scorers" presente em matches.json), para não substituir uma lista
// preenchida manualmente por uma lista vazia.

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { addDaysUtc, tournamentWindow, fetchLiveUpdate } from '../copa/js/espn.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(__dirname, '../copa/data');

/* ============================================================
   HELPERS DE ARQUIVO
   ============================================================ */
function readJSON(name) {
  return JSON.parse(readFileSync(resolve(DATA_DIR, name), 'utf8'));
}

function readJSONOrDefault(name, fallback) {
  const path = resolve(DATA_DIR, name);
  if (!existsSync(path)) return fallback;
  return JSON.parse(readFileSync(path, 'utf8'));
}

function writeJSON(name, data) {
  writeFileSync(resolve(DATA_DIR, name), JSON.stringify(data, null, 2) + '\n');
}

/* ============================================================
   MAIN
   ============================================================ */
async function update() {
  const matches = readJSON('matches.json');
  const teams = readJSON('teams.json');
  const groups = readJSON('groups.json');
  const aliases = readJSONOrDefault('team-name-aliases.json', {});

  const todayUtc = new Date().toISOString().slice(0, 10);
  const window = tournamentWindow(matches);

  // Margem de 1 dia para cobrir diferenças entre a data "do site" (campo `date`
  // dos jogos) e a data UTC, que podem divergir em até um dia por fuso horário.
  if (todayUtc < addDaysUtc(window.start, -1) || todayUtc > addDaysUtc(window.end, 1)) {
    console.log(`Fora do período do torneio (${window.start} a ${window.end}). Nada a fazer.`);
    return;
  }

  let result;
  try {
    result = await fetchLiveUpdate(matches, teams, aliases);
  } catch (err) {
    console.error(`${err.message} Mantendo dados atuais.`);
    return;
  }

  const { matches: updatedMatches, groups: computedGroups, scorers: computedScorers, changed: matchesChanged } = result;
  const groupsChanged = JSON.stringify(computedGroups) !== JSON.stringify(groups);

  const hasScorersData = (updatedMatches.groupStage || []).some(m => Array.isArray(m.scorers));
  const scorers = readJSON('scorers.json');
  const scorersChanged = hasScorersData && JSON.stringify(computedScorers.scorers) !== JSON.stringify(scorers.scorers);

  if (matchesChanged) writeJSON('matches.json', updatedMatches);
  if (groupsChanged) writeJSON('groups.json', computedGroups);
  if (scorersChanged) writeJSON('scorers.json', computedScorers);

  console.log(`Atualizado. matches=${matchesChanged} groups=${groupsChanged} scorers=${scorersChanged}`);

  // DIAGNÓSTICO TEMPORÁRIO: inspeciona o summary da ESPN de um jogo já
  // finalizado para descobrir por que cartões/artilheiros não estão sendo
  // extraídos (extractMatchDetails). Remover depois.
  try {
    const res = await fetch('https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/summary?event=760425');
    const data = await res.json();
    console.log('DEBUG summary status:', res.status);
    console.log('DEBUG top-level keys:', Object.keys(data));
    const header = data.header;
    console.log('DEBUG header keys:', header ? Object.keys(header) : null);
    const competition = header && header.competitions && header.competitions[0];
    console.log('DEBUG competition keys:', competition ? Object.keys(competition) : null);
    if (competition) {
      console.log('DEBUG details isArray:', Array.isArray(competition.details), 'len:', (competition.details || []).length);
      console.log('DEBUG details sample:', JSON.stringify((competition.details || []).slice(0, 5)));
      console.log('DEBUG competitors:', JSON.stringify((competition.competitors || []).map(c => ({ homeAway: c.homeAway, teamId: c.team && c.team.id, teamDisplayName: c.team && c.team.displayName }))));
    }
    console.log('DEBUG array keys at top level:', Object.keys(data).filter(k => Array.isArray(data[k])).map(k => `${k}(${data[k].length})`));
  } catch (err) {
    console.log('DEBUG erro:', err.message);
  }
}

update().catch(err => {
  console.error(err.message);
  process.exit(1);
});
