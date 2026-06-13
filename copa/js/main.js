/* ============================================================
   HEADER / NAV (igual ao site principal)
   ============================================================ */
const header = document.getElementById('header');
window.addEventListener('scroll', () => {
  header.classList.toggle('scrolled', window.scrollY > 10);
}, { passive: true });

const navToggle = document.getElementById('navToggle');
const nav = document.getElementById('nav');

navToggle.addEventListener('click', () => {
  const open = nav.classList.toggle('open');
  navToggle.setAttribute('aria-expanded', open);
});

nav.querySelectorAll('.nav__link').forEach(link => {
  link.addEventListener('click', () => {
    nav.classList.remove('open');
    navToggle.setAttribute('aria-expanded', false);
  });
});

/* ============================================================
   HELPERS
   ============================================================ */
async function loadJSON(path) {
  try {
    const res = await fetch(path);
    if (!res.ok) throw new Error(`Falha ao carregar ${path}`);
    return await res.json();
  } catch (err) {
    console.error(err);
    return null;
  }
}

function formatDate(iso) {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}`;
}

const WEEKDAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

function formatDayLabel(iso) {
  const date = new Date(`${iso}T12:00:00`);
  const weekday = WEEKDAYS[date.getDay()];
  return `${weekday}, ${formatDate(iso)}`;
}

/* ============================================================
   INFO / HERO META / FORMATO
   ============================================================ */
function renderInfo(info) {
  if (!info) return;

  const heroMeta = document.getElementById('heroMeta');
  heroMeta.innerHTML = (info.meta || []).map(item => `
    <span class="hero__meta-item"><strong>${item.label}:</strong> ${item.value}</span>
  `).join('');

  const formatGrid = document.getElementById('formatGrid');
  formatGrid.innerHTML = (info.format || []).map(card => `
    <div class="format-card">
      <div class="format-card__icon">${card.icon || ''}</div>
      <h3 class="format-card__title">${card.title}</h3>
      <div class="format-card__desc">
        ${card.desc ? `<p>${card.desc}</p>` : ''}
        ${card.list ? `<ul>${card.list.map(li => `<li>${li}</li>`).join('')}</ul>` : ''}
      </div>
    </div>
  `).join('');

  const lastUpdated = document.getElementById('lastUpdated');
  lastUpdated.textContent = info.lastUpdated
    ? `Última atualização: ${info.lastUpdated}`
    : 'Dados ainda não disponíveis';
}

/* ============================================================
   GRUPOS / CLASSIFICAÇÃO
   ============================================================ */
function compareStandings(a, b) {
  if (b.pts !== a.pts) return b.pts - a.pts;
  if (b.sg !== a.sg) return b.sg - a.sg;
  return b.gp - a.gp;
}

function renderGroups(groups) {
  const wrap = document.getElementById('groupsGrid');
  if (!groups || Object.keys(groups).length === 0) {
    wrap.innerHTML = '<div class="empty-state">Classificação ainda não disponível.</div>';
    return;
  }

  wrap.innerHTML = Object.keys(groups).sort().map(letter => {
    const teams = [...groups[letter]].sort(compareStandings);

    const rows = teams.map((t, i) => {
      const cls = i < 2 ? 'qualified' : (i === 2 ? 'qualified-3rd' : '');
      return `
        <tr class="${cls}">
          <td>${i + 1}</td>
          <td class="team-cell"><span class="team-flag">${t.flag || ''}</span>${t.team}</td>
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
        <div class="group-card__header">
          Grupo ${letter}
          <span>Classificação</span>
        </div>
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
    `;
  }).join('');
}

/* ============================================================
   MELHORES TERCEIROS
   ============================================================ */
function getThirdPlacedTeams(groups) {
  if (!groups) return [];
  return Object.keys(groups).sort().map(letter => {
    const teams = [...groups[letter]].sort(compareStandings);
    return { ...teams[2], group: letter };
  }).sort(compareStandings);
}

function renderThirdPlaced(groups) {
  const wrap = document.getElementById('thirdPlacedWrap');
  if (!groups || Object.keys(groups).length === 0) {
    wrap.innerHTML = '<div class="empty-state">Classificação ainda não disponível.</div>';
    return;
  }

  const ranked = getThirdPlacedTeams(groups);

  const rows = ranked.map((t, i) => {
    const cls = i < 8 ? 'qualified' : 'not-qualified';
    return `
      <tr class="${cls}">
        <td>${i + 1}</td>
        <td class="group-cell">${t.group}</td>
        <td class="team-cell"><span class="team-flag">${t.flag || ''}</span>${t.team}</td>
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
   PROJEÇÃO DE VAGAS DO MATA-MATA
   ============================================================ */
function flattenKnockout(knockout) {
  const flat = {};
  Object.values(knockout || {}).forEach(list => {
    (list || []).forEach(m => { flat[m.id] = m; });
  });
  return flat;
}

function getGroupSlot(groups, letter, pos) {
  const teams = groups && groups[letter];
  if (!teams || teams.length === 0) return null;
  if (!teams.some(t => t.pj > 0)) return null;
  const sorted = [...teams].sort(compareStandings);
  return sorted[pos - 1] || null;
}

function getMatchOutcome(match, wantLoser) {
  if (!match || match.status !== 'finished') return null;
  if (match.homeScore == null || match.awayScore == null) return null;
  let homeWins;
  if (match.homeScore !== match.awayScore) homeWins = match.homeScore > match.awayScore;
  else if (match.winner === 'home') homeWins = true;
  else if (match.winner === 'away') homeWins = false;
  else return null;
  return (wantLoser ? !homeWins : homeWins) ? match.home : match.away;
}

// Resolve a slot code ("1A", "2C", "3:A,B,C,D,F", "W73", "L101") into a
// display label. `resolved: true` means a real team name is known.
function resolveSlot(source, groups, knockoutFlat) {
  if (!source) return null;

  let m = source.match(/^([12])([A-L])$/);
  if (m) {
    const team = getGroupSlot(groups, m[2], Number(m[1]));
    if (team) return { team: team.team, label: source, resolved: true };
    return { team: null, label: source, resolved: false };
  }

  m = source.match(/^3:(.+)$/);
  if (m) {
    return { team: null, label: `Melhor 3º (${m[1].split(',').join('/')})`, resolved: false };
  }

  m = source.match(/^([WL])(\d+)$/);
  if (m) {
    const team = getMatchOutcome(knockoutFlat[Number(m[2])], m[1] === 'L');
    if (team) return { team, label: source, resolved: true };
    const verb = m[1] === 'W' ? 'Vencedor' : 'Perdedor';
    return { team: null, label: `${verb} Jogo ${m[2]}`, resolved: false };
  }

  return { team: null, label: source, resolved: false };
}

// Returns { html, tbd } for a match's home/away side, resolving
// homeSource/awaySource against current standings when the team isn't set yet.
function resolveTeamDisplay(match, side, groups, knockoutFlat) {
  const team = match[side];
  if (team) return { html: team, tbd: false };

  const slot = resolveSlot(match[`${side}Source`], groups, knockoutFlat);
  if (!slot) return { html: 'A definir', tbd: true };
  if (slot.resolved) return { html: `${slot.team} <span class="slot-tag">(${slot.label})</span>`, tbd: false };
  return { html: slot.label, tbd: true };
}

/* ============================================================
   JOGOS (FASE DE GRUPOS + MATA-MATA)
   ============================================================ */
const KNOCKOUT_LABELS = {
  r32: 'Fase de 32',
  r16: 'Oitavas de final',
  qf: 'Quartas de final',
  sf: 'Semifinais',
  third: 'Disputa de 3º lugar',
  final: 'Final'
};

function matchCardHTML(match, groups, knockoutFlat) {
  const isFinished = match.status === 'finished';
  const isLive = match.status === 'live';

  let scoreHTML;
  if (isFinished || isLive) {
    scoreHTML = `<span class="match-card__score">${match.homeScore} - ${match.awayScore}</span>`;
  } else {
    scoreHTML = `<span class="match-card__score match-card__score--pending">vs</span>`;
  }

  let statusHTML = '';
  if (isFinished) statusHTML = '<span class="match-card__status match-card__status--finished">Encerrado</span>';
  else if (isLive) statusHTML = '<span class="match-card__status match-card__status--live">Em andamento</span>';
  else {
    const label = match.time || (match.date ? formatDate(match.date) : 'A definir');
    statusHTML = `<span class="match-card__status">${label}</span>`;
  }

  const home = resolveTeamDisplay(match, 'home', groups, knockoutFlat);
  const away = resolveTeamDisplay(match, 'away', groups, knockoutFlat);

  return `
    <div class="match-card">
      <div class="match-card__meta">${match.group ? `Grupo ${match.group}` : (match.stage || '')}</div>
      <div class="match-card__team match-card__team--home ${home.tbd ? 'bracket-match__team--tbd' : ''}">${home.html}</div>
      ${scoreHTML}
      <div class="match-card__team match-card__team--away ${away.tbd ? 'bracket-match__team--tbd' : ''}">${away.html}</div>
      <div class="match-card__info">
        ${statusHTML}<br>${match.venue || ''}
      </div>
    </div>
  `;
}

function renderMatches(matches, groups) {
  const tabsWrap = document.getElementById('matchTabs');
  const listWrap = document.getElementById('matchesList');

  if (!matches || (!matches.groupStage && !matches.knockout)) {
    listWrap.innerHTML = '<div class="empty-state">Tabela de jogos ainda não disponível.</div>';
    return;
  }

  const groupStage = matches.groupStage || [];
  const knockout = matches.knockout || {};
  const knockoutFlat = flattenKnockout(knockout);

  // Build group filter tabs
  const groupLetters = [...new Set(groupStage.map(m => m.group))].sort();
  const knockoutKeys = Object.keys(KNOCKOUT_LABELS).filter(k => (knockout[k] || []).length > 0);

  const tabs = [
    { id: 'all', label: 'Todos' },
    ...groupLetters.map(g => ({ id: `group-${g}`, label: `Grupo ${g}` })),
    ...knockoutKeys.map(k => ({ id: `ko-${k}`, label: KNOCKOUT_LABELS[k] }))
  ];

  tabsWrap.innerHTML = tabs.map((t, i) => `
    <button class="tab-btn ${i === 0 ? 'active' : ''}" data-tab="${t.id}">${t.label}</button>
  `).join('');

  function renderList(filter) {
    let html = '';

    // Group stage, organized by date
    let filteredGroupStage = groupStage;
    if (filter.startsWith('group-')) {
      const g = filter.replace('group-', '');
      filteredGroupStage = groupStage.filter(m => m.group === g);
    } else if (filter.startsWith('ko-')) {
      filteredGroupStage = [];
    }

    const byDate = {};
    filteredGroupStage.forEach(m => {
      byDate[m.date] = byDate[m.date] || [];
      byDate[m.date].push(m);
    });

    Object.keys(byDate).sort().forEach(date => {
      html += `<div class="match-day">${formatDayLabel(date)}</div>`;
      byDate[date].forEach(m => { html += matchCardHTML(m, groups, knockoutFlat); });
    });

    // Knockout
    let koKeysToShow = [];
    if (filter === 'all') koKeysToShow = knockoutKeys;
    else if (filter.startsWith('ko-')) koKeysToShow = [filter.replace('ko-', '')];

    koKeysToShow.forEach(k => {
      html += `<div class="match-day">${KNOCKOUT_LABELS[k]}</div>`;
      (knockout[k] || []).forEach(m => { html += matchCardHTML({ ...m, stage: KNOCKOUT_LABELS[k] }, groups, knockoutFlat); });
    });

    listWrap.innerHTML = html || '<div class="empty-state">Nenhum jogo para este filtro.</div>';
  }

  renderList('all');

  tabsWrap.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      tabsWrap.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderList(btn.dataset.tab);
    });
  });
}

/* ============================================================
   CHAVEAMENTO (BRACKET)
   ============================================================ */
function bracketMatchHTML(match, groups, knockoutFlat) {
  const home = resolveTeamDisplay(match, 'home', groups, knockoutFlat);
  const away = resolveTeamDisplay(match, 'away', groups, knockoutFlat);
  const homeCls = home.tbd ? 'bracket-match__team--tbd' : '';
  const awayCls = away.tbd ? 'bracket-match__team--tbd' : '';
  const homeScore = match.homeScore ?? '';
  const awayScore = match.awayScore ?? '';

  return `
    <div class="bracket-match">
      <div class="bracket-match__team ${homeCls}"><span>${home.html}</span><span>${homeScore}</span></div>
      <div class="bracket-match__team ${awayCls}"><span>${away.html}</span><span>${awayScore}</span></div>
      ${match.date ? `<div class="bracket-match__date">${formatDate(match.date)}${match.venue ? ' · ' + match.venue : ''}</div>` : ''}
    </div>
  `;
}

function renderBracket(matches, groups) {
  const wrap = document.getElementById('bracket');
  const knockout = matches && matches.knockout;

  if (!knockout || Object.keys(knockout).length === 0) {
    wrap.innerHTML = '<div class="empty-state">Chaveamento ainda não disponível.</div>';
    return;
  }

  const knockoutFlat = flattenKnockout(knockout);
  const order = ['r32', 'r16', 'qf', 'sf', 'final'];

  wrap.innerHTML = order.filter(k => (knockout[k] || []).length > 0).map(k => `
    <div class="bracket__round">
      <div class="bracket__round-title">${KNOCKOUT_LABELS[k]}</div>
      ${(knockout[k] || []).map(m => bracketMatchHTML(m, groups, knockoutFlat)).join('')}
    </div>
  `).join('');
}

/* ============================================================
   ARTILHARIA
   ============================================================ */
function renderScorers(data) {
  const wrap = document.getElementById('scorersWrap');
  const scorers = data && data.scorers;

  if (!scorers || scorers.length === 0) {
    wrap.innerHTML = '<div class="empty-state">A artilharia será atualizada conforme os jogos acontecem.</div>';
    return;
  }

  const rows = scorers
    .sort((a, b) => b.goals - a.goals)
    .map((s, i) => `
      <tr>
        <td class="num">${i + 1}</td>
        <td>${s.name}</td>
        <td>${s.country}</td>
        <td class="num">${s.goals}</td>
      </tr>
    `).join('');

  wrap.innerHTML = `
    <table class="scorers-table">
      <thead>
        <tr><th>#</th><th>Jogador</th><th>Seleção</th><th>Gols</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

/* ============================================================
   TEMA DINÂMICO (BANDEIRAS DAS SELEÇÕES)
   ============================================================ */
function hexToRgb(hex) {
  const clean = hex.replace('#', '');
  return {
    r: parseInt(clean.substring(0, 2), 16),
    g: parseInt(clean.substring(2, 4), 16),
    b: parseInt(clean.substring(4, 6), 16)
  };
}

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const delta = max - min;
  let h = 0, s = 0;
  if (delta !== 0) {
    s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min);
    switch (max) {
      case r: h = ((g - b) / delta) % 6; break;
      case g: h = (b - r) / delta + 2; break;
      default: h = (r - g) / delta + 4;
    }
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s, l };
}

function hslToRgb(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((h / 60) % 2 - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const toByte = v => Math.round((v + m) * 255);
  return { r: toByte(r), g: toByte(g), b: toByte(b) };
}

function rgbToHex(r, g, b) {
  const toHex = v => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

// Regenera uma cor a partir de um hex base, fixando a luminosidade (preservando matiz)
// e ajustando a saturação por um fator, para montar a escala de variáveis --navy-*/--gold-*.
function shade(hex, targetL, satFactor = 1) {
  const { r, g, b } = hexToRgb(hex);
  const { h, s } = rgbToHsl(r, g, b);
  const newS = Math.max(0, Math.min(1, s * satFactor));
  const rgb = hslToRgb(h, newS, targetL);
  return rgbToHex(rgb.r, rgb.g, rgb.b);
}

// Alvos de luminosidade/saturação calibrados a partir da escala padrão (Brasil)
const NAVY_SCALE = [
  { key: '900', l: 0.0725, sat: 1.06 },
  { key: '800', l: 0.1216, sat: 1.05 },
  { key: '700', l: 0.1745, sat: 0.99 },
  { key: '600', l: 0.2392, sat: 0.91 },
  { key: '400', l: 0.4922, sat: 0.53 },
  { key: '100', l: 0.8824, sat: 0.68 },
  { key: '50',  l: 0.9490, sat: 0.83 }
];

const GOLD_SCALE = [
  { key: '700', l: 0.2706, sat: 1 },
  { key: '600', l: 0.3510, sat: 1 },
  { key: '500', l: 0.4157, sat: 1 },
  { key: '400', l: 0.5000, sat: 1 },
  { key: '200', l: 0.8451, sat: 1 },
  { key: '50',  l: 0.9647, sat: 1 }
];

const THEME_STORAGE_KEY = 'copaTheme';

function applyTheme(team) {
  const root = document.documentElement;
  NAVY_SCALE.forEach(step => root.style.setProperty(`--navy-${step.key}`, shade(team.navy, step.l, step.sat)));
  GOLD_SCALE.forEach(step => root.style.setProperty(`--gold-${step.key}`, shade(team.gold, step.l, step.sat)));

  localStorage.setItem(THEME_STORAGE_KEY, team.name);
  setActiveFlag(team.name);

  const resetBtn = document.getElementById('themeReset');
  if (resetBtn) resetBtn.hidden = false;
}

function resetTheme() {
  const root = document.documentElement;
  NAVY_SCALE.forEach(step => root.style.removeProperty(`--navy-${step.key}`));
  GOLD_SCALE.forEach(step => root.style.removeProperty(`--gold-${step.key}`));

  localStorage.removeItem(THEME_STORAGE_KEY);
  setActiveFlag(null);

  const resetBtn = document.getElementById('themeReset');
  if (resetBtn) resetBtn.hidden = true;
}

function setActiveFlag(teamName) {
  document.querySelectorAll('.flag-bar__flag').forEach(btn => {
    btn.classList.toggle('flag-bar__flag--active', btn.dataset.team === teamName);
  });
}

function renderFlagBar(teams) {
  const wrap = document.getElementById('flagBar');
  const resetBtn = document.getElementById('themeReset');
  if (!teams || teams.length === 0) {
    wrap.innerHTML = '<div class="empty-state">Seleções ainda não disponíveis.</div>';
    return;
  }

  wrap.innerHTML = teams.map(t => `
    <button type="button" class="flag-bar__flag" data-team="${t.name}" title="${t.name}" aria-label="${t.name}">
      ${t.flag}
    </button>
  `).join('');

  wrap.querySelectorAll('.flag-bar__flag').forEach(btn => {
    btn.addEventListener('click', () => {
      const team = teams.find(t => t.name === btn.dataset.team);
      if (team) applyTheme(team);
    });
  });

  if (resetBtn) {
    resetBtn.addEventListener('click', () => resetTheme());
  }

  const saved = localStorage.getItem(THEME_STORAGE_KEY);
  if (saved) {
    const team = teams.find(t => t.name === saved);
    if (team) applyTheme(team);
  }
}

/* ============================================================
   ESTÁDIOS-SEDE
   ============================================================ */
const STADIUM_ICON = `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 48" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <ellipse cx="32" cy="24" rx="30" ry="22" />
    <ellipse cx="32" cy="24" rx="13" ry="9" />
    <path d="M32 2v44" />
  </svg>
`;

function renderStadiums(stadiums) {
  const grid = document.getElementById('stadiumGrid');
  const markers = document.getElementById('stadiumMarkers');

  if (!stadiums || stadiums.length === 0) {
    grid.innerHTML = '<div class="empty-state">Lista de estádios ainda não disponível.</div>';
    return;
  }

  grid.innerHTML = stadiums.map(s => `
    <div class="stadium-card" id="stadium-${s.id}" data-stadium="${s.id}">
      <div class="stadium-card__icon">${STADIUM_ICON}</div>
      <div class="stadium-card__body">
        <p class="stadium-card__name">${s.name}</p>
        <p class="stadium-card__city">${s.flag} ${s.city}, ${s.country}</p>
        <p class="stadium-card__capacity">Capacidade: ${s.capacity}</p>
      </div>
    </div>
  `).join('');

  markers.innerHTML = stadiums.map(s => `
    <g class="map-marker" data-stadium="${s.id}" transform="translate(${(s.x * 10).toFixed(1)} ${(s.y * 7).toFixed(1)})">
      <title>${s.name} — ${s.city}</title>
      <circle r="9" class="map-marker__halo" />
      <circle r="4" class="map-marker__dot" />
    </g>
  `).join('');

  function highlightStadium(id) {
    document.querySelectorAll('.stadium-card').forEach(c => c.classList.toggle('stadium-card--highlight', c.dataset.stadium === id));
    document.querySelectorAll('.map-marker').forEach(m => m.classList.toggle('map-marker--active', m.dataset.stadium === id));
  }

  grid.querySelectorAll('.stadium-card').forEach(card => {
    card.addEventListener('click', () => highlightStadium(card.dataset.stadium));
  });

  markers.querySelectorAll('.map-marker').forEach(marker => {
    marker.addEventListener('click', () => {
      const id = marker.dataset.stadium;
      highlightStadium(id);
      const card = document.getElementById(`stadium-${id}`);
      if (card) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  });
}

/* ============================================================
   INIT
   ============================================================ */
(async function init() {
  const [info, groups, matches, scorers, teams, stadiums] = await Promise.all([
    loadJSON('data/info.json'),
    loadJSON('data/groups.json'),
    loadJSON('data/matches.json'),
    loadJSON('data/scorers.json'),
    loadJSON('data/teams.json'),
    loadJSON('data/stadiums.json')
  ]);

  renderInfo(info);
  renderGroups(groups);
  renderThirdPlaced(groups);
  renderMatches(matches, groups);
  renderBracket(matches, groups);
  renderScorers(scorers);
  renderFlagBar(teams);
  renderStadiums(stadiums);
})();
