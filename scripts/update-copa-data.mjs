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
//   4. Recalcula copa/data/groups.json a partir dos jogos com status "finished"
//      (mesma lógica de pontuação usada no front-end para o placar provisório
//      de jogos em andamento).
//
// Se a ESPN não responder (endpoint não-oficial, pode mudar sem aviso), o
// script não grava nada e os dados atuais permanecem (fallback seguro).
//
// scorers.json (artilharia) não é atualizado automaticamente — segue manual.

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { sortGroupStandings } from '../copa/js/standings.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(__dirname, '../copa/data');

const ESPN_SCOREBOARD_URL = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard';

// Mapeia o estado de status da ESPN (status.type.state) para o status usado neste site.
const STATUS_MAP = { pre: 'scheduled', in: 'live', post: 'finished' };

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
   HELPERS GERAIS
   ============================================================ */
function normalize(str) {
  return String(str).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

function addDaysUtc(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function tournamentWindow(matches) {
  const dates = [];
  (matches.groupStage || []).forEach(m => dates.push(m.date));
  Object.values(matches.knockout || {}).forEach(arr => arr.forEach(m => { if (m.date) dates.push(m.date); }));
  dates.sort();
  return { start: dates[0], end: dates[dates.length - 1] };
}

/* ============================================================
   CLIENTE ESPN
   ============================================================ */
async function fetchScoreboard(dateStr) {
  const url = `${ESPN_SCOREBOARD_URL}?dates=${dateStr.replace(/-/g, '')}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/* ============================================================
   CASAMENTO DE TIMES (nomes do site <-> nomes da ESPN)
   ============================================================ */
function buildAliasIndex(teams, aliases) {
  const index = {};
  teams.forEach(t => {
    index[normalize(t.name)] = t.name;
    (aliases[t.name] || []).forEach(alias => {
      index[normalize(alias)] = t.name;
    });
  });
  return index;
}

/* ============================================================
   APLICA PLACAR/STATUS DA ESPN EM matches.json
   ============================================================ */
function applyScoreboard(matches, events, aliasIndex) {
  let changed = false;

  events.forEach(event => {
    const competition = event.competitions && event.competitions[0];
    if (!competition) return;

    const competitors = competition.competitors || [];
    const home = competitors.find(c => c.homeAway === 'home');
    const away = competitors.find(c => c.homeAway === 'away');
    if (!home || !away || !home.team || !away.team) return;

    const homeName = aliasIndex[normalize(home.team.displayName)];
    const awayName = aliasIndex[normalize(away.team.displayName)];
    if (!homeName || !awayName) return;

    const state = (competition.status && competition.status.type && competition.status.type.state)
      || (event.status && event.status.type && event.status.type.state);
    const mapped = STATUS_MAP[state];
    if (!mapped) return;

    const target = (matches.groupStage || []).find(m =>
      (m.home === homeName && m.away === awayName) || (m.home === awayName && m.away === homeName));
    if (!target) return;

    if (target.status !== mapped) { target.status = mapped; changed = true; }

    if (mapped !== 'scheduled') {
      const sameOrientation = target.home === homeName;
      const homeScore = Number(home.score);
      const awayScore = Number(away.score);
      if (Number.isFinite(homeScore) && Number.isFinite(awayScore)) {
        const newHomeScore = sameOrientation ? homeScore : awayScore;
        const newAwayScore = sameOrientation ? awayScore : homeScore;
        if (target.homeScore !== newHomeScore || target.awayScore !== newAwayScore) {
          target.homeScore = newHomeScore;
          target.awayScore = newAwayScore;
          changed = true;
        }
      }
      if ('time' in target) { delete target.time; changed = true; }
    }
  });

  return changed;
}

/* ============================================================
   RECALCULA groups.json A PARTIR DOS JOGOS FINALIZADOS
   ============================================================ */
function computeGroupsFromMatches(matches, teams) {
  const groups = {};

  teams.forEach(t => {
    if (!groups[t.group]) groups[t.group] = [];
    groups[t.group].push({ team: t.name, flag: t.flag, pj: 0, v: 0, e: 0, d: 0, gp: 0, gc: 0, sg: 0, pts: 0, fairPlay: 0 });
  });

  const finishedMatches = (matches.groupStage || [])
    .filter(m => m.status === 'finished' && m.homeScore != null && m.awayScore != null);

  finishedMatches.forEach(m => {
    const groupArr = groups[m.group];
    if (!groupArr) return;
    const home = groupArr.find(t => t.team === m.home);
    const away = groupArr.find(t => t.team === m.away);
    if (!home || !away) return;

    const cards = m.cards || {};
    [[home, m.homeScore, m.awayScore, cards.home], [away, m.awayScore, m.homeScore, cards.away]].forEach(([team, gf, ga, fairPlayDelta]) => {
      team.pj += 1;
      team.gp += gf;
      team.gc += ga;
      team.sg = team.gp - team.gc;
      if (gf > ga) { team.v += 1; team.pts += 3; }
      else if (gf === ga) { team.e += 1; team.pts += 1; }
      else { team.d += 1; }
      team.fairPlay += (fairPlayDelta || 0);
    });
  });

  const fifaRankingByTeam = {};
  teams.forEach(t => { fifaRankingByTeam[t.name] = t.fifaRanking; });

  Object.keys(groups).forEach(letter => {
    const groupMatches = finishedMatches.filter(m => m.group === letter);
    const withRanking = groups[letter].map(t => ({ ...t, fifaRanking: fifaRankingByTeam[t.team] }));
    groups[letter] = sortGroupStandings(withRanking, groupMatches).map(({ fifaRanking, ...rest }) => rest);
  });

  return groups;
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

  const dates = [-1, 0, 1].map(offset => addDaysUtc(todayUtc, offset));
  const events = [];
  let failures = 0;

  for (const date of dates) {
    try {
      const data = await fetchScoreboard(date);
      events.push(...(data.events || []));
    } catch (err) {
      failures += 1;
      console.warn(`Falha ao buscar ESPN para ${date}: ${err.message}`);
    }
  }

  if (failures === dates.length) {
    console.error('Todas as chamadas à ESPN falharam. Mantendo dados atuais.');
    return;
  }

  if (events.length === 0) {
    console.log('ESPN não retornou jogos para o período. Nada a fazer.');
    return;
  }

  const aliasIndex = buildAliasIndex(teams, aliases);
  const matchesChanged = applyScoreboard(matches, events, aliasIndex);

  const computedGroups = computeGroupsFromMatches(matches, teams);
  const groupsChanged = JSON.stringify(computedGroups) !== JSON.stringify(groups);

  if (matchesChanged) writeJSON('matches.json', matches);
  if (groupsChanged) writeJSON('groups.json', computedGroups);

  console.log(`Atualizado. matches=${matchesChanged} groups=${groupsChanged} (${events.length} evento(s) recebido(s))`);
}

update().catch(err => {
  console.error(err.message);
  process.exit(1);
});
