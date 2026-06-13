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
function renderGroups(groups) {
  const wrap = document.getElementById('groupsGrid');
  if (!groups || Object.keys(groups).length === 0) {
    wrap.innerHTML = '<div class="empty-state">Classificação ainda não disponível.</div>';
    return;
  }

  wrap.innerHTML = Object.keys(groups).sort().map(letter => {
    const teams = [...groups[letter]].sort((a, b) => {
      if (b.pts !== a.pts) return b.pts - a.pts;
      if (b.sg !== a.sg) return b.sg - a.sg;
      return b.gp - a.gp;
    });

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

function matchCardHTML(match) {
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

  const home = match.home || '<span class="bracket-match__team--tbd">A definir</span>';
  const away = match.away || '<span class="bracket-match__team--tbd">A definir</span>';

  return `
    <div class="match-card">
      <div class="match-card__meta">${match.group ? `Grupo ${match.group}` : (match.stage || '')}</div>
      <div class="match-card__team match-card__team--home">${home}</div>
      ${scoreHTML}
      <div class="match-card__team match-card__team--away">${away}</div>
      <div class="match-card__info">
        ${statusHTML}<br>${match.venue || ''}
      </div>
    </div>
  `;
}

function renderMatches(matches) {
  const tabsWrap = document.getElementById('matchTabs');
  const listWrap = document.getElementById('matchesList');

  if (!matches || (!matches.groupStage && !matches.knockout)) {
    listWrap.innerHTML = '<div class="empty-state">Tabela de jogos ainda não disponível.</div>';
    return;
  }

  const groupStage = matches.groupStage || [];
  const knockout = matches.knockout || {};

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
      byDate[date].forEach(m => { html += matchCardHTML(m); });
    });

    // Knockout
    let koKeysToShow = [];
    if (filter === 'all') koKeysToShow = knockoutKeys;
    else if (filter.startsWith('ko-')) koKeysToShow = [filter.replace('ko-', '')];

    koKeysToShow.forEach(k => {
      html += `<div class="match-day">${KNOCKOUT_LABELS[k]}</div>`;
      (knockout[k] || []).forEach(m => { html += matchCardHTML({ ...m, stage: KNOCKOUT_LABELS[k] }); });
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
function bracketMatchHTML(match) {
  const home = match.home || 'A definir';
  const away = match.away || 'A definir';
  const homeCls = match.home ? '' : 'bracket-match__team--tbd';
  const awayCls = match.away ? '' : 'bracket-match__team--tbd';
  const homeScore = match.homeScore ?? '';
  const awayScore = match.awayScore ?? '';

  return `
    <div class="bracket-match">
      <div class="bracket-match__team ${homeCls}"><span>${home}</span><span>${homeScore}</span></div>
      <div class="bracket-match__team ${awayCls}"><span>${away}</span><span>${awayScore}</span></div>
      ${match.date ? `<div class="bracket-match__date">${formatDate(match.date)}${match.venue ? ' · ' + match.venue : ''}</div>` : ''}
    </div>
  `;
}

function renderBracket(matches) {
  const wrap = document.getElementById('bracket');
  const knockout = matches && matches.knockout;

  if (!knockout || Object.keys(knockout).length === 0) {
    wrap.innerHTML = '<div class="empty-state">Chaveamento ainda não disponível.</div>';
    return;
  }

  const order = ['r32', 'r16', 'qf', 'sf', 'final'];

  wrap.innerHTML = order.filter(k => (knockout[k] || []).length > 0).map(k => `
    <div class="bracket__round">
      <div class="bracket__round-title">${KNOCKOUT_LABELS[k]}</div>
      ${(knockout[k] || []).map(bracketMatchHTML).join('')}
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
   INIT
   ============================================================ */
(async function init() {
  const [info, groups, matches, scorers] = await Promise.all([
    loadJSON('data/info.json'),
    loadJSON('data/groups.json'),
    loadJSON('data/matches.json'),
    loadJSON('data/scorers.json')
  ]);

  renderInfo(info);
  renderGroups(groups);
  renderMatches(matches);
  renderBracket(matches);
  renderScorers(scorers);
})();
