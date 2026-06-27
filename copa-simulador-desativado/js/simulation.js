// Lógica pura do simulador da Copa do Mundo FIFA 2026: aplica os placares
// digitados pelo usuário (simState) sobre os dados reais (copa/data/*.json)
// e recalcula classificação dos grupos, melhores terceiros e chaveamento do
// mata-mata. Sem nenhum acesso a DOM/cookie, para poder ser testada com Node.
//
// Reaproveita copa/js/standings.js (critérios de desempate) e
// copa/js/espn.js (computeGroupsFromMatches) sem modificá-los.

import { sortThirdPlaced } from '../../copa/js/standings.js';
import { computeGroupsFromMatches } from '../../copa/js/espn.js';
import { getThirdSlots, assignThirdSlots, resolveR32, resolveRound } from '../../copa/js/bracket.js';

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
