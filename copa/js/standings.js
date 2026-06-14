/* ============================================================
   CRITÉRIOS OFICIAIS DE DESEMPATE (fase de grupos da Copa do Mundo)

   1. Pontos
   2. Saldo de gols
   3. Gols marcados
   4. Confronto direto entre os times empatados (pontos, saldo e gols
      marcados somente nos jogos entre eles)
   5. Pontos de fair play (cartões) em todos os jogos do grupo
   6. Posição no ranking FIFA (menor número = melhor)
   7. Ordem alfabética (último recurso, no lugar de sorteio)

   Para a comparação entre 3os colocados de grupos diferentes, o confronto
   direto não se aplica (times de grupos diferentes não jogam entre si).
   ============================================================ */

function tupleCompareDesc(a, b) {
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return b[i] - a[i];
  }
  return 0;
}

function computeHeadToHead(cluster, groupMatches) {
  const names = new Set(cluster.map(t => t.team));
  const stats = {};
  cluster.forEach(t => { stats[t.team] = { pts: 0, sg: 0, gp: 0 }; });

  (groupMatches || [])
    .filter(m => m.status === 'finished' && names.has(m.home) && names.has(m.away)
      && m.homeScore != null && m.awayScore != null)
    .forEach(m => {
      [[m.home, m.homeScore, m.awayScore], [m.away, m.awayScore, m.homeScore]].forEach(([team, gf, ga]) => {
        const s = stats[team];
        s.gp += gf;
        s.sg += (gf - ga);
        if (gf > ga) s.pts += 3;
        else if (gf === ga) s.pts += 1;
      });
    });

  return stats;
}

function sortCluster(cluster, criteria, level, groupMatches) {
  if (cluster.length <= 1 || level >= criteria.length) return cluster;

  const criterion = criteria[level];
  let keyFn;

  if (criterion === 'primary') {
    keyFn = t => [t.pts, t.sg, t.gp];
  } else if (criterion === 'h2h') {
    if (!groupMatches) return sortCluster(cluster, criteria, level + 1, groupMatches);
    const h2h = computeHeadToHead(cluster, groupMatches);
    keyFn = t => [h2h[t.team].pts, h2h[t.team].sg, h2h[t.team].gp];
  } else if (criterion === 'fairplay') {
    keyFn = t => [t.fairPlay || 0];
  } else if (criterion === 'ranking') {
    // Ranking FIFA: número menor = melhor. Invertendo o sinal, "maior valor
    // primeiro" (usado por tupleCompareDesc) continua significando "melhor".
    keyFn = t => [-(t.fifaRanking ?? Infinity)];
  } else {
    return [...cluster].sort((a, b) => a.team.localeCompare(b.team, 'pt-BR'));
  }

  const sorted = [...cluster].sort((a, b) => tupleCompareDesc(keyFn(a), keyFn(b)));

  const result = [];
  let i = 0;
  while (i < sorted.length) {
    let j = i + 1;
    while (j < sorted.length && tupleCompareDesc(keyFn(sorted[i]), keyFn(sorted[j])) === 0) j++;
    result.push(...sortCluster(sorted.slice(i, j), criteria, level + 1, groupMatches));
    i = j;
  }
  return result;
}

const GROUP_CRITERIA = ['primary', 'h2h', 'fairplay', 'ranking', 'alphabetical'];
const CROSS_GROUP_CRITERIA = ['primary', 'fairplay', 'ranking', 'alphabetical'];

// Ordena a classificação de um grupo (4 times), aplicando os critérios
// oficiais de desempate em sequência. `groupMatches` são os jogos da fase de
// grupos desse grupo (usados para o confronto direto).
export function sortGroupStandings(teams, groupMatches) {
  return sortCluster(teams, GROUP_CRITERIA, 0, groupMatches);
}

// Ordena times de grupos diferentes entre si (ex: melhores 3os colocados),
// onde confronto direto não se aplica.
export function sortThirdPlaced(teams) {
  return sortCluster(teams, CROSS_GROUP_CRITERIA, 0, null);
}
