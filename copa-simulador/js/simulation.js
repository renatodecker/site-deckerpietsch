// Lógica pura do simulador da Copa do Mundo FIFA 2026: aplica os placares
// digitados pelo usuário (simState) sobre os dados reais (copa/data/*.json)
// e recalcula classificação dos grupos, melhores terceiros e chaveamento do
// mata-mata. Sem nenhum acesso a DOM/cookie, para poder ser testada com Node.
//
// Reaproveita copa/js/standings.js (critérios de desempate) e
// copa/js/espn.js (computeGroupsFromMatches) sem modificá-los.

import { sortThirdPlaced } from '../../copa/js/standings.js';
import { computeGroupsFromMatches } from '../../copa/js/espn.js';

// Aplica os placares simulados (simState[id] = { h, a, p? }) sobre os jogos
// da fase de grupos. Jogos sem placar simulado mantêm o resultado real (se
// já tiverem sido disputados) ou continuam "scheduled" (não entram na conta).
export function applyGroupOverrides(groupStage, simState) {
  return groupStage.map(m => {
    const sim = simState[m.id];
    if (sim && sim.h != null && sim.a != null) {
      return { ...m, status: 'finished', homeScore: sim.h, awayScore: sim.a };
    }
    return m;
  });
}

// Slots da fase de 32 que recebem um "melhor 3º colocado" (ex: id 74,
// awaySource "3:A,B,C,D,F"), na ordem em que aparecem em matches.json.
export function getThirdSlots(r32) {
  return r32
    .map(m => {
      const source = ['home', 'away'].map(side => m[`${side}Source`]).find(s => (s || '').startsWith('3:'));
      if (!source) return null;
      return { id: m.id, groups: source.slice(2).split(',') };
    })
    .filter(Boolean)
    .sort((a, b) => a.id - b.id);
}

// Distribui os melhores terceiros colocados qualificados (8 de 12) pelos
// slots "3:..." da fase de 32. Para cada slot, tenta na ordem o time
// qualificado mais bem ranqueado cujo grupo esteja na lista de grupos
// elegíveis do slot, com backtracking caso essa escolha torne algum slot
// seguinte impossível de preencher. É uma aproximação do critério oficial da
// FIFA (Anexo C, com 495 combinações possíveis): os grupos elegíveis de cada
// slot já vêm de matches.json e garantem que existe pelo menos uma
// distribuição válida (sem repetir grupo) para qualquer combinação de
// terceiros qualificados.
export function assignThirdSlots(qualifiedThirds, thirdSlots) {
  const groupOrder = qualifiedThirds.map(t => t.group);
  const used = new Set();
  const assignment = {};

  function backtrack(slotIndex) {
    if (slotIndex === thirdSlots.length) return true;
    const slot = thirdSlots[slotIndex];
    for (const group of groupOrder) {
      if (used.has(group) || !slot.groups.includes(group)) continue;
      used.add(group);
      assignment[slot.id] = group;
      if (backtrack(slotIndex + 1)) return true;
      used.delete(group);
      delete assignment[slot.id];
    }
    return false;
  }

  backtrack(0);

  const teamByGroup = {};
  qualifiedThirds.forEach(t => { teamByGroup[t.group] = t.team; });

  const result = {};
  Object.keys(assignment).forEach(slotId => { result[slotId] = teamByGroup[assignment[slotId]]; });
  return result;
}

// Resolve homeSource/awaySource da fase de 32 ("1A", "2B", "3:A,B,C,D,F") em
// nomes de seleção, usando a classificação simulada dos grupos e a
// distribuição dos melhores terceiros.
function resolveGroupSource(source, groups, thirdAssignment, matchId) {
  if (!source) return null;

  const direct = source.match(/^([12])([A-L])$/);
  if (direct) {
    const arr = groups[direct[2]];
    const team = arr && arr[Number(direct[1]) - 1];
    return team ? team.team : null;
  }

  if (source.startsWith('3:')) {
    return thirdAssignment[matchId] || null;
  }

  return null;
}

function resolveR32(r32, groups, thirdAssignment) {
  return r32.map(m => ({
    ...m,
    home: resolveGroupSource(m.homeSource, groups, thirdAssignment, m.id),
    away: resolveGroupSource(m.awaySource, groups, thirdAssignment, m.id)
  }));
}

// Resolve homeSource/awaySource das rodadas seguintes ("W101", "L102") usando
// os resultados (vencedor/perdedor) das partidas já resolvidas anteriormente.
function resolveWLSource(source, resultsMap) {
  if (!source) return null;
  const m = source.match(/^([WL])(\d+)$/);
  if (!m) return null;
  const result = resultsMap[Number(m[2])];
  if (!result) return null;
  return m[1] === 'W' ? result.winner : result.loser;
}

function resolveRound(matchList, resultsMap) {
  return matchList.map(m => ({
    ...m,
    home: resolveWLSource(m.homeSource, resultsMap),
    away: resolveWLSource(m.awaySource, resultsMap)
  }));
}

// Aplica os placares simulados a uma rodada do mata-mata já com home/away
// resolvidos, e registra o resultado (vencedor/perdedor) em `resultsMap` para
// que as rodadas seguintes possam resolver "W{id}"/"L{id}".
// Em caso de empate, `sim.p` ("home"|"away") indica o vencedor nos pênaltis.
function applyKnockoutScores(matchList, simState, resultsMap) {
  return matchList.map(m => {
    const sim = (m.home && m.away) ? simState[m.id] : null;

    let homeScore = null;
    let awayScore = null;
    let status = 'scheduled';
    let winnerSide = null;
    let penalties = false;

    if (sim && sim.h != null && sim.a != null) {
      homeScore = sim.h;
      awayScore = sim.a;
      status = 'finished';

      if (homeScore !== awayScore) {
        winnerSide = homeScore > awayScore ? 'home' : 'away';
      } else if (sim.p === 'home' || sim.p === 'away') {
        winnerSide = sim.p;
        penalties = true;
      }
    }

    if (winnerSide) {
      const winner = winnerSide === 'home' ? m.home : m.away;
      const loser = winnerSide === 'home' ? m.away : m.home;
      resultsMap[m.id] = { winner, loser, winnerSide, penalties };
    }

    return { ...m, homeScore, awayScore, status, winnerSide, penalties };
  });
}

// Monta a simulação completa: classificação dos grupos, melhores terceiros,
// chaveamento do mata-mata (com times/placares resolvidos) e o campeão, se
// a final já tiver um resultado.
export function buildSimulation(baseMatches, teams, simState) {
  const fifaRankingByTeam = {};
  teams.forEach(t => { fifaRankingByTeam[t.name] = t.fifaRanking; });

  const groupStage = applyGroupOverrides(baseMatches.groupStage, simState);
  const groups = computeGroupsFromMatches({ groupStage }, teams);

  const thirds = Object.keys(groups).sort().map(letter => {
    const team = groups[letter][2];
    return { ...team, group: letter, fifaRanking: fifaRankingByTeam[team.team] };
  });
  const rankedThirds = sortThirdPlaced(thirds);
  const qualifiedThirds = rankedThirds.slice(0, 8);

  const thirdSlots = getThirdSlots(baseMatches.knockout.r32);
  const thirdAssignment = assignThirdSlots(qualifiedThirds, thirdSlots);

  const resultsMap = {};
  const r32 = applyKnockoutScores(resolveR32(baseMatches.knockout.r32, groups, thirdAssignment), simState, resultsMap);
  const r16 = applyKnockoutScores(resolveRound(baseMatches.knockout.r16, resultsMap), simState, resultsMap);
  const qf = applyKnockoutScores(resolveRound(baseMatches.knockout.qf, resultsMap), simState, resultsMap);
  const sf = applyKnockoutScores(resolveRound(baseMatches.knockout.sf, resultsMap), simState, resultsMap);
  const third = applyKnockoutScores(resolveRound(baseMatches.knockout.third, resultsMap), simState, resultsMap);
  const final = applyKnockoutScores(resolveRound(baseMatches.knockout.final, resultsMap), simState, resultsMap);

  const finalResult = resultsMap[baseMatches.knockout.final[0].id];

  return {
    groupStage,
    groups,
    rankedThirds,
    qualifiedThirds,
    knockout: { r32, r16, qf, sf, third, final },
    champion: finalResult ? finalResult.winner : null
  };
}
