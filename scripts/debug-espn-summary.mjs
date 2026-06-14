#!/usr/bin/env node
// Script temporário de diagnóstico: inspeciona a resposta do endpoint
// "summary" da ESPN para um jogo já finalizado, para entender por que
// extractMatchDetails (copa/js/espn.js) não está encontrando gols/cartões.
// Remover após o diagnóstico.

const espnId = process.argv[2] || '760425'; // Países Baixos 2x2 Japão

const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/summary?event=${espnId}`;
const res = await fetch(url);
console.log('status:', res.status);
const data = await res.json();

console.log('top-level keys:', Object.keys(data));

const header = data.header;
console.log('header keys:', header ? Object.keys(header) : null);

const competition = header && header.competitions && header.competitions[0];
console.log('competition keys:', competition ? Object.keys(competition) : null);

if (competition) {
  console.log('has details?', Array.isArray(competition.details), 'length:', (competition.details || []).length);
  console.log('details sample:', JSON.stringify((competition.details || []).slice(0, 3), null, 2));

  console.log('competitors:', JSON.stringify((competition.competitors || []).map(c => ({
    id: c.id,
    homeAway: c.homeAway,
    teamId: c.team && c.team.id,
    teamDisplayName: c.team && c.team.displayName,
  })), null, 2));
}

console.log('other top-level keys with array data:');
Object.keys(data).forEach(k => {
  if (Array.isArray(data[k])) console.log(' -', k, 'length:', data[k].length);
});
