#!/usr/bin/env node
// Atualiza copa/data/{matches,groups,scorers}.json com dados da API-Football (api-sports.io).
//
// Modos:
//   --discover         Descobre o league/season corretos da Copa do Mundo 2026 e grava
//                       copa/data/source-config.json. Rodar uma vez antes de tudo.
//   --bootstrap-teams   Busca a lista de times da competição e gera
//                       copa/data/team-mapping.json a partir de copa/data/team-name-aliases.json.
//                       Rodar uma vez após o --discover (e de novo se times não baterem).
//   (sem argumento)     Atualização normal: decide se vale a pena chamar a API hoje/agora
//                       (orçamento de 100 req/dia do plano free) e, se sim, atualiza
//                       matches.json (fase de grupos), groups.json e scorers.json.
//
// Requer a variável de ambiente API_FOOTBALL_KEY (configurada como secret do GitHub).

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(__dirname, '../copa/data');

const API_KEY = process.env.API_FOOTBALL_KEY;
const BASE_URL = 'https://v3.football.api-sports.io';

// Margem de segurança sobre o limite de 100 req/dia do plano free da API-Football.
const MAX_DAILY_CALLS = 90;

// Status de jogo "em andamento" na API-Football (v3).
const LIVE_STATUSES = new Set(['1H', 'HT', '2H', 'ET', 'BT', 'P', 'SUSP', 'INT']);

// Mapeia status da API-Football para o status usado neste site.
const STATUS_MAP = {
  NS: 'scheduled', TBD: 'scheduled', PST: 'scheduled',
  '1H': 'live', HT: 'live', '2H': 'live', ET: 'live', BT: 'live', P: 'live', SUSP: 'live', INT: 'live',
  FT: 'finished', AET: 'finished', PEN: 'finished'
};

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
   HELPERS DE DATA/HORA (portados de copa/js/main.js)
   ============================================================ */
function zonedTimeToUtc(dateStr, hour, minute, timeZone) {
  const naive = new Date(`${dateStr}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00Z`);
  const asTz = new Date(naive.toLocaleString('en-US', { timeZone }));
  const asUtc = new Date(naive.toLocaleString('en-US', { timeZone: 'UTC' }));
  const diff = asTz.getTime() - asUtc.getTime();
  return new Date(naive.getTime() - diff);
}

function parseMatchTime(match) {
  const raw = match.time;
  if (!raw || raw === '—') return null;
  const m = raw.match(/^(\d{1,2})h(\d{2})?\s*(ET)?(?:\s*\((\d{2})\/(\d{2})\))?$/);
  if (!m) return null;

  const hour = Number(m[1]);
  const minute = m[2] ? Number(m[2]) : 0;
  const isET = !!m[3];
  let dateStr = match.date;
  if (m[4] && m[5]) {
    const year = match.date.split('-')[0];
    dateStr = `${year}-${m[5]}-${m[4]}`;
  }
  return { hour, minute, isET, dateStr };
}

const VENUE_ALIASES = {
  'East Rutherford': 'eastrutherford',
  'Foxborough': 'foxborough',
  'Arlington': 'dallas'
};

function buildVenueIndex(stadiums) {
  const byId = {};
  (stadiums || []).forEach(s => { byId[s.id] = s; });

  const index = {};
  (stadiums || []).forEach(s => { index[s.city] = s; });
  Object.keys(VENUE_ALIASES).forEach(venue => {
    const stadium = byId[VENUE_ALIASES[venue]];
    if (stadium) index[venue] = stadium;
  });
  return index;
}

function computeKickoffUtc(match, venueIndex) {
  const parsed = parseMatchTime(match);
  if (!parsed) return null;
  const stadium = venueIndex[match.venue];
  const tz = parsed.isET ? 'America/New_York' : (stadium ? stadium.timezone : 'America/New_York');
  return zonedTimeToUtc(parsed.dateStr, parsed.hour, parsed.minute, tz);
}

function normalize(str) {
  return String(str).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

/* ============================================================
   CLIENTE API-FOOTBALL
   ============================================================ */
async function apiGet(path, params, state) {
  if (!API_KEY) throw new Error('API_FOOTBALL_KEY não está definida no ambiente.');

  const url = new URL(BASE_URL + path);
  Object.entries(params || {}).forEach(([k, v]) => url.searchParams.set(k, v));

  const res = await fetch(url, { headers: { 'x-apisports-key': API_KEY } });
  if (state) state.callsUsed += 1;

  if (!res.ok) throw new Error(`API ${path} -> HTTP ${res.status}`);
  const json = await res.json();
  if (json.errors && Array.isArray(json.errors) ? json.errors.length : Object.keys(json.errors || {}).length) {
    throw new Error(`API ${path} -> ${JSON.stringify(json.errors)}`);
  }
  return json;
}

/* ============================================================
   MODO --discover
   ============================================================ */
async function discover() {
  const state = { callsUsed: 0 };
  const data = await apiGet('/leagues', { search: 'World Cup' }, state);

  const candidates = (data.response || [])
    .filter(item => item.league && item.league.type === 'Cup' && /world cup/i.test(item.league.name))
    .map(item => ({
      id: item.league.id,
      name: item.league.name,
      country: item.country && item.country.name,
      seasons: (item.seasons || []).map(s => s.year)
    }));

  const config = readJSONOrDefault('source-config.json', {});
  let withSeason2026 = candidates.filter(c => c.seasons.includes(2026));

  // Prefere o torneio principal sobre eliminatórias/qualificações (ex: "World Cup - Qualification ...")
  const mainTournament = withSeason2026.filter(c => /^world cup$/i.test(c.name.trim()));
  if (mainTournament.length === 1) withSeason2026 = mainTournament;

  if (withSeason2026.length === 1) {
    const chosen = withSeason2026[0];
    config.league = chosen.id;
    config.season = 2026;
    config.leagueName = chosen.name;
    config.confirmed = true;
    config.discoveredAt = new Date().toISOString();
    delete config.candidates;
    console.log(`Confirmado: league=${chosen.id} ("${chosen.name}"), season=2026`);
  } else {
    config.confirmed = false;
    config.candidates = candidates;
    console.log(`Não foi possível confirmar automaticamente (${withSeason2026.length} candidatos com season 2026).`);
    console.log('Candidatos encontrados:', JSON.stringify(candidates, null, 2));
    console.log('Edite copa/data/source-config.json manualmente com o league id correto, defina "confirmed": true e rode --bootstrap-teams.');
  }

  writeJSON('source-config.json', config);
  console.log(`(${state.callsUsed} chamada(s) à API usada(s))`);
}

/* ============================================================
   MODO --bootstrap-teams
   ============================================================ */
async function bootstrapTeams() {
  const config = readJSON('source-config.json');
  if (!config.confirmed || !config.league || !config.season) {
    throw new Error('source-config.json não está confirmado. Rode --discover primeiro (ou ajuste manualmente).');
  }

  const state = { callsUsed: 0 };
  const data = await apiGet('/teams', { league: config.league, season: config.season }, state);
  const apiTeams = (data.response || []).map(t => t.team); // { id, name, ... }

  const teams = readJSON('teams.json');
  const aliases = readJSONOrDefault('team-name-aliases.json', {});

  const mapping = { _comment: 'Mapeamento time -> { apiId, apiName } na API-Football. Gerado por --bootstrap-teams.' };
  const unmatched = [];

  teams.forEach(t => {
    const alias = aliases[t.name];
    const candidates = [alias, t.name].filter(Boolean);

    let found = null;
    for (const candidate of candidates) {
      found = apiTeams.find(at => at.name.toLowerCase() === candidate.toLowerCase())
        || apiTeams.find(at => normalize(at.name) === normalize(candidate));
      if (found) break;
    }

    if (found) {
      mapping[t.name] = { apiId: found.id, apiName: found.name };
    } else {
      unmatched.push(t.name);
    }
  });

  writeJSON('team-mapping.json', mapping);
  console.log(`Mapeados ${Object.keys(mapping).length - 1}/${teams.length} times.`);
  if (unmatched.length) {
    console.warn('Não mapeados (ajuste team-name-aliases.json ou team-mapping.json manualmente):', unmatched.join(', '));
  }
  console.log(`(${state.callsUsed} chamada(s) à API usada(s))`);
}

/* ============================================================
   JANELA DE ATUALIZAÇÃO (decide se vale a pena chamar a API)
   ============================================================ */
function tournamentWindow(matches) {
  const dates = [];
  (matches.groupStage || []).forEach(m => dates.push(m.date));
  Object.values(matches.knockout || {}).forEach(arr => arr.forEach(m => { if (m.date) dates.push(m.date); }));
  dates.sort();
  return { start: dates[0], end: dates[dates.length - 1] };
}

function todaysGroupMatches(matches, today) {
  return (matches.groupStage || []).filter(m => m.date === today);
}

// Decide se devemos chamar a API agora, e se a checagem deve ser "profunda"
// (também buscar standings + artilharia, não só status dos jogos de hoje).
function decideAction(matches, stadiums, today, now) {
  const todays = todaysGroupMatches(matches, today);
  if (todays.length === 0) {
    return { call: false, reason: 'sem jogos da fase de grupos hoje' };
  }

  if (todays.some(m => m.status === 'live')) {
    return { call: true, deep: true, reason: 'jogo em andamento hoje' };
  }

  const venueIndex = buildVenueIndex(stadiums);
  const kickoffs = todays
    .filter(m => m.status === 'scheduled')
    .map(m => computeKickoffUtc(m, venueIndex))
    .filter(Boolean)
    .map(d => d.getTime());

  if (kickoffs.length === 0) {
    return { call: false, reason: 'jogos de hoje sem horário definido' };
  }

  const windowStart = Math.min(...kickoffs) - 2 * 3600 * 1000;
  const windowEnd = Math.max(...kickoffs) + 2 * 3600 * 1000;
  const nowMs = now.getTime();

  if (nowMs < windowStart || nowMs > windowEnd) {
    return { call: false, reason: 'fora da janela de jogos de hoje (2h antes do 1º até 2h depois do último)' };
  }

  return { call: true, deep: false, reason: 'dentro da janela de jogos de hoje' };
}

/* ============================================================
   TRANSFORMAÇÕES: API-FOOTBALL -> JSON DO SITE
   ============================================================ */
function applyFixtures(matches, fixtures, mapping) {
  const reverseMap = {};
  Object.entries(mapping).forEach(([name, info]) => {
    if (info && info.apiId != null) reverseMap[info.apiId] = name;
  });

  let changed = false;

  fixtures.forEach(f => {
    const homeName = reverseMap[f.teams.home.id];
    const awayName = reverseMap[f.teams.away.id];
    if (!homeName || !awayName) return;

    const mapped = STATUS_MAP[f.fixture.status.short];
    if (!mapped) return;

    const target = (matches.groupStage || []).find(m =>
      m.date === f.fixture.date.slice(0, 10) && m.home === homeName && m.away === awayName);
    if (!target) return;

    if (target.status !== mapped) { target.status = mapped; changed = true; }

    if (mapped !== 'scheduled') {
      if (target.homeScore !== f.goals.home || target.awayScore !== f.goals.away) {
        target.homeScore = f.goals.home;
        target.awayScore = f.goals.away;
        changed = true;
      }
      if ('time' in target) { delete target.time; changed = true; }
    }
  });

  return changed;
}

function applyStandings(groups, standingsResp, mapping, teams) {
  const reverseMap = {};
  Object.entries(mapping).forEach(([name, info]) => {
    if (info && info.apiId != null) reverseMap[info.apiId] = name;
  });

  const flagByName = {};
  teams.forEach(t => { flagByName[t.name] = t.flag; });

  const leagueStandings = standingsResp.response?.[0]?.league?.standings || [];
  let changed = false;

  leagueStandings.forEach(groupArr => {
    if (!groupArr.length) return;
    const groupMatch = (groupArr[0].group || '').match(/Group ([A-L])/i);
    if (!groupMatch) return;
    const letter = groupMatch[1].toUpperCase();

    const rows = groupArr
      .map(entry => {
        const name = reverseMap[entry.team.id];
        if (!name) return null;
        return {
          team: name,
          flag: flagByName[name] || '',
          pj: entry.all.played,
          v: entry.all.win,
          e: entry.all.draw,
          d: entry.all.lose,
          gp: entry.all.goals.for,
          gc: entry.all.goals.against,
          sg: entry.goalsDiff,
          pts: entry.points
        };
      })
      .filter(Boolean);

    if (rows.length === groupArr.length) {
      groups[letter] = rows;
      changed = true;
    }
  });

  return changed;
}

function transformScorers(scorersResp, mapping, teams) {
  const reverseMap = {};
  Object.entries(mapping).forEach(([name, info]) => {
    if (info && info.apiId != null) reverseMap[info.apiId] = name;
  });

  const flagByName = {};
  teams.forEach(t => { flagByName[t.name] = t.flag; });

  const scorers = (scorersResp.response || [])
    .map(entry => {
      const stat = entry.statistics && entry.statistics[0];
      const teamName = stat && reverseMap[stat.team.id];
      const goals = stat && stat.goals && stat.goals.total;
      if (!teamName || !goals) return null;
      return { name: entry.player.name, country: `${flagByName[teamName] || ''} ${teamName}`.trim(), goals };
    })
    .filter(Boolean)
    .sort((a, b) => b.goals - a.goals)
    .slice(0, 10);

  return { scorers };
}

/* ============================================================
   MODO PADRÃO: atualização com orçamento de chamadas
   ============================================================ */
async function update() {
  const config = readJSON('source-config.json');
  if (!config.confirmed) {
    console.log('source-config.json não confirmado. Rode --discover primeiro. Nada a fazer.');
    return;
  }

  const mapping = readJSON('team-mapping.json');
  if (Object.keys(mapping).filter(k => k !== '_comment').length === 0) {
    console.log('team-mapping.json vazio. Rode --bootstrap-teams primeiro. Nada a fazer.');
    return;
  }

  const matches = readJSON('matches.json');
  const stadiums = readJSON('stadiums.json');
  const groups = readJSON('groups.json');
  const teams = readJSON('teams.json');

  const now = new Date();
  const today = now.toISOString().slice(0, 10);

  const window = tournamentWindow(matches);
  if (today < window.start || today > window.end) {
    console.log(`Fora do período do torneio (${window.start} a ${window.end}). Nada a fazer.`);
    return;
  }

  let state = readJSONOrDefault('update-state.json', {});
  if (state.date !== today) {
    state = { date: today, callsUsed: 0, fixtureStatuses: {} };
  }
  state.fixtureStatuses = state.fixtureStatuses || {};

  const decision = decideAction(matches, stadiums, today, now);
  console.log(`Decisão: ${decision.call ? 'chamar API' : 'não chamar API'} (${decision.reason})`);

  if (!decision.call) {
    writeJSON('update-state.json', state);
    return;
  }

  if (state.callsUsed + 1 > MAX_DAILY_CALLS) {
    console.log(`Orçamento diário (${MAX_DAILY_CALLS}) esgotado (usado: ${state.callsUsed}). Nada a fazer.`);
    writeJSON('update-state.json', state);
    return;
  }

  const fixturesResp = await apiGet('/fixtures', { league: config.league, season: config.season, date: today }, state);
  const fixtures = fixturesResp.response || [];

  // Detecta transições de status (virou "live" ou "FT") desde a última checagem,
  // para decidir se vale a pena gastar chamadas extras com standings/artilharia.
  let deep = decision.deep;
  fixtures.forEach(f => {
    const id = f.fixture.id;
    const curr = f.fixture.status.short;
    const prev = state.fixtureStatuses[id];
    if (prev !== curr && (LIVE_STATUSES.has(curr) || curr === 'FT')) deep = true;
    state.fixtureStatuses[id] = curr;
  });

  let standingsChanged = false;
  let scorersData = null;

  if (deep && state.callsUsed + 2 <= MAX_DAILY_CALLS) {
    const standingsResp = await apiGet('/standings', { league: config.league, season: config.season }, state);
    standingsChanged = applyStandings(groups, standingsResp, mapping, teams);

    const scorersResp = await apiGet('/players/topscorers', { league: config.league, season: config.season }, state);
    scorersData = transformScorers(scorersResp, mapping, teams);
  } else if (deep) {
    console.log('Checagem "profunda" pulada por orçamento (standings/artilharia).');
  }

  const matchesChanged = applyFixtures(matches, fixtures, mapping);

  if (matchesChanged) writeJSON('matches.json', matches);
  if (standingsChanged) writeJSON('groups.json', groups);
  if (scorersData) writeJSON('scorers.json', scorersData);

  state.lastRun = now.toISOString();
  writeJSON('update-state.json', state);

  console.log(`Atualizado. matches=${matchesChanged} groups=${standingsChanged} scorers=${!!scorersData} (${state.callsUsed} chamada(s) hoje)`);
}

/* ============================================================
   MAIN
   ============================================================ */
const mode = process.argv[2];

(async () => {
  if (mode === '--discover') await discover();
  else if (mode === '--bootstrap-teams') await bootstrapTeams();
  else if (mode) throw new Error(`Modo desconhecido: ${mode}`);
  else await update();
})().catch(err => {
  console.error(err.message);
  process.exit(1);
});
