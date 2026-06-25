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

// Tabela oficial FIFA Anexo C: para cada combinação de 8 grupos que
// classificam seus terceiros colocados (495 combinações), define qual
// terceiro joga em cada partida da fase de 32. Chave = grupos classificados
// (ordenados); valor = 8 letras na ordem dos match IDs [74,77,79,80,81,82,85,87].
const ANNEX_C_MATCH_IDS = [74, 77, 79, 80, 81, 82, 85, 87];
/* eslint-disable */
const ANNEX_C = {EFGHIJKL:"FGEKIHJL",DFGHIJKL:"DFHKIJGL",DEGHIJKL:"DGEKIHJL",DEFHIJKL:"DFEKIHJL",DEFGIJKL:"DFEKIJGL",DEFGHJKL:"DFEKJHGL",DEFGHIKL:"DFEKIHGL",DEFGHIJL:"DFEIJHGL",DEFGHIJK:"DFEKJHGI",CFGHIJKL:"CFHKIJGL",CEGHIJKL:"CGEKIHJL",CEFHIJKL:"CFEKIHJL",CEFGIJKL:"CFEKIJGL",CEFGHJKL:"CFEKJHGL",CEFGHIKL:"CFEKIHGL",CEFGHIJL:"CFEIJHGL",CEFGHIJK:"CFEKJHGI",CDGHIJKL:"CDHKIJGL",CDFHIJKL:"DFCKIHJL",CDFGIJKL:"DFCKIJGL",CDFGHJKL:"DFCKJHGL",CDFGHIKL:"DFCKIHGL",CDFGHIJL:"DFCIJHGL",CDFGHIJK:"DFCKJHGI",CDEHIJKL:"CDEKIHJL",CDEGIJKL:"CDEKIJGL",CDEGHJKL:"CDEKJHGL",CDEGHIKL:"CDEKIHGL",CDEGHIJL:"CDEIJHGL",CDEGHIJK:"CDEKJHGI",CDEFIJKL:"DFCKEIJL",CDEFHJKL:"DFCKEHJL",CDEFHIKL:"DFCKIHEL",CDEFHIJL:"DFCIEHJL",CDEFHIJK:"DFCKEHJI",CDEFGJKL:"DFCKEJGL",CDEFGIKL:"DFCKEIGL",CDEFGIJL:"DFCIEJGL",CDEFGIJK:"DFCKEJGI",CDEFGHKL:"DFCKEHGL",CDEFGHJL:"DFCEJHGL",CDEFGHJK:"DFCKJHGE",CDEFGHIL:"DFCIEHGL",CDEFGHIK:"DFCKEHGI",CDEFGHIJ:"DFCIJHGE",BFGHIJKL:"FGHKBIJL",BEGHIJKL:"BGEKIHJL",BEFHIJKL:"FHEKBIJL",BEFGIJKL:"FGEKBIJL",BEFGHJKL:"FGEKBHJL",BEFGHIKL:"FHEKBIGL",BEFGHIJL:"FGEIBHJL",BEFGHIJK:"FGEKBHJI",BDGHIJKL:"DGHKBIJL",BDFHIJKL:"DFHKBIJL",BDFGIJKL:"DFIKBJGL",BDFGHJKL:"DFHKBJGL",BDFGHIKL:"DFHKBIGL",BDFGHIJL:"DFHIBJGL",BDFGHIJK:"DFHKBJGI",BDEHIJKL:"DHEKBIJL",BDEGIJKL:"DGEKBIJL",BDEGHJKL:"DGEKBHJL",BDEGHIKL:"DHEKBIGL",BDEGHIJL:"DGEIBHJL",BDEGHIJK:"DGEKBHJI",BDEFIJKL:"DFEKBIJL",BDEFHJKL:"DFEKBHJL",BDEFHIKL:"DFEKBHIL",BDEFHIJL:"DFEIBHJL",BDEFHIJK:"DFEKBHJI",BDEFGJKL:"DFEKBJGL",BDEFGIKL:"DFEKBIGL",BDEFGIJL:"DFEIBJGL",BDEFGIJK:"DFEKBJGI",BDEFGHKL:"DFEKBHGL",BDEFGHJL:"DFHEBJGL",BDEFGHJK:"DFHKBJGE",BDEFGHIL:"DFEIBHGL",BDEFGHIK:"DFEKBHGI",BDEFGHIJ:"DFHIBJGE",BCGHIJKL:"CGHKBIJL",BCFHIJKL:"CFHKBIJL",BCFGIJKL:"CFIKBJGL",BCFGHJKL:"CFHKBJGL",BCFGHIKL:"CFHKBIGL",BCFGHIJL:"CFHIBJGL",BCFGHIJK:"CFHKBJGI",BCEHIJKL:"CHEKBIJL",BCEGIJKL:"CGEKBIJL",BCEGHJKL:"CGEKBHJL",BCEGHIKL:"CHEKBIGL",BCEGHIJL:"CGEIBHJL",BCEGHIJK:"CGEKBHJI",BCEFIJKL:"CFEKBIJL",BCEFHJKL:"CFEKBHJL",BCEFHIKL:"CFEKBHIL",BCEFHIJL:"CFEIBHJL",BCEFHIJK:"CFEKBHJI",BCEFGJKL:"CFEKBJGL",BCEFGIKL:"CFEKBIGL",BCEFGIJL:"CFEIBJGL",BCEFGIJK:"CFEKBJGI",BCEFGHKL:"CFEKBHGL",BCEFGHJL:"CFHEBJGL",BCEFGHJK:"CFHKBJGE",BCEFGHIL:"CFEIBHGL",BCEFGHIK:"CFEKBHGI",BCEFGHIJ:"CFHIBJGE",BCDHIJKL:"CDHKBIJL",BCDGIJKL:"CDIKBJGL",BCDGHJKL:"CDHKBJGL",BCDGHIKL:"CDHKBIGL",BCDGHIJL:"CDHIBJGL",BCDGHIJK:"CDHKBJGI",BCDFIJKL:"DFCKBIJL",BCDFHJKL:"DFCKBHJL",BCDFHIKL:"DFCKBHIL",BCDFHIJL:"DFCIBHJL",BCDFHIJK:"DFCKBHJI",BCDFGJKL:"DFCKBJGL",BCDFGIKL:"DFCKBIGL",BCDFGIJL:"DFCIBJGL",BCDFGIJK:"DFCKBJGI",BCDFGHKL:"DFCKBHGL",BCDFGHJL:"DFCJBHGL",BCDFGHJK:"CFHKBJGD",BCDFGHIL:"DFCIBHGL",BCDFGHIK:"DFCKBHGI",BCDFGHIJ:"CFHIBJGD",BCDEIJKL:"CDEKBIJL",BCDEHJKL:"CDEKBHJL",BCDEHIKL:"CDEKBHIL",BCDEHIJL:"CDEIBHJL",BCDEHIJK:"CDEKBHJI",BCDEGJKL:"CDEKBJGL",BCDEGIKL:"CDEKBIGL",BCDEGIJL:"CDEIBJGL",BCDEGIJK:"CDEKBJGI",BCDEGHKL:"CDEKBHGL",BCDEGHJL:"CDHEBJGL",BCDEGHJK:"CDHKBJGE",BCDEGHIL:"CDEIBHGL",BCDEGHIK:"CDEKBHGI",BCDEGHIJ:"CDHIBJGE",BCDEFJKL:"DFCKBEJL",BCDEFIKL:"DFCKBIEL",BCDEFIJL:"DFCIBEJL",BCDEFIJK:"DFCKBEJI",BCDEFHKL:"DFCKBHEL",BCDEFHJL:"DFCEBHJL",BCDEFHJK:"DFCKBHJE",BCDEFHIL:"DFCIBHEL",BCDEFHIK:"DFCKBHEI",BCDEFHIJ:"DFCIBHJE",BCDEFGKL:"DFCKBEGL",BCDEFGJL:"DFCEBJGL",BCDEFGJK:"DFCKBJGE",BCDEFGIL:"DFCIBEGL",BCDEFGIK:"DFCKBEGI",BCDEFGIJ:"DFCIBJGE",BCDEFGHL:"DFCEBHGL",BCDEFGHK:"DFCKBHGE",BCDEFGHJ:"CFHEBJGD",BCDEFGHI:"DFCIBHGE",AFGHIJKL:"FGHKIAJL",AEGHIJKL:"AGEKIHJL",AEFHIJKL:"FHEKIAJL",AEFGIJKL:"FGEKIAJL",AEFGHJKL:"FHEKJAGL",AEFGHIKL:"FHEKIAGL",AEFGHIJL:"FHEIJAGL",AEFGHIJK:"FHEKJAGI",ADGHIJKL:"DGHKIAJL",ADFHIJKL:"DFHKIAJL",ADFGIJKL:"DFIKJAGL",ADFGHJKL:"DFHKJAGL",ADFGHIKL:"DFHKIAGL",ADFGHIJL:"DFHIJAGL",ADFGHIJK:"DFHKJAGI",ADEHIJKL:"DHEKIAJL",ADEGIJKL:"DGEKIAJL",ADEGHJKL:"DHEKJAGL",ADEGHIKL:"DHEKIAGL",ADEGHIJL:"DHEIJAGL",ADEGHIJK:"DHEKJAGI",ADEFIJKL:"DFEKIAJL",ADEFHJKL:"DFHKEAJL",ADEFHIKL:"DFHKIAEL",ADEFHIJL:"DFHIEAJL",ADEFHIJK:"DFHKEAJI",ADEFGJKL:"DFEKJAGL",ADEFGIKL:"DFEKIAGL",ADEFGIJL:"DFEIJAGL",ADEFGIJK:"DFEKJAGI",ADEFGHKL:"DFHKEAGL",ADEFGHJL:"DFHEJAGL",ADEFGHJK:"DFHKJAGE",ADEFGHIL:"DFHIEAGL",ADEFGHIK:"DFHKEAGI",ADEFGHIJ:"DFHIJAGE",ACGHIJKL:"CGHKIAJL",ACFHIJKL:"CFHKIAJL",ACFGIJKL:"CFIKJAGL",ACFGHJKL:"CFHKJAGL",ACFGHIKL:"CFHKIAGL",ACFGHIJL:"CFHIJAGL",ACFGHIJK:"CFHKJAGI",ACEHIJKL:"CHEKIAJL",ACEGIJKL:"CGEKIAJL",ACEGHJKL:"CHEKJAGL",ACEGHIKL:"CHEKIAGL",ACEGHIJL:"CHEIJAGL",ACEGHIJK:"CHEKJAGI",ACEFIJKL:"CFEKIAJL",ACEFHJKL:"CFHKEAJL",ACEFHIKL:"CFHKIAEL",ACEFHIJL:"CFHIEAJL",ACEFHIJK:"CFHKEAJI",ACEFGJKL:"CFEKJAGL",ACEFGIKL:"CFEKIAGL",ACEFGIJL:"CFEIJAGL",ACEFGIJK:"CFEKJAGI",ACEFGHKL:"CFHKEAGL",ACEFGHJL:"CFHEJAGL",ACEFGHJK:"CFHKJAGE",ACEFGHIL:"CFHIEAGL",ACEFGHIK:"CFHKEAGI",ACEFGHIJ:"CFHIJAGE",ACDHIJKL:"CDHKIAJL",ACDGIJKL:"CDIKJAGL",ACDGHJKL:"CDHKJAGL",ACDGHIKL:"CDHKIAGL",ACDGHIJL:"CDHIJAGL",ACDGHIJK:"CDHKJAGI",ACDFIJKL:"DFCKIAJL",ACDFHJKL:"CDHKFAJL",ACDFHIKL:"CDHKIAFL",ACDFHIJL:"CDHIFAJL",ACDFHIJK:"CDHKFAJI",ACDFGJKL:"DFCKJAGL",ACDFGIKL:"DFCKIAGL",ACDFGIJL:"DFCIJAGL",ACDFGIJK:"DFCKJAGI",ACDFGHKL:"CDHKFAGL",ACDFGHJL:"DFCHJAGL",ACDFGHJK:"CFHKJAGD",ACDFGHIL:"CDHIFAGL",ACDFGHIK:"CDHKFAGI",ACDFGHIJ:"CFHIJAGD",ACDEIJKL:"CDEKIAJL",ACDEHJKL:"CDHKEAJL",ACDEHIKL:"CDHKIAEL",ACDEHIJL:"CDHIEAJL",ACDEHIJK:"CDHKEAJI",ACDEGJKL:"CDEKJAGL",ACDEGIKL:"CDEKIAGL",ACDEGIJL:"CDEIJAGL",ACDEGIJK:"CDEKJAGI",ACDEGHKL:"CDHKEAGL",ACDEGHJL:"CDHEJAGL",ACDEGHJK:"CDHKJAGE",ACDEGHIL:"CDHIEAGL",ACDEGHIK:"CDHKEAGI",ACDEGHIJ:"CDHIJAGE",ACDEFJKL:"DFCKEAJL",ACDEFIKL:"DFCKIAEL",ACDEFIJL:"DFCIEAJL",ACDEFIJK:"DFCKEAJI",ACDEFHKL:"CDHKFAEL",ACDEFHJL:"CDHEFAJL",ACDEFHJK:"CFHKEAJD",ACDEFHIL:"CDHIFAEL",ACDEFHIK:"CDHKFAEI",ACDEFHIJ:"CFHIEAJD",ACDEFGKL:"DFCKEAGL",ACDEFGJL:"DFCEJAGL",ACDEFGJK:"DFCKJAGE",ACDEFGIL:"DFCIEAGL",ACDEFGIK:"DFCKEAGI",ACDEFGIJ:"DFCIJAGE",ACDEFGHL:"CDHEFAGL",ACDEFGHK:"CFHKEAGD",ACDEFGHJ:"CFHEJAGD",ACDEFGHI:"CFHIEAGD",ABGHIJKL:"AGHKBIJL",ABFHIJKL:"AFHKBIJL",ABFGIJKL:"FGIKBAJL",ABFGHJKL:"FGHKBAJL",ABFGHIKL:"AFHKBIGL",ABFGHIJL:"FGHIBAJL",ABFGHIJK:"FGHKBAJI",ABEHIJKL:"AHEKBIJL",ABEGIJKL:"AGEKBIJL",ABEGHJKL:"AGEKBHJL",ABEGHIKL:"AHEKBIGL",ABEGHIJL:"AGEIBHJL",ABEGHIJK:"AGEKBHJI",ABEFIJKL:"AFEKBIJL",ABEFHJKL:"FHEKBAJL",ABEFHIKL:"FHEKBAIL",ABEFHIJL:"FHEIBAJL",ABEFHIJK:"FHEKBAJI",ABEFGJKL:"FGEKBAJL",ABEFGIKL:"AFEKBIGL",ABEFGIJL:"FGEIBAJL",ABEFGIJK:"FGEKBAJI",ABEFGHKL:"FHEKBAGL",ABEFGHJL:"FGHEBAJL",ABEFGHJK:"FGHKBAJE",ABEFGHIL:"FHEIBAGL",ABEFGHIK:"FHEKBAGI",ABEFGHIJ:"FGHIBAJE",ABDHIJKL:"DHIKBAJL",ABDGIJKL:"DGIKBAJL",ABDGHJKL:"DGHKBAJL",ABDGHIKL:"DHIKBAGL",ABDGHIJL:"DGHIBAJL",ABDGHIJK:"DGHKBAJI",ABDFIJKL:"DFIKBAJL",ABDFHJKL:"DFHKBAJL",ABDFHIKL:"DFHKBAIL",ABDFHIJL:"DFHIBAJL",ABDFHIJK:"DFHKBAJI",ABDFGJKL:"DGFKBAJL",ABDFGIKL:"DFIKBAGL",ABDFGIJL:"DGFIBAJL",ABDFGIJK:"DGFKBAJI",ABDFGHKL:"DFHKBAGL",ABDFGHJL:"DFHJBAGL",ABDFGHJK:"DFHKBAGJ",ABDFGHIL:"DFHIBAGL",ABDFGHIK:"DFHKBAGI",ABDFGHIJ:"DFHJBAGI",ABDEIJKL:"ADEKBIJL",ABDEHJKL:"DHEKBAJL",ABDEHIKL:"DHEKBAIL",ABDEHIJL:"DHEIBAJL",ABDEHIJK:"DHEKBAJI",ABDEGJKL:"DGEKBAJL",ABDEGIKL:"ADEKBIGL",ABDEGIJL:"DGEIBAJL",ABDEGIJK:"DGEKBAJI",ABDEGHKL:"DHEKBAGL",ABDEGHJL:"DGHEBAJL",ABDEGHJK:"DGHKBAJE",ABDEGHIL:"DHEIBAGL",ABDEGHIK:"DHEKBAGI",ABDEGHIJ:"DGHIBAJE",ABDEFJKL:"DFEKBAJL",ABDEFIKL:"DFEKBAIL",ABDEFIJL:"DFEIBAJL",ABDEFIJK:"DFEKBAJI",ABDEFHKL:"DFHKBAEL",ABDEFHJL:"DFHEBAJL",ABDEFHJK:"DFHKBAJE",ABDEFHIL:"DFHIBAEL",ABDEFHIK:"DFHKBAEI",ABDEFHIJ:"DFHIBAJE",ABDEFGKL:"DFEKBAGL",ABDEFGJL:"DFEJBAGL",ABDEFGJK:"DFEKBAGJ",ABDEFGIL:"DFEIBAGL",ABDEFGIK:"DFEKBAGI",ABDEFGIJ:"DFEJBAGI",ABDEFGHL:"DFHEBAGL",ABDEFGHK:"DFHKBAGE",ABDEFGHJ:"DFHJBAGE",ABDEFGHI:"DFHIBAGE",ABCHIJKL:"CHIKBAJL",ABCGIJKL:"CGIKBAJL",ABCGHJKL:"CGHKBAJL",ABCGHIKL:"CHIKBAGL",ABCGHIJL:"CGHIBAJL",ABCGHIJK:"CGHKBAJI",ABCFIJKL:"CFIKBAJL",ABCFHJKL:"CFHKBAJL",ABCFHIKL:"CFHKBAIL",ABCFHIJL:"CFHIBAJL",ABCFHIJK:"CFHKBAJI",ABCFGJKL:"FGCKBAJL",ABCFGIKL:"CFIKBAGL",ABCFGIJL:"FGCIBAJL",ABCFGIJK:"FGCKBAJI",ABCFGHKL:"CFHKBAGL",ABCFGHJL:"CFHJBAGL",ABCFGHJK:"CFHKBAGJ",ABCFGHIL:"CFHIBAGL",ABCFGHIK:"CFHKBAGI",ABCFGHIJ:"CFHJBAGI",ABCEIJKL:"ACEKBIJL",ABCEHJKL:"CHEKBAJL",ABCEHIKL:"CHEKBAIL",ABCEHIJL:"CHEIBAJL",ABCEHIJK:"CHEKBAJI",ABCEGJKL:"CGEKBAJL",ABCEGIKL:"ACEKBIGL",ABCEGIJL:"CGEIBAJL",ABCEGIJK:"CGEKBAJI",ABCEGHKL:"CHEKBAGL",ABCEGHJL:"CGHEBAJL",ABCEGHJK:"CGHKBAJE",ABCEGHIL:"CHEIBAGL",ABCEGHIK:"CHEKBAGI",ABCEGHIJ:"CGHIBAJE",ABCEFJKL:"CFEKBAJL",ABCEFIKL:"CFEKBAIL",ABCEFIJL:"CFEIBAJL",ABCEFIJK:"CFEKBAJI",ABCEFHKL:"CFHKBAEL",ABCEFHJL:"CFHEBAJL",ABCEFHJK:"CFHKBAJE",ABCEFHIL:"CFHIBAEL",ABCEFHIK:"CFHKBAEI",ABCEFHIJ:"CFHIBAJE",ABCEFGKL:"CFEKBAGL",ABCEFGJL:"CFEJBAGL",ABCEFGJK:"CFEKBAGJ",ABCEFGIL:"CFEIBAGL",ABCEFGIK:"CFEKBAGI",ABCEFGIJ:"CFEJBAGI",ABCEFGHL:"CFHEBAGL",ABCEFGHK:"CFHKBAGE",ABCEFGHJ:"CFHJBAGE",ABCEFGHI:"CFHIBAGE",ABCDIJKL:"CDIKBAJL",ABCDHJKL:"CDHKBAJL",ABCDHIKL:"CDHKBAIL",ABCDHIJL:"CDHIBAJL",ABCDHIJK:"CDHKBAJI",ABCDGJKL:"DGCKBAJL",ABCDGIKL:"CDIKBAGL",ABCDGIJL:"DGCIBAJL",ABCDGIJK:"DGCKBAJI",ABCDGHKL:"CDHKBAGL",ABCDGHJL:"CDHJBAGL",ABCDGHJK:"CDHKBAGJ",ABCDGHIL:"CDHIBAGL",ABCDGHIK:"CDHKBAGI",ABCDGHIJ:"CDHJBAGI",ABCDFJKL:"DFCKBAJL",ABCDFIKL:"DFCKBAIL",ABCDFIJL:"DFCIBAJL",ABCDFIJK:"DFCKBAJI",ABCDFHKL:"CDHKBAFL",ABCDFHJL:"DFCHBAJL",ABCDFHJK:"CFHKBAJD",ABCDFHIL:"CDHIBAFL",ABCDFHIK:"CDHKBAFI",ABCDFHIJ:"CFHIBAJD",ABCDFGKL:"DFCKBAGL",ABCDFGJL:"DFCJBAGL",ABCDFGJK:"DFCKBAGJ",ABCDFGIL:"DFCIBAGL",ABCDFGIK:"DFCKBAGI",ABCDFGIJ:"DFCJBAGI",ABCDFGHL:"DFCHBAGL",ABCDFGHK:"CFHKBAGD",ABCDFGHJ:"CFHJBAGD",ABCDFGHI:"CFHIBAGD",ABCDEJKL:"CDEKBAJL",ABCDEIKL:"CDEKBAIL",ABCDEIJL:"CDEIBAJL",ABCDEIJK:"CDEKBAJI",ABCDEHKL:"CDHKBAEL",ABCDEHJL:"CDHEBAJL",ABCDEHJK:"CDHKBAJE",ABCDEHIL:"CDHIBAEL",ABCDEHIK:"CDHKBAEI",ABCDEHIJ:"CDHIBAJE",ABCDEGKL:"CDEKBAGL",ABCDEGJL:"CDEJBAGL",ABCDEGJK:"CDEKBAGJ",ABCDEGIL:"CDEIBAGL",ABCDEGIK:"CDEKBAGI",ABCDEGIJ:"CDEJBAGI",ABCDEGHL:"CDHEBAGL",ABCDEGHK:"CDHKBAGE",ABCDEGHJ:"CDHJBAGE",ABCDEGHI:"CDHIBAGE",ABCDEFKL:"DFCKBAEL",ABCDEFJL:"DFCEBAJL",ABCDEFJK:"DFCKBAJE",ABCDEFIL:"DFCIBAEL",ABCDEFIK:"DFCKBAEI",ABCDEFIJ:"DFCIBAJE",ABCDEFHL:"CDHEBAFL",ABCDEFHK:"CFHKBAED",ABCDEFHJ:"CFHEBAJD",ABCDEFHI:"CFHIBAED",ABCDEFGL:"DFCEBAGL",ABCDEFGK:"DFCKBAGE",ABCDEFGJ:"DFCJBAGE",ABCDEFGI:"DFCIBAGE",ABCDEFGH:"CFHEBAGD"};
/* eslint-enable */

export function assignThirdSlots(qualifiedThirds, _thirdSlots) {
  const groups = qualifiedThirds.map(t => t.group).sort();
  const key = groups.join('');
  const mapping = ANNEX_C[key];

  const teamByGroup = {};
  qualifiedThirds.forEach(t => { teamByGroup[t.group] = t.team; });

  const result = {};
  if (mapping) {
    for (let i = 0; i < ANNEX_C_MATCH_IDS.length; i++) {
      const group = mapping[i];
      if (teamByGroup[group]) result[ANNEX_C_MATCH_IDS[i]] = teamByGroup[group];
    }
  }
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

// Ids das partidas de cada metade do chaveamento, da rodada mais externa
// (fase de 32) à mais interna (semifinal), na ordem em que devem aparecer
// (agrupadas para que cada par de jogos fique ao lado do jogo da rodada
// seguinte que eles alimentam). Usado para desenhar o chaveamento como uma
// árvore: uma metade da esquerda para a direita, a outra da direita para a
// esquerda, convergindo para a final no centro.
export const BRACKET_HALVES = {
  left: {
    r32: [74, 77, 73, 75, 83, 84, 81, 82],
    r16: [89, 90, 93, 94],
    qf: [97, 98],
    sf: [101],
  },
  right: {
    r32: [76, 78, 79, 80, 86, 88, 85, 87],
    r16: [91, 92, 95, 96],
    qf: [99, 100],
    sf: [102],
  },
};

// Monta as colunas do chaveamento como uma árvore completa: fase de
// 32/oitavas/quartas/semifinal de um lado (esquerda → direita), final (+
// disputa de 3º) no centro, e o outro lado em ordem espelhada (semifinal →
// fase de 32, direita → esquerda), convergindo para o centro. Cada coluna é
// { round, side, matches }, com `matches` na ordem em que devem ser
// desenhados de cima para baixo.
export function getBracketColumns(knockout) {
  const byId = {};
  Object.values(knockout || {}).forEach(list => (list || []).forEach(m => { byId[m.id] = m; }));

  const pick = ids => ids.map(id => byId[id]).filter(Boolean);

  const columns = [];
  ['r32', 'r16', 'qf', 'sf'].forEach(round => {
    const matches = pick(BRACKET_HALVES.left[round]);
    if (matches.length) columns.push({ round, side: 'left', matches });
  });

  const centerMatches = [...(knockout.final || []), ...(knockout.third || [])];
  if (centerMatches.length) columns.push({ round: 'final', side: 'center', matches: centerMatches });

  ['sf', 'qf', 'r16', 'r32'].forEach(round => {
    const matches = pick(BRACKET_HALVES.right[round]);
    if (matches.length) columns.push({ round, side: 'right', matches });
  });

  return columns;
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
