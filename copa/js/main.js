import { sortGroupStandings, sortThirdPlaced } from './standings.js';
import { fetchLiveUpdate } from './espn.js';
import { getBracketColumns } from './bracket.js';

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
   FUSOS HORÁRIOS
   ============================================================ */
// Formata o offset GMT do horário local de quem acessa, ex: "GMT-03:00"
function gmtOffsetLabel(date) {
  const offsetMin = -date.getTimezoneOffset();
  const sign = offsetMin >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMin);
  const hh = String(Math.floor(abs / 60)).padStart(2, '0');
  const mm = String(abs % 60).padStart(2, '0');
  return `GMT${sign}${hh}:${mm}`;
}

// Data/horário local de quem acessa, com o offset GMT
function formatLocalDateTime(date) {
  const dateStr = date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const timeStr = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return `${dateStr} às ${timeStr} (${gmtOffsetLabel(date)})`;
}

// Converte um horário "de parede" (date/hora/minuto) num fuso IANA para um instante UTC real
function zonedTimeToUtc(dateStr, hour, minute, timeZone) {
  const naive = new Date(`${dateStr}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00Z`);
  const asTz = new Date(naive.toLocaleString('en-US', { timeZone }));
  const asUtc = new Date(naive.toLocaleString('en-US', { timeZone: 'UTC' }));
  const diff = asTz.getTime() - asUtc.getTime();
  return new Date(naive.getTime() - diff);
}

// Extrai hora/minuto (e eventual data alternativa) de strings como "12h ET", "20h30", "00h ET (13/06)"
function parseMatchTime(match) {
  const raw = match.time;
  if (!raw || raw === '—') return null;
  const m = raw.match(/^(\d{1,2})h(\d{2})?\s*(ET)?(?:\s*\((\d{2})\/(\d{2})\))?$/);
  if (!m) return null;

  const hour = Number(m[1]);
  const minute = m[2] ? Number(m[2]) : 0;
  const isET = !!m[3];
  let dateStr = match.date;
  if (m[4] && m[5]) {
    const year = match.date.split('-')[0];
    dateStr = `${year}-${m[5]}-${m[4]}`;
  }
  return { hour, minute, isET, dateStr };
}

// Retorna { local, venue } com os horários formatados no fuso de quem acessa e no fuso da sede
function formatMatchTimes(match, stadium) {
  const parsed = parseMatchTime(match);
  if (!parsed) return null;

  const refTz = parsed.isET ? 'America/New_York' : (stadium ? stadium.timezone : 'America/New_York');
  const instant = zonedTimeToUtc(parsed.dateStr, parsed.hour, parsed.minute, refTz);

  const local = instant.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const venue = stadium
    ? instant.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: stadium.timezone })
    : null;

  return { local, venue };
}

/* ============================================================
   INFO / HERO META / FORMATO
   ============================================================ */
function renderInfo(info) {
  if (!info) return;

  const heroMeta = document.getElementById('heroMeta');
  heroMeta.innerHTML = (info.meta || []).map(item => `
    <span class="hero__meta-item"><strong>${item.label}:</strong> ${replaceFlagEmojis(item.value)}</span>
  `).join('');

  const formatGrid = document.getElementById('formatGrid');
  formatGrid.innerHTML = (info.format || []).map(card => `
    <div class="format-card">
      <div class="format-card__icon">${card.icon || ''}</div>
      <h3 class="format-card__title">${card.title}</h3>
      <div class="format-card__desc">
        ${card.desc ? `<p>${card.desc}</p>` : ''}
        ${card.list ? `<ul>${card.list.map(li => `<li>${replaceFlagEmojis(li)}</li>`).join('')}</ul>` : ''}
      </div>
    </div>
  `).join('');

  renderLastUpdated();
}

// Mostra a data/hora local de quem acessa (com offset GMT) como "última atualização"
function renderLastUpdated() {
  const lastUpdated = document.getElementById('lastUpdated');
  if (lastUpdated) lastUpdated.textContent = `Última atualização: ${formatLocalDateTime(new Date())}`;
}

// Nome do time nas tabelas de classificação: em telas estreitas, a versão
// abreviada (t.short) substitui o nome completo para a tabela não estourar.
function teamNameHTML(t) {
  return `<span class="team-name__full">${t.team}</span><span class="team-name__short">${t.short || t.team}</span>`;
}

/* ============================================================
   GRUPOS / CLASSIFICAÇÃO
   ============================================================ */
// Jogos da fase de grupos que estão em andamento agora
function getLiveGroupMatches(matches) {
  if (!matches || !matches.groupStage) return [];
  return matches.groupStage.filter(m => m.status === 'live');
}

// Aplica o placar de jogos em andamento à classificação, como se o jogo
// tivesse terminado agora (provisório, times afetados ganham `live: true`)
function applyLiveProvisional(teams, liveMatches) {
  if (!liveMatches || liveMatches.length === 0) return teams;

  const map = {};
  teams.forEach(t => { map[t.team] = { ...t }; });

  liveMatches.forEach(m => {
    const home = map[m.home];
    const away = map[m.away];
    if (!home || !away || m.homeScore == null || m.awayScore == null) return;

    const cards = m.cards || {};
    [[home, m.homeScore, m.awayScore, cards.home], [away, m.awayScore, m.homeScore, cards.away]].forEach(([team, gf, ga, fairPlayDelta]) => {
      team.pj += 1;
      team.gp += gf;
      team.gc += ga;
      team.sg = team.gp - team.gc;
      if (gf > ga) { team.v += 1; team.pts += 3; }
      else if (gf === ga) { team.e += 1; team.pts += 1; }
      else { team.d += 1; }
      team.fairPlay = (team.fairPlay || 0) + (fairPlayDelta || 0);
      team.live = true;
    });
  });

  return Object.values(map);
}

// Aplica o placar provisório de jogos em andamento e ordena cada grupo
// segundo os critérios oficiais de desempate (ver copa/js/standings.js).
// Resultado: { [letra]: [times ordenados] }, usado por toda a página
// (classificação, melhores terceiros e definição de vagas do mata-mata).
function buildSortedGroups(groups, matches) {
  if (!groups) return {};

  const liveMatches = getLiveGroupMatches(matches);
  const sorted = {};

  Object.keys(groups).forEach(letter => {
    const groupMatches = (matches && matches.groupStage || []).filter(m => m.group === letter);
    const groupLive = liveMatches.filter(m => m.group === letter);
    const withLive = applyLiveProvisional(groups[letter], groupLive)
      .map(t => ({ ...t, fifaRanking: fifaRankingIndex[t.team] }));
    sorted[letter] = sortGroupStandings(withLive, groupMatches);
  });

  return sorted;
}

/* ============================================================
   AO VIVO (banner de jogos em andamento)
   ============================================================ */
function renderLiveBanner(matches) {
  const wrap = document.getElementById('liveBanner');
  if (!wrap) return;

  const liveMatches = getLiveGroupMatches(matches);

  if (liveMatches.length === 0) {
    wrap.hidden = true;
    wrap.innerHTML = '';
    return;
  }

  wrap.hidden = false;
  wrap.innerHTML = liveMatches.map(m => `
    <div class="live-banner__item">
      <span class="live-dot" title="Jogo em andamento"></span>
      <span class="live-banner__label">Em andamento</span>
      <span class="live-banner__teams">
        ${teamFlagHTML(m.home)}${m.home} <strong>${m.homeScore} - ${m.awayScore}</strong> ${teamFlagHTML(m.away)}${m.away}
      </span>
      <span class="live-banner__meta">Grupo ${m.group} · ${m.venue}</span>
    </div>
  `).join('');
}

function renderGroups(sortedGroups, matches) {
  const wrap = document.getElementById('groupsGrid');
  if (!sortedGroups || Object.keys(sortedGroups).length === 0) {
    wrap.innerHTML = '<div class="empty-state">Classificação ainda não disponível.</div>';
    return;
  }

  const liveMatches = getLiveGroupMatches(matches);

  wrap.innerHTML = Object.keys(sortedGroups).sort().map(letter => {
    const groupLive = liveMatches.filter(m => m.group === letter);
    const teams = sortedGroups[letter];

    const rows = teams.map((t, i) => {
      const cls = i < 2 ? 'qualified' : (i === 2 ? 'qualified-3rd' : '');
      return `
        <tr class="${cls}">
          <td>${i + 1}</td>
          <td class="team-cell"><span class="team-flag">${flagHTML(t.flag)}</span>${teamNameHTML(t)}${t.live ? '<span class="live-dot" title="Jogo em andamento"></span>' : ''}</td>
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
      <div class="group-card ${groupLive.length ? 'group-card--live' : ''}">
        <div class="group-card__header">
          Grupo ${letter}
          <span>${groupLive.length ? 'Em andamento' : 'Classificação'}</span>
        </div>
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
        ${groupLive.length ? '<div class="group-card__note">Classificação provisória: considera o placar parcial do jogo em andamento.</div>' : ''}
      </div>
    `;
  }).join('');
}

/* ============================================================
   MELHORES TERCEIROS
   ============================================================ */
function getThirdPlacedTeams(sortedGroups) {
  if (!sortedGroups) return [];
  const thirds = Object.keys(sortedGroups).sort().map(letter => ({ ...sortedGroups[letter][2], group: letter }));
  return sortThirdPlaced(thirds);
}

function renderThirdPlaced(sortedGroups) {
  const wrap = document.getElementById('thirdPlacedWrap');
  if (!sortedGroups || Object.keys(sortedGroups).length === 0) {
    wrap.innerHTML = '<div class="empty-state">Classificação ainda não disponível.</div>';
    return;
  }

  const ranked = getThirdPlacedTeams(sortedGroups);

  const rows = ranked.map((t, i) => {
    const cls = i < 8 ? 'qualified' : 'not-qualified';
    return `
      <tr class="${cls}">
        <td>${i + 1}</td>
        <td class="group-cell">${t.group}</td>
        <td class="team-cell"><span class="team-flag">${flagHTML(t.flag)}</span>${teamNameHTML(t)}${t.live ? '<span class="live-dot" title="Jogo em andamento"></span>' : ''}</td>
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

function getGroupSlot(sortedGroups, letter, pos) {
  const teams = sortedGroups && sortedGroups[letter];
  if (!teams || teams.length === 0) return null;
  if (!teams.some(t => t.pj > 0)) return null;
  return teams[pos - 1] || null;
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

// Bandeira (emoji) de cada seleção, indexada pelo nome (data/teams.json)
let teamFlagIndex = {};

function buildTeamFlagIndex(teams) {
  const index = {};
  (teams || []).forEach(t => { index[t.name] = t.flag; });
  return index;
}

// Posição no ranking FIFA de cada seleção, indexada pelo nome (data/teams.json)
let fifaRankingIndex = {};

function buildFifaRankingIndex(teams) {
  const index = {};
  (teams || []).forEach(t => { index[t.name] = t.fifaRanking; });
  return index;
}

// Converte um emoji de bandeira (regional indicators ou tag sequence) para a
// classe CSS correspondente da biblioteca flag-icons, que renderiza a
// bandeira como imagem (necessário pois o Windows/Chrome não exibe os emojis
// de bandeira corretamente).
function flagEmojiToClass(emoji) {
  if (!emoji) return '';
  const codePoints = [...emoji].map(c => c.codePointAt(0));

  // Bandeiras de subdivisão (Inglaterra, Escócia, País de Gales, etc.) usam
  // o emoji "bandeira preta" seguido de uma tag sequence, ex.: 🏴 + gbeng + (cancel tag)
  if (codePoints[0] === 0x1F3F4) {
    const letters = codePoints.slice(1, -1)
      .map(cp => String.fromCharCode(cp - 0xE0000))
      .join('');
    if (letters.length === 5) {
      return `fi-${letters.slice(0, 2)}-${letters.slice(2)}`.toLowerCase();
    }
    return '';
  }

  // Bandeiras de país: dois "regional indicator symbols" (🇦-🇿)
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

// Converte strings no formato "🇲🇽 México" (usadas em data/scorers.json) para
// HTML com a bandeira renderizada via flag-icons.
function countryHTML(country) {
  if (!country) return '';
  const spaceIdx = country.indexOf(' ');
  if (spaceIdx === -1) return country;
  return `${flagHTML(country.slice(0, spaceIdx))} ${country.slice(spaceIdx + 1)}`;
}

// Substitui todos os emojis de bandeira presentes em um texto livre (ex.:
// "🇺🇸 EUA · 🇲🇽 México · 🇨🇦 Canadá") pelas imagens da flag-icons.
const FLAG_EMOJI_RE = /(?:🏴(?:\uDB40[\uDC00-\uDFFF])+)|(?:\uD83C[\uDDE6-\uDDFF]\uD83C[\uDDE6-\uDDFF])/g;

function replaceFlagEmojis(text) {
  if (!text) return text;
  return text.replace(FLAG_EMOJI_RE, m => flagHTML(m));
}

function teamFlagHTML(name) {
  const flag = teamFlagIndex[name];
  return flag ? `<span class="team-flag">${flagHTML(flag)}</span>` : '';
}

// Returns { html, tbd } for a match's home/away side, resolving
// homeSource/awaySource against current standings when the team isn't set yet.
function resolveTeamDisplay(match, side, groups, knockoutFlat) {
  const team = match[side];
  if (team) return { html: `${teamFlagHTML(team)}${team}`, tbd: false };

  const slot = resolveSlot(match[`${side}Source`], groups, knockoutFlat);
  if (!slot) return { html: 'A definir', tbd: true };
  if (slot.resolved) return { html: `${teamFlagHTML(slot.team)}${slot.team} <span class="slot-tag">(${slot.label})</span>`, tbd: false };
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

// Alguns nomes de sede na tabela de jogos não casam exatamente com a cidade
// cadastrada em stadiums.json (ex: "Arlington" é onde fica o AT&T Stadium,
// listado como sede "Dallas").
const VENUE_ALIASES = {
  'East Rutherford': 'eastrutherford',
  'Foxborough': 'foxborough',
  'Arlington': 'dallas'
};

// Monta um índice "nome da sede na tabela de jogos" -> objeto da sede em stadiums.json
function buildVenueIndex(stadiums) {
  const byId = {};
  (stadiums || []).forEach(s => { byId[s.id] = s; });

  const index = {};
  (stadiums || []).forEach(s => { index[s.city] = s; });
  Object.keys(VENUE_ALIASES).forEach(venue => {
    const stadium = byId[VENUE_ALIASES[venue]];
    if (stadium) index[venue] = stadium;
  });
  return index;
}

function matchCardHTML(match, groups, knockoutFlat, venueIndex) {
  const isFinished = match.status === 'finished';
  const isLive = match.status === 'live';

  let scoreHTML;
  if (isFinished || isLive) {
    scoreHTML = `<span class="match-card__score">${match.homeScore} - ${match.awayScore}</span>`;
  } else {
    scoreHTML = `<span class="match-card__score match-card__score--pending">vs</span>`;
  }

  const stadium = venueIndex ? venueIndex[match.venue] : null;

  let statusHTML = '';
  let timesHTML = '';
  if (isFinished) {
    statusHTML = '<span class="match-card__status match-card__status--finished">Encerrado</span>';
  } else if (isLive) {
    statusHTML = '<span class="match-card__status match-card__status--live"><span class="live-dot"></span>Em andamento</span>';
  } else {
    const times = formatMatchTimes(match, stadium);
    if (times) {
      timesHTML = `
        <div class="match-card__times">
          <span class="match-card__time">${times.local}<small>seu horário</small></span>
          ${times.venue && times.venue !== times.local ? `<span class="match-card__time">${times.venue}<small>no local do jogo</small></span>` : ''}
        </div>
      `;
    } else {
      const label = (match.time && match.time !== '—') ? match.time : (match.date ? formatDate(match.date) : 'A definir');
      statusHTML = `<span class="match-card__status">${label}</span>`;
    }
  }

  const venueHTML = match.venue
    ? (stadium
        ? `<button type="button" class="match-card__venue" data-stadium="${stadium.id}">${match.venue}</button>`
        : `<span class="match-card__venue match-card__venue--plain">${match.venue}</span>`)
    : '';

  const home = resolveTeamDisplay(match, 'home', groups, knockoutFlat);
  const away = resolveTeamDisplay(match, 'away', groups, knockoutFlat);

  return `
    <div class="match-card">
      <div class="match-card__meta">${match.group ? `Grupo ${match.group}` : (match.stage || '')}</div>
      <div class="match-card__team match-card__team--home ${home.tbd ? 'bracket-match__team--tbd' : ''}">${home.html}</div>
      ${scoreHTML}
      <div class="match-card__team match-card__team--away ${away.tbd ? 'bracket-match__team--tbd' : ''}">${away.html}</div>
      <div class="match-card__info">
        ${statusHTML}
        ${timesHTML}
        ${venueHTML}
      </div>
    </div>
  `;
}

function renderMatches(matches, groups, stadiums) {
  const tabsWrap = document.getElementById('matchTabs');
  const listWrap = document.getElementById('matchesList');

  if (!matches || (!matches.groupStage && !matches.knockout)) {
    listWrap.innerHTML = '<div class="empty-state">Tabela de jogos ainda não disponível.</div>';
    return;
  }

  const groupStage = matches.groupStage || [];
  const knockout = matches.knockout || {};
  const knockoutFlat = flattenKnockout(knockout);
  const venueIndex = buildVenueIndex(stadiums);

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
      byDate[date].forEach(m => { html += matchCardHTML(m, groups, knockoutFlat, venueIndex); });
    });

    // Knockout
    let koKeysToShow = [];
    if (filter === 'all') koKeysToShow = knockoutKeys;
    else if (filter.startsWith('ko-')) koKeysToShow = [filter.replace('ko-', '')];

    koKeysToShow.forEach(k => {
      html += `<div class="match-day">${KNOCKOUT_LABELS[k]}</div>`;
      (knockout[k] || []).forEach(m => { html += matchCardHTML({ ...m, stage: KNOCKOUT_LABELS[k] }, groups, knockoutFlat, venueIndex); });
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

  // Abre o modal da sede ao clicar no nome do estádio
  listWrap.addEventListener('click', (e) => {
    const btn = e.target.closest('.match-card__venue');
    if (!btn) return;
    const stadium = (stadiums || []).find(s => s.id === btn.dataset.stadium);
    if (stadium) openStadiumModal(stadium);
  });
}

/* ============================================================
   CHAVEAMENTO (BRACKET)
   ============================================================ */
function bracketMatchHTML(match, groups, knockoutFlat, venueIndex) {
  const home = resolveTeamDisplay(match, 'home', groups, knockoutFlat);
  const away = resolveTeamDisplay(match, 'away', groups, knockoutFlat);
  const homeCls = home.tbd ? 'bracket-match__team--tbd' : '';
  const awayCls = away.tbd ? 'bracket-match__team--tbd' : '';
  const homeScore = match.homeScore ?? '';
  const awayScore = match.awayScore ?? '';

  const stadium = match.venue && venueIndex ? venueIndex[match.venue] : null;
  const venueHTML = match.venue
    ? (stadium
        ? `<button type="button" class="match-card__venue" data-stadium="${stadium.id}">${match.venue}</button>`
        : `<span class="match-card__venue match-card__venue--plain">${match.venue}</span>`)
    : '';

  return `
    <div class="bracket-match">
      <div class="bracket-match__id">${match.id}</div>
      <div class="bracket-match__team ${homeCls}"><span>${home.html}</span><span>${homeScore}</span></div>
      <div class="bracket-match__team ${awayCls}"><span>${away.html}</span><span>${awayScore}</span></div>
      ${match.date ? `<div class="bracket-match__date">${formatDate(match.date)}${venueHTML ? ' · ' + venueHTML : ''}</div>` : ''}
    </div>
  `;
}

function pairMatchesHTML(matches, side, renderFn) {
  const pairs = [];
  for (let i = 0; i < matches.length; i += 2) {
    pairs.push(`
      <div class="bracket-pair bracket-pair--${side}">
        ${renderFn(matches[i])}
        ${renderFn(matches[i + 1])}
      </div>
    `);
  }
  return pairs.join('');
}

function renderBracket(matches, groups, stadiums) {
  const wrap = document.getElementById('bracket');
  const knockout = matches && matches.knockout;

  if (!knockout || Object.keys(knockout).length === 0) {
    wrap.innerHTML = '<div class="empty-state">Chaveamento ainda não disponível.</div>';
    return;
  }

  const knockoutFlat = flattenKnockout(knockout);
  const venueIndex = buildVenueIndex(stadiums);
  const columns = getBracketColumns(knockout);

  wrap.innerHTML = columns.map(col => {
    if (col.side === 'center') {
      const [final, third] = col.matches;
      return `
        <div class="bracket__round bracket__round--center">
          <div class="bracket__round-title">${KNOCKOUT_LABELS.final}</div>
          ${bracketMatchHTML(final, groups, knockoutFlat, venueIndex)}
          ${third ? `
            <div class="bracket__round-title bracket__round-title--third">${KNOCKOUT_LABELS.third}</div>
            ${bracketMatchHTML(third, groups, knockoutFlat, venueIndex)}
          ` : ''}
        </div>
      `;
    }
    const matchesHTML = col.matches.length >= 2
      ? pairMatchesHTML(col.matches, col.side, (m) => bracketMatchHTML(m, groups, knockoutFlat, venueIndex))
      : col.matches.map(m => bracketMatchHTML(m, groups, knockoutFlat, venueIndex)).join('');

    return `
      <div class="bracket__round bracket__round--${col.side}">
        <div class="bracket__round-title">${KNOCKOUT_LABELS[col.round]}</div>
        ${matchesHTML}
      </div>
    `;
  }).join('');

  if (!wrap.dataset.modalBound) {
    wrap.dataset.modalBound = '1';
    wrap.addEventListener('click', (e) => {
      const btn = e.target.closest('.match-card__venue');
      if (!btn) return;
      const stadium = (currentStadiums || []).find(s => s.id === btn.dataset.stadium);
      if (stadium) openStadiumModal(stadium);
    });
  }
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
        <td>${countryHTML(s.country)}</td>
        <td class="num">${s.matches ?? ''}</td>
        <td class="num">${s.goals}</td>
      </tr>
    `).join('');

  wrap.innerHTML = `
    <table class="scorers-table">
      <thead>
        <tr><th>#</th><th>Jogador</th><th>Seleção</th><th>Jogos</th><th>Gols</th></tr>
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

  const sorted = [...teams].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

  wrap.innerHTML = sorted.map(t => `
    <button type="button" class="flag-bar__flag" data-team="${t.name}" title="${t.name}" aria-label="${t.name}">
      ${flagHTML(t.flag)}
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
  <svg class="stadium-card__icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 48" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <ellipse cx="32" cy="24" rx="30" ry="22" />
    <ellipse cx="32" cy="24" rx="13" ry="9" />
    <path d="M32 2v44" />
  </svg>
`;

// Card de uma sede, reaproveitado na grade de estádios, no popup do mapa e no modal de jogos
function stadiumCardHTML(s, { withId = true } = {}) {
  return `
    <div class="stadium-card" ${withId ? `id="stadium-${s.id}"` : ''} data-stadium="${s.id}">
      <div class="stadium-card__media">
        ${STADIUM_ICON}
        ${s.image ? `<img src="${s.image}" alt="${s.name}" loading="lazy" onerror="this.remove()" />` : ''}
      </div>
      <div class="stadium-card__body">
        <p class="stadium-card__name">${s.name}</p>
        <p class="stadium-card__city">${flagHTML(s.flag)} ${s.city}, ${s.country}</p>
        <p class="stadium-card__capacity">Capacidade: ${s.capacity}</p>
        ${s.credit ? `<a class="stadium-card__credit" href="${s.credit}" target="_blank" rel="noopener noreferrer">Foto: Wikimedia Commons</a>` : ''}
      </div>
    </div>
  `;
}

let stadiumMap = null;
const stadiumMapMarkers = {};

function renderStadiums(stadiums) {
  const grid = document.getElementById('stadiumGrid');
  const mapEl = document.getElementById('stadiumMap');

  if (!stadiums || stadiums.length === 0) {
    grid.innerHTML = '<div class="empty-state">Lista de estádios ainda não disponível.</div>';
    return;
  }

  grid.innerHTML = stadiums.map(s => stadiumCardHTML(s)).join('');

  const rootStyle = getComputedStyle(document.documentElement);
  const dotColor = rootStyle.getPropertyValue('--gold-500').trim() || '#d4af00';
  const activeDotColor = rootStyle.getPropertyValue('--gold-400').trim() || '#ffdf00';
  const strokeColor = rootStyle.getPropertyValue('--navy-900').trim() || '#04210f';

  function highlightStadium(id) {
    document.querySelectorAll('.stadium-card').forEach(c => c.classList.toggle('stadium-card--highlight', c.dataset.stadium === id));
    Object.keys(stadiumMapMarkers).forEach(key => {
      stadiumMapMarkers[key].setStyle({ fillColor: key === id ? activeDotColor : dotColor });
    });
    const marker = stadiumMapMarkers[id];
    if (marker) marker.openPopup();
  }

  grid.querySelectorAll('.stadium-card').forEach(card => {
    card.addEventListener('click', () => highlightStadium(card.dataset.stadium));
  });

  if (typeof L === 'undefined' || !mapEl) return;

  if (!stadiumMap) {
    stadiumMap = L.map(mapEl, { scrollWheelZoom: false });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
      maxZoom: 18
    }).addTo(stadiumMap);
  } else {
    Object.values(stadiumMapMarkers).forEach(m => stadiumMap.removeLayer(m));
  }
  Object.keys(stadiumMapMarkers).forEach(k => delete stadiumMapMarkers[k]);

  stadiums.forEach(s => {
    if (s.lat == null || s.lon == null) return;
    const marker = L.circleMarker([s.lat, s.lon], {
      radius: 8,
      color: strokeColor,
      weight: 1.5,
      fillColor: dotColor,
      fillOpacity: 1
    }).addTo(stadiumMap);

    marker.bindTooltip(s.city, { permanent: true, direction: 'top', offset: [0, -6], className: 'stadium-tooltip' });
    marker.bindPopup(stadiumCardHTML(s, { withId: false }), { maxWidth: 240, className: 'stadium-popup' });
    marker.on('click', () => highlightStadium(s.id));

    stadiumMapMarkers[s.id] = marker;
  });

  const bounds = L.latLngBounds(stadiums.filter(s => s.lat != null).map(s => [s.lat, s.lon]));
  stadiumMap.invalidateSize();
  if (bounds.isValid()) stadiumMap.fitBounds(bounds, { padding: [24, 24] });
}

/* ============================================================
   MODAL DE SEDES (aberto ao clicar no nome de uma sede na lista de jogos)
   ============================================================ */
function openStadiumModal(stadium) {
  const modal = document.getElementById('stadiumModal');
  const body = document.getElementById('modalStadiumBody');
  if (!modal || !body) return;
  body.innerHTML = stadiumCardHTML(stadium, { withId: false });
  modal.hidden = false;
  document.body.classList.add('modal-open');
}

function closeStadiumModal() {
  const modal = document.getElementById('stadiumModal');
  if (modal) modal.hidden = true;
  document.body.classList.remove('modal-open');
}

function setupStadiumModal() {
  document.querySelectorAll('[data-modal-close]').forEach(el => {
    el.addEventListener('click', closeStadiumModal);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeStadiumModal();
  });
}

/* ============================================================
   ÚLTIMOS / PRÓXIMOS JOGOS (cards ao lado de "Datas-chave")
   ============================================================ */
const RECENT_ICON = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'><path d='M3 12a9 9 0 1 0 2.6-6.4L3 8'/><path d='M3 3v5h5'/><path d='M12 7v5l3 3'/></svg>`;
const UPCOMING_ICON = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'><rect x='3' y='4' width='18' height='18' rx='2'/><path d='M16 2v4'/><path d='M8 2v4'/><path d='M3 10h18'/><path d='M9 16l3-3 3 3'/><path d='M12 13v6'/></svg>`;

function getAllMatches(matches) {
  const all = [...(matches.groupStage || [])];
  Object.values(matches.knockout || {}).forEach(list => all.push(...(list || [])));
  return all;
}

function miniMatchHTML(m, groups, knockoutFlat) {
  const home = resolveTeamDisplay(m, 'home', groups, knockoutFlat);
  const away = resolveTeamDisplay(m, 'away', groups, knockoutFlat);
  const isFinished = m.status === 'finished';
  const isLive = m.status === 'live';
  const score = (isFinished || isLive) ? `${m.homeScore} - ${m.awayScore}` : 'vs';
  return `
    <div class="mini-match">
      <div class="mini-match__teams">
        <span class="mini-match__team">${home.html}</span>
        <span class="mini-match__score">${score}</span>
        <span class="mini-match__team">${away.html}</span>
      </div>
      <div class="mini-match__meta">${formatDate(m.date)}${m.venue ? ' · ' + m.venue : ''}</div>
    </div>
  `;
}

function renderRecentUpcoming(matches, groups) {
  const grid = document.getElementById('formatGrid');
  if (!grid || !matches) return;

  const all = getAllMatches(matches);
  const knockoutFlat = flattenKnockout(matches.knockout);

  const recent = all
    .filter(m => m.status === 'finished')
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.id - a.id))
    .slice(0, 3);

  const upcoming = all
    .filter(m => m.status !== 'finished')
    .sort((a, b) => (a.date > b.date ? 1 : a.date < b.date ? -1 : a.id - b.id))
    .slice(0, 3);

  const cardHTML = (title, icon, list) => `
    <div class="format-card format-card--dynamic">
      <div class="format-card__icon">${icon}</div>
      <h3 class="format-card__title">${title}</h3>
      <div class="mini-matches">
        ${list.length ? list.map(m => miniMatchHTML(m, groups, knockoutFlat)).join('') : '<p class="format-card__desc">Nenhum jogo encontrado.</p>'}
      </div>
    </div>
  `;

  grid.querySelectorAll('.format-card--dynamic').forEach(el => el.remove());
  grid.insertAdjacentHTML('beforeend', cardHTML('Últimos resultados', RECENT_ICON, recent) + cardHTML('Próximos jogos', UPCOMING_ICON, upcoming));
}

/* ============================================================
   ATUALIZAÇÃO DOS DADOS
   ============================================================ */
let currentGroups = null;
let currentMatches = null;
let currentStadiums = null;
let currentTeams = null;
let currentAliases = null;

// Tenta buscar o placar ao vivo direto da ESPN (mesma lógica do script de
// atualização automática, ver copa/js/espn.js). Se a chamada falhar (CORS,
// endpoint fora do ar, etc.), recarrega os arquivos estáticos data/*.json
// (atualizados pelo workflow agendado a cada 30 min) como alternativa.
async function fetchUpdatedData(ts) {
  if (currentMatches && currentTeams && currentAliases) {
    try {
      const { matches, groups, scorers } = await fetchLiveUpdate(currentMatches, currentTeams, currentAliases);
      const hasScorersData = (matches.groupStage || []).some(m => Array.isArray(m.scorers));
      return { matches, groups, scorers: hasScorersData ? scorers : await loadJSON(`data/scorers.json?t=${ts}`) };
    } catch (err) {
      console.warn('Falha ao buscar dados da ESPN, usando arquivos estáticos:', err.message);
    }
  }

  const [groups, matches, scorers] = await Promise.all([
    loadJSON(`data/groups.json?t=${ts}`),
    loadJSON(`data/matches.json?t=${ts}`),
    loadJSON(`data/scorers.json?t=${ts}`)
  ]);
  return { matches, groups, scorers };
}

async function refreshData() {
  const btn = document.getElementById('refreshNow');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Atualizando...';
  }

  const ts = Date.now();
  const [{ groups, matches, scorers }, stadiums] = await Promise.all([
    fetchUpdatedData(ts),
    loadJSON(`data/stadiums.json?t=${ts}`)
  ]);

  if (groups) currentGroups = groups;
  if (matches) currentMatches = matches;
  if (stadiums) currentStadiums = stadiums;

  const sortedGroups = buildSortedGroups(currentGroups, currentMatches);

  renderGroups(sortedGroups, currentMatches);
  renderThirdPlaced(sortedGroups);
  renderMatches(currentMatches, sortedGroups, currentStadiums);
  renderBracket(currentMatches, sortedGroups, currentStadiums);
  renderRecentUpcoming(currentMatches, sortedGroups);
  renderLiveBanner(currentMatches);
  renderScorers(scorers);
  renderStadiums(currentStadiums);
  renderLastUpdated();

  if (btn) {
    btn.disabled = false;
    btn.textContent = 'Atualizar agora';
  }
}

/* ============================================================
   INIT
   ============================================================ */
(async function init() {
  const [info, groups, matches, scorers, teams, stadiums, aliases] = await Promise.all([
    loadJSON('data/info.json'),
    loadJSON('data/groups.json'),
    loadJSON('data/matches.json'),
    loadJSON('data/scorers.json'),
    loadJSON('data/teams.json'),
    loadJSON('data/stadiums.json'),
    loadJSON('data/team-name-aliases.json')
  ]);

  currentGroups = groups;
  currentMatches = matches;
  currentStadiums = stadiums;
  currentTeams = teams;
  currentAliases = aliases || {};
  teamFlagIndex = buildTeamFlagIndex(teams);
  fifaRankingIndex = buildFifaRankingIndex(teams);

  const sortedGroups = buildSortedGroups(groups, matches);

  renderInfo(info);
  renderGroups(sortedGroups, matches);
  renderThirdPlaced(sortedGroups);
  renderLiveBanner(matches);
  renderMatches(matches, sortedGroups, stadiums);
  renderBracket(matches, sortedGroups, stadiums);
  renderRecentUpcoming(matches, sortedGroups);
  renderScorers(scorers);
  renderFlagBar(teams);
  renderStadiums(stadiums);
  setupStadiumModal();

  const refreshBtn = document.getElementById('refreshNow');
  if (refreshBtn) refreshBtn.addEventListener('click', refreshData);
})();
