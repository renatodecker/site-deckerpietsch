import { buildSimulation } from './simulation.js';
import { getBracketColumns } from '../../copa/js/bracket.js';

/* ============================================================
   COOKIE (placares simulados ficam salvos só neste navegador)
   ============================================================ */
const COOKIE_NAME = 'copaSimState2026';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 180; // 180 dias

function loadSimState() {
  const match = document.cookie.match(new RegExp(`(?:^|; )${COOKIE_NAME}=([^;]*)`));
  if (!match) return {};
  try {
    const parsed = JSON.parse(decodeURIComponent(match[1]));
    return (parsed && typeof parsed === 'object') ? parsed : {};
  } catch {
    return {};
  }
}

function saveSimState(state) {
  document.cookie = `${COOKIE_NAME}=${encodeURIComponent(JSON.stringify(state))}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`;
}

function clearSimState() {
  document.cookie = `${COOKIE_NAME}=; path=/; max-age=0`;
}

/* ============================================================
   HELPERS
   ============================================================ */
async function loadJSON(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Falha ao carregar ${path}`);
  return res.json();
}

function formatDate(iso) {
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
}

const WEEKDAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

function formatDayLabel(iso) {
  const date = new Date(`${iso}T12:00:00`);
  return `${WEEKDAYS[date.getDay()]}, ${formatDate(iso)}`;
}

let teamFlagIndex = {};

function flagEmojiToClass(emoji) {
  if (!emoji) return '';
  const codePoints = [...emoji].map(c => c.codePointAt(0));
  if (codePoints[0] === 0x1F3F4) {
    const letters = codePoints.slice(1, -1).map(cp => String.fromCharCode(cp - 0xE0000)).join('');
    if (letters.length === 5) return `fi-${letters.slice(0, 2)}-${letters.slice(2)}`.toLowerCase();
    return '';
  }
  if (codePoints.length === 2) {
    const letters = codePoints.map(cp => String.fromCharCode(cp - 0x1F1E6 + 65)).join('');
    return `fi-${letters}`.toLowerCase();
  }
  return '';
}

function flagHTML(emoji) {
  const cls = flagEmojiToClass(emoji);
  return cls ? `<span class="fi ${cls}"></span>` : '';
}

function teamFlagHTML(name) {
  const flag = teamFlagIndex[name];
  return flag ? `<span class="team-flag">${flagHTML(flag)}</span>` : '';
}

// Converte o valor de um <input type="number"> em inteiro 0-99, ou `null`
// se o campo estiver vazio/invalido.
function parseScoreValue(value) {
  if (value === '' || value == null) return null;
  const n = parseInt(value, 10);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.min(n, 99);
}

/* ============================================================
   LEGENDAS / RÓTULOS
   ============================================================ */
const KNOCKOUT_LABELS = {
  r32: 'Fase de 32',
  r16: 'Oitavas de final',
  qf: 'Quartas de final',
  sf: 'Semifinais',
  third: 'Disputa de 3º lugar',
  final: 'Final'
};

// Rótulo legível para uma vaga ainda não definida ("1A", "3:A,B,C", "W101"...)
function sourceLabel(source) {
  if (!source) return 'A definir';
  if (/^[12][A-L]$/.test(source)) return source;
  if (source.startsWith('3:')) return `Melhor 3º (${source.slice(2).split(',').join('/')})`;
  const wl = source.match(/^([WL])(\d+)$/);
  if (wl) return wl[1] === 'W' ? `Vencedor - Jogo ${wl[2]}` : `Perdedor - Jogo ${wl[2]}`;
  return 'A definir';
}

// Pequena etiqueta (ex: "(1A)" ou "(3º - Grupo B)") ao lado do time já
// resolvido, indicando de onde ele veio.
function slotTagHTML(source, teamName, sim) {
  if (!source) return '';
  if (/^[12][A-L]$/.test(source)) return `<span class="slot-tag">(${source})</span>`;
  if (source.startsWith('3:')) {
    const third = sim.qualifiedThirds.find(t => t.team === teamName);
    return third ? `<span class="slot-tag">(3º - Grupo ${third.group})</span>` : '';
  }
  return '';
}

// Nome do time nas tabelas de classificação: em telas estreitas, a versão
// abreviada (t.short) substitui o nome completo para a tabela não estourar.
function teamNameHTML(t) {
  return `<span class="team-name__full">${t.team}</span><span class="team-name__short">${t.short || t.team}</span>`;
}

/* ============================================================
   GRUPOS / CLASSIFICAÇÃO
   ============================================================ */
function renderGroups(groups) {
  const wrap = document.getElementById('groupsGrid');

  wrap.innerHTML = Object.keys(groups).sort().map(letter => {
    const teams = groups[letter];

    const rows = teams.map((t, i) => {
      const cls = i < 2 ? 'qualified' : (i === 2 ? 'qualified-3rd' : '');
      return `
        <tr class="${cls}">
          <td>${i + 1}</td>
          <td class="team-cell"><span class="team-flag">${t.flag || ''}</span>${teamNameHTML(t)}</td>
          <td>${t.pj}</td>
          <td>${t.v}</td>
          <td>${t.e}</td>
          <td>${t.d}</td>
          <td>${t.gp}</td>
          <td>${t.gc}</td>
          <td>${t.sg}</td>
          <td><strong>${t.pts}</strong></td>
        </tr>
      `;
    }).join('');

    return `
      <div class="group-card">
        <div class="group-card__header">Grupo ${letter}<span>Classificação</span></div>
        <div class="standings-table-wrap">
          <table class="standings-table">
            <thead>
              <tr>
                <th>#</th>
                <th class="team-cell">Time</th>
                <th>J</th><th>V</th><th>E</th><th>D</th>
                <th>GP</th><th>GC</th><th>SG</th><th>Pts</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>
    `;
  }).join('');
}

function renderThirdPlaced(rankedThirds) {
  const wrap = document.getElementById('thirdPlacedWrap');

  const rows = rankedThirds.map((t, i) => {
    const cls = i < 8 ? 'qualified' : 'not-qualified';
    return `
      <tr class="${cls}">
        <td>${i + 1}</td>
        <td class="group-cell">${t.group}</td>
        <td class="team-cell"><span class="team-flag">${t.flag || ''}</span>${teamNameHTML(t)}</td>
        <td>${t.pj}</td>
        <td>${t.v}</td>
        <td>${t.e}</td>
        <td>${t.d}</td>
        <td>${t.gp}</td>
        <td>${t.gc}</td>
        <td>${t.sg}</td>
        <td><strong>${t.pts}</strong></td>
      </tr>
    `;
  }).join('');

  wrap.innerHTML = `
    <table class="standings-table">
      <thead>
        <tr>
          <th>#</th>
          <th class="group-cell">Grupo</th>
          <th class="team-cell">Time</th>
          <th>J</th><th>V</th><th>E</th><th>D</th>
          <th>GP</th><th>GC</th><th>SG</th><th>Pts</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

/* ============================================================
   JOGOS (FASE DE GRUPOS)
   ============================================================ */
function scoreFormHTML(match) {
  const pending = simState[match.id] || {};
  const homeVal = pending.h != null ? pending.h : (match.homeScore ?? '');
  const awayVal = pending.a != null ? pending.a : (match.awayScore ?? '');
  return `
    <div class="score-form">
      <input type="number" class="score-input" inputmode="numeric" min="0" max="99" data-side="home" value="${homeVal}" aria-label="Placar de ${match.home}" />
      <span class="score-form__sep">-</span>
      <input type="number" class="score-input" inputmode="numeric" min="0" max="99" data-side="away" value="${awayVal}" aria-label="Placar de ${match.away}" />
    </div>
  `;
}

function matchCardHTML(match, isSim) {
  return `
    <div class="match-card" data-match-id="${match.id}">
      <div class="match-card__meta">Grupo ${match.group}</div>
      <div class="match-card__team match-card__team--home">${teamFlagHTML(match.home)}${match.home}</div>
      <div class="match-card__score">
        ${scoreFormHTML(match)}
        ${isSim ? '<div class="sim-tag">Simulado</div>' : ''}
      </div>
      <div class="match-card__team match-card__team--away">${teamFlagHTML(match.away)}${match.away}</div>
      <div class="match-card__info">
        <span class="match-card__status">${formatDate(match.date)}</span>
      </div>
    </div>
  `;
}

let currentTab = 'all';

function renderMatches(groupStage, simState) {
  const tabsWrap = document.getElementById('matchTabs');
  const listWrap = document.getElementById('matchesList');

  const groupLetters = [...new Set(groupStage.map(m => m.group))].sort();
  const tabs = [{ id: 'all', label: 'Todos' }, ...groupLetters.map(g => ({ id: g, label: `Grupo ${g}` }))];

  if (!tabs.some(t => t.id === currentTab)) currentTab = 'all';

  tabsWrap.innerHTML = tabs.map(t => `
    <button class="tab-btn ${t.id === currentTab ? 'active' : ''}" data-tab="${t.id}">${t.label}</button>
  `).join('');

  const filtered = currentTab === 'all' ? groupStage : groupStage.filter(m => m.group === currentTab);

  const byDate = {};
  filtered.forEach(m => {
    byDate[m.date] = byDate[m.date] || [];
    byDate[m.date].push(m);
  });

  let html = '';
  Object.keys(byDate).sort().forEach(date => {
    html += `<div class="match-day">${formatDayLabel(date)}</div>`;
    byDate[date].forEach(m => { html += matchCardHTML(m, !!simState[m.id]); });
  });

  listWrap.innerHTML = html || '<div class="empty-state">Nenhum jogo para este filtro.</div>';

  tabsWrap.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      currentTab = btn.dataset.tab;
      renderMatches(groupStage, simState);
    });
  });
}

/* ============================================================
   CHAVEAMENTO (MATA-MATA)
   ============================================================ */
function bracketMatchHTML(match, sim) {
  const homeResolved = !!match.home;
  const awayResolved = !!match.away;
  const canScore = homeResolved && awayResolved;

  const homeLabel = homeResolved
    ? `${teamFlagHTML(match.home)}${match.home} ${slotTagHTML(match.homeSource, match.home, sim)}`
    : sourceLabel(match.homeSource);
  const awayLabel = awayResolved
    ? `${teamFlagHTML(match.away)}${match.away} ${slotTagHTML(match.awaySource, match.away, sim)}`
    : sourceLabel(match.awaySource);

  let homeScoreHTML;
  let awayScoreHTML;
  if (canScore) {
    const pending = simState[match.id] || {};
    const homeVal = pending.h != null ? pending.h : (match.homeScore ?? '');
    const awayVal = pending.a != null ? pending.a : (match.awayScore ?? '');
    homeScoreHTML = `<div class="score-form"><input type="number" class="score-input" inputmode="numeric" min="0" max="99" data-side="home" value="${homeVal}" aria-label="Placar de ${match.home}" /></div>`;
    awayScoreHTML = `<div class="score-form"><input type="number" class="score-input" inputmode="numeric" min="0" max="99" data-side="away" value="${awayVal}" aria-label="Placar de ${match.away}" /></div>`;
  } else {
    homeScoreHTML = '<span class="bracket-match__pending">-</span>';
    awayScoreHTML = '<span class="bracket-match__pending">-</span>';
  }

  let penaltyHTML = '';
  if (canScore && match.homeScore != null && match.awayScore != null && match.homeScore === match.awayScore) {
    const chosen = match.winnerSide;
    penaltyHTML = `
      <div class="penalty-picker">
        <span class="penalty-picker__label">Empate! Quem avança nos pênaltis?</span>
        <button type="button" class="penalty-picker__btn ${chosen === 'home' ? 'penalty-picker__btn--chosen' : ''}" data-pen="home">${match.home}</button>
        <button type="button" class="penalty-picker__btn ${chosen === 'away' ? 'penalty-picker__btn--chosen' : ''}" data-pen="away">${match.away}</button>
      </div>
    `;
  }

  return `
    <div class="bracket-match" ${canScore ? `data-match-id="${match.id}"` : ''}>
      <div class="bracket-match__id">${match.id}</div>
      <div class="bracket-match__team ${homeResolved ? '' : 'bracket-match__team--tbd'}">
        <span>${homeLabel}</span>
        ${homeScoreHTML}
      </div>
      <div class="bracket-match__team ${awayResolved ? '' : 'bracket-match__team--tbd'}">
        <span>${awayLabel}</span>
        ${awayScoreHTML}
      </div>
      ${match.date ? `<div class="bracket-match__date">${formatDate(match.date)}</div>` : ''}
      ${penaltyHTML}
    </div>
  `;
}

function renderBracket(knockout, sim) {
  const wrap = document.getElementById('bracket');
  const columns = getBracketColumns(knockout);

  wrap.innerHTML = columns.map(col => {
    if (col.side === 'center') {
      const [final, third] = col.matches;
      return `
        <div class="bracket__round bracket__round--center">
          <div class="bracket__round-title">${KNOCKOUT_LABELS.final}</div>
          ${bracketMatchHTML(final, sim)}
          ${third ? `
            <div class="bracket__round-title bracket__round-title--third">${KNOCKOUT_LABELS.third}</div>
            ${bracketMatchHTML(third, sim)}
          ` : ''}
        </div>
      `;
    }
    return `
      <div class="bracket__round bracket__round--${col.side}">
        <div class="bracket__round-title">${KNOCKOUT_LABELS[col.round]}</div>
        ${col.matches.map(m => bracketMatchHTML(m, sim)).join('')}
      </div>
    `;
  }).join('');
}

/* ============================================================
   CAMPEÃO
   ============================================================ */
function renderChampion(champion) {
  const wrap = document.getElementById('championBanner');
  if (!champion) {
    wrap.hidden = true;
    wrap.innerHTML = '';
    return;
  }

  wrap.hidden = false;
  wrap.innerHTML = `
    <img class="champion-banner__trophy" src="assets/copa-do-mundo-da-FIFA-800x450.jpg" alt="Taça da Copa do Mundo" />
    <div class="champion-banner__label">Campeão da Copa do Mundo FIFA 2026 (simulação)</div>
    <div class="champion-banner__team"><span class="champion-banner__flag">${flagHTML(teamFlagIndex[champion])}</span>${champion}</div>
  `;
}

/* ============================================================
   STATUS / RESET
   ============================================================ */
function renderStatus(simState) {
  const el = document.getElementById('simStatus');
  const count = Object.values(simState).filter(s => s && s.h != null && s.a != null).length;
  el.textContent = count > 0
    ? `${count} ${count === 1 ? 'jogo simulado' : 'jogos simulados'} além dos resultados reais.`
    : 'Mostrando os resultados reais até agora. Digite um placar para começar a simular.';
}

/* ============================================================
   INIT / RENDER
   ============================================================ */
let baseMatches = null;
let teams = null;
let simState = {};

function render() {
  const sim = buildSimulation(baseMatches, teams, simState);

  renderGroups(sim.groups);
  renderThirdPlaced(sim.rankedThirds);
  renderMatches(sim.groupStage, simState);
  renderBracket(sim.knockout, sim);
  renderChampion(sim.champion);
  renderStatus(simState);
}

function setScore(matchId, side, rawValue) {
  const value = parseScoreValue(rawValue);
  const key = side === 'home' ? 'h' : 'a';
  const entry = { ...(simState[matchId] || {}) };

  if (value == null) delete entry[key];
  else entry[key] = value;

  if (entry.h == null || entry.a == null) {
    delete entry.p;
  } else if (entry.h !== entry.a) {
    delete entry.p;
  }

  if (entry.h == null && entry.a == null) {
    delete simState[matchId];
  } else {
    simState[matchId] = entry;
  }

  saveSimState(simState);
  render();
}

function setPenaltyWinner(matchId, side) {
  const entry = simState[matchId];
  if (!entry || entry.h == null || entry.a == null || entry.h !== entry.a) return;
  entry.p = side;
  saveSimState(simState);
  render();
}

(async function init() {
  const [matches, teamsData] = await Promise.all([
    loadJSON('../copa/data/matches.json'),
    loadJSON('../copa/data/teams.json')
  ]);

  baseMatches = matches;
  teams = teamsData;
  teamFlagIndex = {};
  teams.forEach(t => { teamFlagIndex[t.name] = t.flag; });

  simState = loadSimState();

  render();

  document.addEventListener('change', (e) => {
    const input = e.target;
    if (!input.classList || !input.classList.contains('score-input')) return;
    const container = input.closest('[data-match-id]');
    if (!container) return;
    setScore(container.dataset.matchId, input.dataset.side, input.value);
  });

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.penalty-picker__btn');
    if (!btn) return;
    const container = btn.closest('[data-match-id]');
    if (!container) return;
    setPenaltyWinner(container.dataset.matchId, btn.dataset.pen);
  });

  document.getElementById('resetSim').addEventListener('click', () => {
    if (Object.keys(simState).length === 0) return;
    if (!confirm('Tem certeza que deseja zerar sua simulação e voltar aos resultados reais?')) return;
    simState = {};
    clearSimState();
    currentTab = 'all';
    render();
  });
})();
