import {
  WEEKDAYS_ID,
  MONTHS_ID,
  addDays,
  dateKey,
  daysInMonth,
  formatDateIndonesian,
  houseNumberFor,
  loadMonth,
  parseIndonesianDate,
  peopleIndex,
  weekDates,
  witaDate,
} from './schedule.mjs';

// --- State -------------------------------------------------------------------

let view = 'hari';
let today = witaDate();
let weekAnchor = today;
let monthYear = { y: today.y, m: today.m };
let selectedDay = today;
let loadToken = 0; // bumped on every navigation; stale fetch results are discarded
const cache = new Map(); // 'y-m' -> validated schedule (only successful loads cached)

let people = new Map();
const peopleReady = fetch('assets/people.json')
  .then((res) => (res.ok ? res.json() : []))
  .then((entries) => { people = peopleIndex(entries); })
  .catch(() => { /* without the roster every house number shows the fallback text */ });

// --- Tiny DOM helpers (all data goes through textContent, never innerHTML) ----

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const $ = (id) => document.getElementById(id);

const centerContent = $('center-content');
const detailContent = $('detail-content');
const dialog = $('person-dialog');
const dialogTitle = $('person-dialog-title');
const dialogHouse = $('person-dialog-house');

// --- Live WITA Clock (Asia/Makassar, UTC+8) -----------------------------------

function formatWitaClock() {
  const shifted = new Date(Date.now() + 8 * 3600e3);
  const hh = String(shifted.getUTCHours()).padStart(2, '0');
  const mm = String(shifted.getUTCMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

function updateClock() {
  const clockEl = $('clock-wita');
  if (clockEl) {
    clockEl.textContent = formatWitaClock();
  }
}

// --- Loading / Missing / Error States -----------------------------------------

function showLoading() {
  centerContent.replaceChildren(el('p', 'state', 'Memuat jadwal…'));
  detailContent.replaceChildren(el('p', 'state', 'Memuat jadwal…'));
}

function showState(status, retry) {
  if (status === 'missing') {
    centerContent.replaceChildren(el('p', 'state', 'Jadwal belum tersedia.'));
    detailContent.replaceChildren(el('p', 'state', 'Jadwal belum tersedia.'));
    return;
  }
  const box = el('p', 'state state-error', 'Terjadi kesalahan saat memuat jadwal.');
  const retryButton = el('button', 'retry-button', 'Coba lagi');
  retryButton.type = 'button';
  retryButton.addEventListener('click', retry);
  const wrap = el('div', 'state-wrap');
  wrap.append(box, retryButton);
  centerContent.replaceChildren(wrap);
  detailContent.replaceChildren(el('p', 'state', 'Terjadi kesalahan saat memuat jadwal.'));
}

// Fetches every needed month once; missing months are retried on the next
// navigation (never cached as missing). Resolves [{status, schedule?, y, m}].
function loadMonths(monthKeys, token) {
  return Promise.all(
    monthKeys.map(async ({ y, m }) => {
      const key = `${y}-${m}`;
      if (cache.has(key)) return { status: 'ok', schedule: cache.get(key), y, m };
      const res = await loadMonth((file) => fetch(`assets/schedules/${file}`), y, m);
      if (token === loadToken && res.status === 'ok') cache.set(key, res.schedule);
      return { ...res, y, m };
    })
  );
}

function indexByDate(schedules) {
  const byDate = new Map();
  for (const schedule of schedules) {
    for (const entry of schedule) {
      const parsed = parseIndonesianDate(entry.date);
      if (!parsed) continue;
      const key = dateKey(parsed);
      if (!byDate.has(key)) byDate.set(key, []);
      byDate.get(key).push(entry);
    }
  }
  return byDate;
}

// --- Right Day-Detail Panel Rendering -----------------------------------------

function renderDayDetail(day, entries) {
  const wrap = el('div', 'day-detail');

  // Heading with selected day in full Indonesian
  const header = el('div', 'detail-header');
  const title = el('h3', 'detail-day-heading', formatDateIndonesian(day));
  header.append(title);

  if (entries && entries.length > 0) {
    for (const entry of entries) {
      if (entry.name) {
        header.append(el('div', 'detail-group-badge', entry.name));
      }
    }
  }
  wrap.append(header);

  // Legend chip row: light gray rounded box, green dot, text "petugas jaga malam ini"
  const legend = el('div', 'legend-chip');
  const dot = el('span', 'legend-dot');
  dot.setAttribute('aria-hidden', 'true');
  legend.append(dot, el('span', null, 'petugas jaga malam ini'));
  wrap.append(legend);

  if (!entries || entries.length === 0) {
    wrap.append(el('p', 'empty-note', 'Tidak ada jadwal untuk hari ini.'));
    detailContent.replaceChildren(wrap);
    return;
  }

  const cardsContainer = el('div', 'slot-cards');

  for (const entry of entries) {
    // Leader card
    if (entry.leader !== null) {
      const leaderBtn = el('button', 'slot-card slot-card-leader');
      leaderBtn.type = 'button';
      leaderBtn.setAttribute('aria-label', `${entry.leader}, Ketua, klik untuk nomor rumah`);
      const nameSpan = el('span', 'slot-name', entry.leader);
      const badgeSpan = el('span', 'slot-badge', 'Ketua');
      leaderBtn.append(nameSpan, badgeSpan);
      leaderBtn.addEventListener('click', () => openPerson(entry.leader, leaderBtn));
      cardsContainer.append(leaderBtn);
    } else {
      const emptyLeader = el('div', 'slot-card slot-card-leader slot-card-empty');
      emptyLeader.setAttribute('aria-label', 'Ketua belum ditetapkan');
      emptyLeader.append(el('span', 'slot-name slot-empty-text', 'Ketua belum ditetapkan'));
      cardsContainer.append(emptyLeader);
    }

    // Member cards
    for (const member of entry.members) {
      const memberBtn = el('button', 'slot-card slot-card-member');
      memberBtn.type = 'button';
      memberBtn.setAttribute('aria-label', `${member}, Anggota, klik untuk nomor rumah`);
      memberBtn.append(el('span', 'slot-name', member));
      memberBtn.addEventListener('click', () => openPerson(member, memberBtn));
      cardsContainer.append(memberBtn);
    }
  }

  wrap.append(cardsContainer);
  detailContent.replaceChildren(wrap);
}

// --- Person Dialog -----------------------------------------------------------

let lastFocus = null;

async function openPerson(name, invoker) {
  lastFocus = invoker;
  await peopleReady;
  dialogTitle.textContent = name;
  dialogHouse.textContent = `Nomor rumah: ${houseNumberFor(people, name)}`;
  dialog.showModal();
}

dialog.addEventListener('close', () => {
  if (lastFocus) lastFocus.focus();
  lastFocus = null;
});
$('person-close').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', (event) => {
  if (event.target === dialog) dialog.close(); // click on the backdrop
});

// --- Center Calendar Grid Rendering ------------------------------------------

function renderCalendarGrid(byDate, onSelectDay) {
  const container = el('div', 'calendar-container');

  // Weekday header row: SEN SEL RAB KAM JUM SAB MIN
  const weekdaysRow = el('div', 'calendar-weekdays');
  weekdaysRow.setAttribute('aria-hidden', 'true');
  for (const name of WEEKDAYS_ID) {
    weekdaysRow.append(el('span', null, name.slice(0, 3).toUpperCase()));
  }
  container.append(weekdaysRow);

  // Day chips grid
  const grid = el('div', 'calendar-grid');
  const firstOffset = (Date.UTC(monthYear.y, monthYear.m - 1, 1) / 86400e3 + 3) % 7; // Monday-start

  for (let i = 0; i < firstOffset; i += 1) {
    const spacer = el('div', 'day-chip-spacer');
    spacer.setAttribute('aria-hidden', 'true');
    grid.append(spacer);
  }

  const totalDays = daysInMonth(monthYear.y, monthYear.m);
  for (let d = 1; d <= totalDays; d += 1) {
    const day = { y: monthYear.y, m: monthYear.m, d };
    const entries = byDate.get(dateKey(day)) ?? [];
    const hasData = entries.length > 0;
    const isTodayDay = dateKey(day) === dateKey(today);
    const isSelectedDay = selectedDay && dateKey(day) === dateKey(selectedDay);

    const chip = el('button', 'day-chip');
    chip.type = 'button';
    chip.dataset.date = dateKey(day);
    if (hasData) chip.classList.add('has-schedule');
    if (isTodayDay) chip.classList.add('is-today');
    if (isSelectedDay) chip.classList.add('is-selected');

    const numSpan = el('span', 'chip-num', String(d));
    chip.append(numSpan);

    if (isTodayDay) {
      const dot = el('span', 'today-dot');
      dot.setAttribute('aria-hidden', 'true');
      chip.append(dot);
    }

    chip.setAttribute(
      'aria-label',
      `${formatDateIndonesian(day)}${hasData ? `, ${entries.length} kelompok` : ', tidak ada jadwal'}`
    );

    if (hasData) {
      chip.addEventListener('click', () => {
        selectedDay = day;
        for (const other of grid.querySelectorAll('.day-chip')) {
          other.classList.remove('is-selected');
        }
        chip.classList.add('is-selected');
        onSelectDay(day);
      });
    } else {
      chip.disabled = true;
    }

    grid.append(chip);
  }

  container.append(grid);
  return container;
}

// --- Center Week Strip Rendering (Mingguan View) -------------------------------

function renderWeekStrip(days, byDate, onSelectDay) {
  const strip = el('div', 'week-strip');
  strip.setAttribute('role', 'tablist');
  strip.setAttribute('aria-label', 'Daftar hari minggu ini');

  for (const day of days) {
    const entries = byDate.get(dateKey(day)) ?? [];
    const hasData = entries.length > 0;
    const isTodayDay = dateKey(day) === dateKey(today);
    const isSelectedDay = selectedDay && dateKey(day) === dateKey(selectedDay);

    const card = el('button', 'week-day-card');
    card.type = 'button';
    card.dataset.date = dateKey(day);
    if (isSelectedDay) card.classList.add('is-selected');
    if (isTodayDay) card.classList.add('is-today');

    const dayOfWeekIndex = (Date.UTC(day.y, day.m - 1, day.d) / 86400e3 + 3) % 7;
    const dayName = WEEKDAYS_ID[dayOfWeekIndex].slice(0, 3).toUpperCase();

    const nameEl = el('span', 'week-day-name', dayName);
    const circleEl = el('span', 'week-date-circle', String(day.d));
    const groupName = hasData ? entries[0].name : '–';
    const groupEl = el('span', 'week-group-name', groupName);

    card.append(nameEl, circleEl);
    if (isTodayDay) {
      const dot = el('span', 'today-dot');
      dot.setAttribute('aria-hidden', 'true');
      card.append(dot);
    }
    card.append(groupEl);

    card.setAttribute(
      'aria-label',
      `${formatDateIndonesian(day)}${hasData ? `, ${groupName}` : ', tidak ada jadwal'}`
    );

    card.addEventListener('click', () => {
      selectedDay = day;
      for (const other of strip.querySelectorAll('.week-day-card')) {
        other.classList.remove('is-selected');
      }
      card.classList.add('is-selected');
      onSelectDay(day);
    });

    strip.append(card);
  }

  return strip;
}

// --- Views -------------------------------------------------------------------

function monthTitle() {
  return `${MONTHS_ID[monthYear.m - 1]} ${monthYear.y}`;
}

function shortDate(k) {
  return `${k.d} ${MONTHS_ID[k.m - 1].slice(0, 3)} ${k.y}`;
}

function monthKeysOf(days) {
  const seen = new Map();
  for (const day of days) seen.set(`${day.y}-${day.m}`, { y: day.y, m: day.m });
  return [...seen.values()];
}

// One calendar view serves "Hari ini": it opens on today, and the month
// controls browse other months without leaving the view.
async function showCalendar(resetToToday = false) {
  const token = ++loadToken;
  showLoading();
  if (resetToToday) {
    selectedDay = today;
    monthYear = { y: today.y, m: today.m };
  }
  syncMonthControls();

  const results = await loadMonths([monthYear], token);
  if (token !== loadToken) return;
  const res = results[0];
  if (res.status === 'missing') return showState('missing');
  if (res.status !== 'ok') return showState('error', () => showCalendar(resetToToday));

  const byDate = indexByDate([res.schedule]);

  // Keep the selected day inside the shown month; fall back to today or the 1st
  if (!selectedDay || selectedDay.y !== monthYear.y || selectedDay.m !== monthYear.m) {
    selectedDay = (today.y === monthYear.y && today.m === monthYear.m)
      ? today
      : { y: monthYear.y, m: monthYear.m, d: 1 };
  }

  const grid = renderCalendarGrid(byDate, (day) => {
    renderDayDetail(day, byDate.get(dateKey(day)));
  });
  centerContent.replaceChildren(grid);
  renderDayDetail(selectedDay, byDate.get(dateKey(selectedDay)));
}

async function showWeek() {
  const token = ++loadToken;
  showLoading();
  const days = weekDates(weekAnchor);
  $('week-label').textContent = `${shortDate(days[0])} – ${shortDate(days[6])}`;

  const results = await loadMonths(monthKeysOf(days), token);
  if (token !== loadToken) return;
  if (results.some((r) => r.status === 'error')) return showState('error', showWeek);
  if (results.every((r) => r.status === 'missing')) return showState('missing');

  const byDate = indexByDate(results.filter((r) => r.status === 'ok').map((r) => r.schedule));

  // If selectedDay is outside this week, default to today if in week, else first day
  if (!selectedDay || !days.some((d) => dateKey(d) === dateKey(selectedDay))) {
    if (days.some((d) => dateKey(d) === dateKey(today))) {
      selectedDay = today;
    } else {
      selectedDay = days[0];
    }
  }

  const strip = renderWeekStrip(days, byDate, (day) => {
    renderDayDetail(day, byDate.get(dateKey(day)));
  });
  centerContent.replaceChildren(strip);
  renderDayDetail(selectedDay, byDate.get(dateKey(selectedDay)));
}

// --- Navigation wiring -------------------------------------------------------

const RENDER = { hari: () => showCalendar(true), minggu: showWeek };

function setView(next, updateHash = true) {
  view = next;
  if (updateHash && location.hash.slice(1) !== next) {
    location.hash = next;
  }
  for (const button of document.querySelectorAll('.views button')) {
    button.setAttribute('aria-pressed', String(button.dataset.view === view));
  }
  $('week-controls').hidden = view !== 'minggu';
  $('month-controls').hidden = view === 'minggu';
  RENDER[view]();
}

for (const button of document.querySelectorAll('.views button')) {
  button.addEventListener('click', () => setView(button.dataset.view));
}

$('week-prev').addEventListener('click', () => {
  weekAnchor = addDays(weekAnchor, -7);
  selectedDay = null;
  showWeek();
});
$('week-next').addEventListener('click', () => {
  weekAnchor = addDays(weekAnchor, 7);
  selectedDay = null;
  showWeek();
});

const monthSelect = $('month-select');
for (const [i, name] of MONTHS_ID.entries()) {
  const option = el('option', null, name);
  option.value = String(i + 1);
  monthSelect.append(option);
}
monthSelect.addEventListener('change', () => {
  monthYear = { y: monthYear.y, m: Number(monthSelect.value) };
  selectedDay = null;
  showCalendar(false);
});
$('year-input').addEventListener('change', () => {
  const y = Number($('year-input').value);
  if (!Number.isInteger(y) || y < 2020 || y > 2100) return;
  monthYear = { y, m: monthYear.m };
  selectedDay = null;
  showCalendar(false);
});

function shiftMonth(delta) {
  const m = monthYear.m + delta;
  monthYear = m < 1 ? { y: monthYear.y - 1, m: 12 } : m > 12 ? { y: monthYear.y + 1, m: 1 } : { y: monthYear.y, m };
  selectedDay = null;
  syncMonthControls();
  showCalendar(false);
}
$('month-prev').addEventListener('click', () => shiftMonth(-1));
$('month-next').addEventListener('click', () => shiftMonth(1));

function syncMonthControls() {
  monthSelect.value = String(monthYear.m);
  $('year-input').value = String(monthYear.y);
  $('month-title').textContent = monthTitle();
}

window.addEventListener('hashchange', () => {
  const h = location.hash.slice(1);
  if (RENDER[h] && h !== view) {
    setView(h, false);
  }
});

// --- Today follows WITA midnight, not the device clock -----------------------

function tickToday() {
  const now = witaDate();
  updateClock();
  if (dateKey(now) !== dateKey(today)) {
    today = now;
    if (view === 'hari') {
      selectedDay = today;
      monthYear = { y: today.y, m: today.m };
      weekAnchor = today;
    }
    RENDER[view](); // re-render so "Hari ini" highlights and content follow the new day
  }
}

updateClock();
setInterval(updateClock, 10e3);
setInterval(tickToday, 30e3);
window.addEventListener('focus', tickToday);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) tickToday();
});

// --- Boot --------------------------------------------------------------------

syncMonthControls();
const initialView = location.hash.slice(1); // deep link, e.g. #minggu
setView(RENDER[initialView] ? initialView : 'hari', false);

