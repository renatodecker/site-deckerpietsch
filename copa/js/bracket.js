// Lógica compartilhada de resolução do chaveamento do mata-mata da Copa do
// Mundo FIFA 2026: traduz as vagas "1A"/"2B" (posição no grupo), "3:A,B,C..."
// (melhor 3º colocado entre os grupos listados) e "W101"/"L102"
// (vencedor/perdedor de outra partida) em nomes de seleção, a partir da
// classificação dos grupos e dos resultados já conhecidos do mata-mata.
//
// Usado tanto por copa-simulador/js/simulation.js (chaveamento simulado, com
// placares digitados pelo usuário) quanto por scripts/update-copa-data.mjs
// (chaveamento real, para detectar e atualizar jogos do mata-mata já
// disputados via ESPN).

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
// terceiros qualificados, mas quando há mais de uma distribuição válida
// possível, a escolhida aqui pode não coincidir com a tabela oficial da FIFA.
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
// nomes de seleção, usando a classificação dos grupos e a distribuição dos
// melhores terceiros.
export function resolveGroupSource(source, groups, thirdAssignment, matchId) {
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

export function resolveR32(r32, groups, thirdAssignment) {
  return r32.map(m => ({
    ...m,
    home: resolveGroupSource(m.homeSource, groups, thirdAssignment, m.id),
    away: resolveGroupSource(m.awaySource, groups, thirdAssignment, m.id)
  }));
}

// Resolve homeSource/awaySource das rodadas seguintes ("W101", "L102") usando
// os resultados (vencedor/perdedor) das partidas já resolvidas anteriormente.
export function resolveWLSource(source, resultsMap) {
  if (!source) return null;
  const m = source.match(/^([WL])(\d+)$/);
  if (!m) return null;
  const result = resultsMap[Number(m[2])];
  if (!result) return null;
  return m[1] === 'W' ? result.winner : result.loser;
}

export function resolveRound(matchList, resultsMap) {
  return matchList.map(m => ({
    ...m,
    home: resolveWLSource(m.homeSource, resultsMap),
    away: resolveWLSource(m.awaySource, resultsMap)
  }));
}

// Resultado (vencedor/perdedor) de uma partida do mata-mata já finalizada com
// placar definido. Em caso de empate, usa `match.winner` ("home"|"away"), que
// indica quem avançou nos pênaltis (mesma convenção de copa/js/main.js,
// getMatchOutcome).
export function getMatchResult(match) {
  if (!match || match.status !== 'finished') return null;
  if (match.homeScore == null || match.awayScore == null) return null;
  if (!match.home || !match.away) return null;

  let winnerSide;
  if (match.homeScore !== match.awayScore) {
    winnerSide = match.homeScore > match.awayScore ? 'home' : 'away';
  } else if (match.winner === 'home' || match.winner === 'away') {
    winnerSide = match.winner;
  } else {
    return null;
  }

  return {
    winner: winnerSide === 'home' ? match.home : match.away,
    loser: winnerSide === 'home' ? match.away : match.home,
    winnerSide
  };
}

// Resolve home/away de todas as rodadas do mata-mata (knockout.r32/r16/qf/sf/
// third/final) a partir da classificação real dos grupos e dos melhores
// terceiros, usando os resultados já conhecidos (status "finished") das
// rodadas anteriores para resolver "W101"/"L102"/"L103" etc. Os placares e
// status de cada partida vêm de `knockout` (não são alterados aqui).
export function resolveKnockoutFixtures(knockout, groups, qualifiedThirds) {
  const thirdSlots = getThirdSlots(knockout.r32);
  const thirdAssignment = assignThirdSlots(qualifiedThirds, thirdSlots);
  const resultsMap = {};

  const r32 = resolveR32(knockout.r32, groups, thirdAssignment);
  r32.forEach(m => { const r = getMatchResult(m); if (r) resultsMap[m.id] = r; });

  const rounds = { r32 };
  ['r16', 'qf', 'sf'].forEach(key => {
    const resolved = resolveRound(knockout[key], resultsMap);
    resolved.forEach(m => { const r = getMatchResult(m); if (r) resultsMap[m.id] = r; });
    rounds[key] = resolved;
  });

  rounds.third = resolveRound(knockout.third, resultsMap);
  rounds.final = resolveRound(knockout.final, resultsMap);

  return rounds;
}
