// Funções compartilhadas para buscar e aplicar dados públicos da ESPN
// (endpoint "scoreboard" não-oficial, sem necessidade de API key).
//
// Usado tanto pelo script de atualização automática
// (scripts/update-copa-data.mjs, em Node) quanto pelo botão "Atualizar
// agora" no front-end (copa/js/main.js, no navegador) — por isso este
// módulo não usa nenhuma API exclusiva do Node (fs, path, etc.).

import { sortGroupStandings } from './standings.js';

export const ESPN_SCOREBOARD_URL = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard';

// Mapeia o estado de status da ESPN (status.type.state) para o status usado neste site.
export const STATUS_MAP = { pre: 'scheduled', in: 'live', post: 'finished' };

export function normalize(str) {
  return String(str).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

export function addDaysUtc(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function tournamentWindow(matches) {
  const dates = [];
  (matches.groupStage || []).forEach(m => dates.push(m.date));
  Object.values(matches.knockout || {}).forEach(arr => arr.forEach(m => { if (m.date) dates.push(m.date); }));
  dates.sort();
  return { start: dates[0], end: dates[dates.length - 1] };
}

/* ============================================================
   CLIENTE ESPN
   ============================================================ */
export async function fetchScoreboard(dateStr) {
  const url = `${ESPN_SCOREBOARD_URL}?dates=${dateStr.replace(/-/g, '')}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/* ============================================================
   CASAMENTO DE TIMES (nomes do site <-> nomes da ESPN)
   ============================================================ */
export function buildAliasIndex(teams, aliases) {
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
export function applyScoreboard(matches, events, aliasIndex) {
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
   RECALCULA A CLASSIFICAÇÃO A PARTIR DOS JOGOS FINALIZADOS
   ============================================================ */
export function computeGroupsFromMatches(matches, teams) {
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

// Busca o placar da ESPN para ontem/hoje/amanhã (UTC) e aplica em uma cópia
// de `matches`. Retorna { matches, groups, changed } ou lança erro se todas
// as chamadas à ESPN falharem (rede, CORS, endpoint fora do ar, etc.).
export async function fetchLiveUpdate(matches, teams, aliases) {
  const aliasIndex = buildAliasIndex(teams, aliases);
  const todayUtc = new Date().toISOString().slice(0, 10);
  const dates = [-1, 0, 1].map(offset => addDaysUtc(todayUtc, offset));

  const events = [];
  let failures = 0;

  for (const date of dates) {
    try {
      const data = await fetchScoreboard(date);
      events.push(...(data.events || []));
    } catch {
      failures += 1;
    }
  }

  if (failures === dates.length) {
    throw new Error('Todas as chamadas à ESPN falharam.');
  }

  const updatedMatches = JSON.parse(JSON.stringify(matches));
  const changed = applyScoreboard(updatedMatches, events, aliasIndex);
  const groups = computeGroupsFromMatches(updatedMatches, teams);

  return { matches: updatedMatches, groups, changed };
}
