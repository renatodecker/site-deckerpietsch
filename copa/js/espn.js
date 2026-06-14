// Funções compartilhadas para buscar e aplicar dados públicos da ESPN
// (endpoint "scoreboard" não-oficial, sem necessidade de API key).
//
// Usado tanto pelo script de atualização automática
// (scripts/update-copa-data.mjs, em Node) quanto pelo botão "Atualizar
// agora" no front-end (copa/js/main.js, no navegador) — por isso este
// módulo não usa nenhuma API exclusiva do Node (fs, path, etc.).

import { sortGroupStandings, sortThirdPlaced } from './standings.js';
import { resolveKnockoutFixtures } from './bracket.js';

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

    // `m.status !== 'finished'` evita que um evento do mata-mata entre dois
    // times que também se enfrentaram na fase de grupos sobrescreva o
    // resultado (já correto) daquele jogo da fase de grupos.
    const target = (matches.groupStage || []).find(m =>
      m.status !== 'finished'
      && ((m.home === homeName && m.away === awayName) || (m.home === awayName && m.away === homeName)));
    if (!target) return;

    // Guarda o id do evento na ESPN para podermos buscar cartões/artilheiros
    // depois via fetchMatchSummary (endpoint "summary").
    if (!target.espnId && event.id) { target.espnId = event.id; changed = true; }

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
   APLICA PLACAR/STATUS DA ESPN AOS JOGOS DO MATA-MATA (matches.knockout)
   ============================================================ */
// Só atua depois que a fase de grupos estiver totalmente concluída (os
// confrontos do mata-mata só ficam definidos nesse momento). Resolve
// home/away de cada partida (ver copa/js/bracket.js) e, para as que já têm
// os dois lados definidos e ainda não estão "finished", procura um evento
// correspondente nos placares da ESPN.
//
// Rodadas a partir das quartas de final dependem do resultado de partidas
// anteriores do mata-mata já gravadas em matches.json — por isso a
// atualização avança uma rodada por execução, naturalmente, a cada chamada
// periódica deste script.
//
// Para os slots "3:..." da fase de 32 (melhor 3º colocado), a resolução é
// uma aproximação do Anexo C da FIFA (ver copa/js/bracket.js): se a
// aproximação não bater com o confronto real definido pela FIFA, esse jogo
// específico não será encontrado na ESPN e ficará pendente até ser corrigido
// manualmente.
export function applyKnockoutScoreboard(matches, events, aliasIndex, teams) {
  const groupStage = matches.groupStage || [];
  const knockout = matches.knockout;
  if (groupStage.length === 0 || !knockout) return false;
  if (!groupStage.every(m => m.status === 'finished')) return false;

  const groups = computeGroupsFromMatches(matches, teams);

  const fifaRankingByTeam = {};
  teams.forEach(t => { fifaRankingByTeam[t.name] = t.fifaRanking; });

  const thirds = Object.keys(groups).sort().map(letter => {
    const team = groups[letter][2];
    return { ...team, group: letter, fifaRanking: fifaRankingByTeam[team.team] };
  });
  const qualifiedThirds = sortThirdPlaced(thirds).slice(0, 8);

  const fixtures = resolveKnockoutFixtures(knockout, groups, qualifiedThirds);
  let changed = false;

  Object.keys(fixtures).forEach(round => {
    fixtures[round].forEach((fixture, i) => {
      const target = knockout[round][i];
      if (target.status === 'finished' || !fixture.home || !fixture.away) return;

      const result = matchKnockoutEvent(fixture, events, aliasIndex);
      if (!result) return;

      if (target.home !== fixture.home) { target.home = fixture.home; changed = true; }
      if (target.away !== fixture.away) { target.away = fixture.away; changed = true; }
      if (target.status !== result.status) { target.status = result.status; changed = true; }
      if (target.homeScore !== result.homeScore || target.awayScore !== result.awayScore) {
        target.homeScore = result.homeScore;
        target.awayScore = result.awayScore;
        changed = true;
      }
      if (result.winner && target.winner !== result.winner) {
        target.winner = result.winner;
        changed = true;
      }
      if (result.penalties && !target.penalties) { target.penalties = true; changed = true; }
    });
  });

  return changed;
}

// Procura, nos eventos da ESPN, uma partida entre `fixture.home` e
// `fixture.away` (em qualquer ordem) e retorna { status, homeScore,
// awayScore, winnerSide, penalties }, ou `null` se nenhum evento
// correspondente ainda finalizado/em andamento for encontrado.
function matchKnockoutEvent(fixture, events, aliasIndex) {
  for (const event of events) {
    const competition = event.competitions && event.competitions[0];
    if (!competition) continue;

    const competitors = competition.competitors || [];
    const home = competitors.find(c => c.homeAway === 'home');
    const away = competitors.find(c => c.homeAway === 'away');
    if (!home || !away || !home.team || !away.team) continue;

    const homeName = aliasIndex[normalize(home.team.displayName)];
    const awayName = aliasIndex[normalize(away.team.displayName)];
    if (!homeName || !awayName) continue;

    const sameOrientation = fixture.home === homeName && fixture.away === awayName;
    const reverseOrientation = fixture.home === awayName && fixture.away === homeName;
    if (!sameOrientation && !reverseOrientation) continue;

    const state = (competition.status && competition.status.type && competition.status.type.state)
      || (event.status && event.status.type && event.status.type.state);
    const status = STATUS_MAP[state];
    if (!status || status === 'scheduled') return null;

    const homeScoreEspn = Number(home.score);
    const awayScoreEspn = Number(away.score);
    if (!Number.isFinite(homeScoreEspn) || !Number.isFinite(awayScoreEspn)) return null;

    const homeScore = sameOrientation ? homeScoreEspn : awayScoreEspn;
    const awayScore = sameOrientation ? awayScoreEspn : homeScoreEspn;

    let winner = null;
    let penalties = false;
    if (status === 'finished' && homeScore === awayScore) {
      // Empate no placar normal: o mata-mata vai para os pênaltis. A ESPN
      // costuma indicar o vencedor final em `competitor.winner`, mesmo com o
      // placar (após prorrogação) empatado.
      const homeIsWinner = sameOrientation ? home.winner : away.winner;
      const awayIsWinner = sameOrientation ? away.winner : home.winner;
      if (homeIsWinner === true) { winner = 'home'; penalties = true; }
      else if (awayIsWinner === true) { winner = 'away'; penalties = true; }
    }

    return { status, homeScore, awayScore, winner, penalties };
  }

  return null;
}

/* ============================================================
   RECALCULA A CLASSIFICAÇÃO A PARTIR DOS JOGOS FINALIZADOS
   ============================================================ */
export function computeGroupsFromMatches(matches, teams) {
  const groups = {};

  teams.forEach(t => {
    if (!groups[t.group]) groups[t.group] = [];
    groups[t.group].push({ team: t.name, short: t.short, flag: t.flag, pj: 0, v: 0, e: 0, d: 0, gp: 0, gc: 0, sg: 0, pts: 0, fairPlay: 0 });
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
   DETALHES DA PARTIDA (cartões e gols) — endpoint "summary" da ESPN
   ============================================================ */
export async function fetchMatchSummary(espnId) {
  const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/summary?event=${espnId}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// Lê os eventos de um summary da ESPN (gols e cartões) e os traduz para os
// nomes de time usados neste site (via aliasIndex).
//
// Retorna `null` se `header.competitions[0].details` não existir nesse
// summary (endpoint não-oficial, pode mudar de formato) — assim quem chama
// sabe que não deve sobrescrever `cards`/`scorers` já existentes com zeros.
//
// Pontos de fair play por cartão (regra oficial da FIFA): 1o amarelo = -1,
// 2o amarelo (expulsão) = -2 adicionais (total -3), vermelho direto = -4.
export function extractMatchDetails(summary, aliasIndex) {
  const competition = summary && summary.header && summary.header.competitions && summary.header.competitions[0];
  const details = competition && competition.details;
  if (!Array.isArray(details)) return null;

  const teamNameById = {};
  (competition.competitors || []).forEach(c => {
    const name = c.team && aliasIndex[normalize(c.team.displayName || '')];
    if (name) teamNameById[c.team.id] = name;
  });

  const cards = {};
  const goals = [];
  const yellowCount = {};

  details.forEach(d => {
    const teamName = d.team && teamNameById[d.team.id];
    if (!teamName) return;

    const type = ((d.type && d.type.text) || '').toLowerCase();
    const athlete = d.athletesInvolved && d.athletesInvolved[0] && d.athletesInvolved[0].displayName;

    if (type.includes('yellow card')) {
      const key = `${d.team.id}:${athlete}`;
      yellowCount[key] = (yellowCount[key] || 0) + 1;
      cards[teamName] = (cards[teamName] || 0) + (yellowCount[key] >= 2 ? -2 : -1);
    } else if (type.includes('red card')) {
      cards[teamName] = (cards[teamName] || 0) - 4;
    } else if (athlete && ((type.includes('goal') && !type.includes('own goal')) || (type.includes('penalty') && type.includes('scor')))) {
      goals.push({ player: athlete, team: teamName });
    }
  });

  return { cards, goals };
}

/* ============================================================
   ARTILHARIA — agregada a partir dos gols registrados em cada jogo
   ============================================================ */
export function computeScorersFromMatches(matches, teams) {
  const flagByTeam = {};
  teams.forEach(t => { flagByTeam[t.name] = t.flag; });

  const totals = {};
  (matches.groupStage || []).forEach(m => {
    (m.scorers || []).forEach(({ player, team }) => {
      const key = `${player}|${team}`;
      if (!totals[key]) totals[key] = { name: player, country: `${flagByTeam[team] || ''} ${team}`.trim(), goals: 0 };
      totals[key].goals += 1;
    });
  });

  return { scorers: Object.values(totals).sort((a, b) => b.goals - a.goals).slice(0, 10) };
}

// Busca o placar da ESPN para ontem/hoje/amanhã (UTC) e aplica em uma cópia
// de `matches`, incluindo cartões e artilheiros dos jogos em andamento ou
// recém-finalizados (via fetchMatchSummary). Retorna
// { matches, groups, scorers, changed } ou lança erro se todas as chamadas
// ao placar da ESPN falharem (rede, CORS, endpoint fora do ar, etc.).
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
  let changed = applyScoreboard(updatedMatches, events, aliasIndex);

  for (const m of (updatedMatches.groupStage || [])) {
    if (!m.espnId) continue;
    if (m.status !== 'live' && m.status !== 'finished') continue;
    if (m.detailsFetched) continue;

    try {
      const summary = await fetchMatchSummary(m.espnId);
      const extracted = extractMatchDetails(summary, aliasIndex);
      if (!extracted) continue;

      // Só atualiza `cards` se a ESPN retornou algum cartão para um dos dois
      // times: se `extracted.cards` vier vazio (ex: formato do summary não
      // bateu com o esperado, ou nomes de time não casaram), preserva
      // `m.cards` já existente em vez de zerar pontos de fair play
      // registrados manualmente.
      const hasCardData = m.home in extracted.cards || m.away in extracted.cards;
      if (hasCardData) {
        const newCards = { home: extracted.cards[m.home] || 0, away: extracted.cards[m.away] || 0 };
        if (!m.cards || m.cards.home !== newCards.home || m.cards.away !== newCards.away) {
          m.cards = newCards;
          changed = true;
        }
      }

      if (JSON.stringify(m.scorers || []) !== JSON.stringify(extracted.goals)) {
        m.scorers = extracted.goals;
        changed = true;
      }

      if (m.status === 'finished') {
        m.detailsFetched = true;
        changed = true;
      }
    } catch {
      // Sem detalhes desta vez; tenta novamente na próxima atualização.
    }
  }

  if (applyKnockoutScoreboard(updatedMatches, events, aliasIndex, teams)) changed = true;

  const groups = computeGroupsFromMatches(updatedMatches, teams);
  const scorers = computeScorersFromMatches(updatedMatches, teams);

  return { matches: updatedMatches, groups, scorers, changed };
}
