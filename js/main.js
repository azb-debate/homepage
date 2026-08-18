(() => {
  'use strict';

  /** ===== ユーティリティ / Utilities ===== */
  const qs = (s, el = document) => el.querySelector(s);
  const qsa = (s, el = document) => Array.from(el.querySelectorAll(s));
  const byId = id => document.getElementById(id);
  const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
  const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;

  /** ===== 活動日程の計算 / Activity schedule calculation ===== */
  const WEEKDAY_LABELS = Object.freeze(['日', '月', '火', '水', '木', '金', '土']);
  const DEFAULT_SCHEDULE = Object.freeze({
    regularWeekdays: Object.freeze([2, 4, 5]),
    startTime: '15:00',
    endTime: '18:00',
    timeZone: 'Asia/Tokyo',
    excludedDates: Object.freeze([]),
    specialDates: Object.freeze([]),
    activePeriods: Object.freeze([]),
    lookaheadDays: 370
  });
  const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
  const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;
  const formatterCache = new Map();

  const pad2 = value => String(value).padStart(2, '0');

  function dateKeyFromUTC(date) {
    return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
  }

  function isValidDateKey(value) {
    if (typeof value !== 'string') return false;
    const match = DATE_PATTERN.exec(value);
    if (!match) return false;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    return dateKeyFromUTC(date) === value;
  }

  function addDays(dateKey, amount) {
    if (!isValidDateKey(dateKey) || !Number.isInteger(amount)) return '';
    const [year, month, day] = dateKey.split('-').map(Number);
    return dateKeyFromUTC(new Date(Date.UTC(year, month - 1, day + amount)));
  }

  function weekdayForDate(dateKey) {
    if (!isValidDateKey(dateKey)) return -1;
    const [year, month, day] = dateKey.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  }

  function timeToSeconds(value) {
    if (typeof value !== 'string') return null;
    const match = TIME_PATTERN.exec(value);
    if (!match) return null;
    return Number(match[1]) * 3600 + Number(match[2]) * 60;
  }

  function isValidTimeZone(timeZone) {
    try {
      new Intl.DateTimeFormat('en', { timeZone }).format(new Date(0));
      return true;
    } catch {
      return false;
    }
  }

  function getZonedFormatter(timeZone) {
    if (!formatterCache.has(timeZone)) {
      formatterCache.set(timeZone, new Intl.DateTimeFormat('en-CA-u-ca-gregory-nu-latn', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23'
      }));
    }
    return formatterCache.get(timeZone);
  }

  function getZonedParts(now = new Date(), timeZone = DEFAULT_SCHEDULE.timeZone) {
    const instant = now instanceof Date ? new Date(now.getTime()) : new Date(now);
    if (Number.isNaN(instant.getTime())) return null;
    const safeTimeZone = isValidTimeZone(timeZone) ? timeZone : DEFAULT_SCHEDULE.timeZone;
    const values = {};
    getZonedFormatter(safeTimeZone).formatToParts(instant).forEach(part => {
      if (part.type !== 'literal') values[part.type] = Number(part.value);
    });
    const dateKey = `${values.year}-${pad2(values.month)}-${pad2(values.day)}`;
    return Object.freeze({
      year: values.year,
      month: values.month,
      day: values.day,
      hour: values.hour,
      minute: values.minute,
      second: values.second,
      dateKey,
      weekday: weekdayForDate(dateKey),
      secondsSinceMidnight: values.hour * 3600 + values.minute * 60 + values.second,
      timeZone: safeTimeZone
    });
  }

  function normalizeSchedule(rawSchedule = {}) {
    const raw = isObject(rawSchedule) ? rawSchedule : {};
    const issues = [];

    const requestedWeekdays = Array.isArray(raw.regularWeekdays) ? raw.regularWeekdays : DEFAULT_SCHEDULE.regularWeekdays;
    const regularWeekdays = Array.from(new Set(requestedWeekdays.filter(day => Number.isInteger(day) && day >= 0 && day <= 6))).sort();
    if (!regularWeekdays.length) {
      regularWeekdays.push(...DEFAULT_SCHEDULE.regularWeekdays);
      if (hasOwn(raw, 'regularWeekdays')) issues.push('regularWeekdays が不正なため通常値を使用しました');
    }

    let startTime = typeof raw.startTime === 'string' && timeToSeconds(raw.startTime) !== null
      ? raw.startTime
      : DEFAULT_SCHEDULE.startTime;
    let endTime = typeof raw.endTime === 'string' && timeToSeconds(raw.endTime) !== null
      ? raw.endTime
      : DEFAULT_SCHEDULE.endTime;
    if (hasOwn(raw, 'startTime') && startTime !== raw.startTime) issues.push('startTime が不正なため通常値を使用しました');
    if (hasOwn(raw, 'endTime') && endTime !== raw.endTime) issues.push('endTime が不正なため通常値を使用しました');
    if (timeToSeconds(endTime) <= timeToSeconds(startTime)) {
      startTime = DEFAULT_SCHEDULE.startTime;
      endTime = DEFAULT_SCHEDULE.endTime;
      issues.push('活動の終了時刻が開始時刻以前のため通常時刻を使用しました');
    }

    const requestedTimeZone = typeof raw.timeZone === 'string' && raw.timeZone.trim()
      ? raw.timeZone.trim()
      : DEFAULT_SCHEDULE.timeZone;
    const timeZone = isValidTimeZone(requestedTimeZone) ? requestedTimeZone : DEFAULT_SCHEDULE.timeZone;
    if (timeZone !== requestedTimeZone) issues.push('timeZone が不正なため Asia/Tokyo を使用しました');

    const excludedSet = new Set();
    if (Array.isArray(raw.excludedDates)) {
      raw.excludedDates.forEach(item => {
        const date = typeof item === 'string' ? item : (isObject(item) ? item.date : '');
        if (isValidDateKey(date)) excludedSet.add(date);
        else issues.push('不正な excludedDates の項目を無視しました');
      });
    } else if (hasOwn(raw, 'excludedDates')) {
      issues.push('excludedDates が配列ではないため無視しました');
    }
    const excludedDates = Array.from(excludedSet).sort();

    const specialMap = new Map();
    if (Array.isArray(raw.specialDates)) {
      raw.specialDates.forEach(item => {
        if (!isObject(item) || !isValidDateKey(item.date)) {
          issues.push('不正な specialDates の項目を無視しました');
          return;
        }
        const specialStart = hasOwn(item, 'startTime') ? item.startTime : startTime;
        const specialEnd = hasOwn(item, 'endTime') ? item.endTime : endTime;
        if (timeToSeconds(specialStart) === null || timeToSeconds(specialEnd) === null || timeToSeconds(specialEnd) <= timeToSeconds(specialStart)) {
          issues.push(`${item.date} の臨時活動時刻が不正なため無視しました`);
          return;
        }
        if (specialMap.has(item.date)) issues.push(`${item.date} の臨時活動が重複しているため後の設定を使用しました`);
        specialMap.set(item.date, Object.freeze({
          date: item.date,
          startTime: specialStart,
          endTime: specialEnd,
          room: typeof item.room === 'string' ? item.room.trim() : '',
          note: typeof item.note === 'string' ? item.note.trim() : ''
        }));
      });
    } else if (hasOwn(raw, 'specialDates')) {
      issues.push('specialDates が配列ではないため無視しました');
    }
    const specialDates = Array.from(specialMap.values()).sort((a, b) => a.date.localeCompare(b.date));

    const activePeriods = [];
    if (Array.isArray(raw.activePeriods)) {
      raw.activePeriods.forEach(period => {
        if (!isObject(period) || !isValidDateKey(period.start) || !isValidDateKey(period.end) || period.start > period.end) {
          issues.push('不正な activePeriods の項目を無視しました');
          return;
        }
        activePeriods.push(Object.freeze({ start: period.start, end: period.end }));
      });
      activePeriods.sort((a, b) => a.start.localeCompare(b.start));
    } else if (hasOwn(raw, 'activePeriods')) {
      issues.push('activePeriods が配列ではないため無視しました');
    }

    excludedDates.forEach(date => {
      if (specialMap.has(date)) issues.push(`${date} は除外日と臨時活動日の両方にあり、除外日を優先します`);
    });

    const lookaheadDays = Number.isInteger(raw.lookaheadDays) && raw.lookaheadDays >= 1 && raw.lookaheadDays <= 730
      ? raw.lookaheadDays
      : DEFAULT_SCHEDULE.lookaheadDays;
    if (hasOwn(raw, 'lookaheadDays') && lookaheadDays !== raw.lookaheadDays) issues.push('lookaheadDays が不正なため通常値を使用しました');

    return Object.freeze({
      regularWeekdays: Object.freeze(regularWeekdays),
      startTime,
      endTime,
      timeZone,
      excludedDates: Object.freeze(excludedDates),
      specialDates: Object.freeze(specialDates),
      activePeriods: Object.freeze(activePeriods),
      lookaheadDays,
      issues: Object.freeze(issues)
    });
  }

  function isDateInActivePeriod(dateKey, activePeriods) {
    return !activePeriods.length || activePeriods.some(period => period.start <= dateKey && dateKey <= period.end);
  }

  function findNextFromNormalized(schedule, now = new Date()) {
    const current = getZonedParts(now, schedule.timeZone);
    if (!current) return null;
    const excludedDates = new Set(schedule.excludedDates);
    const specialDates = new Map(schedule.specialDates.map(item => [item.date, item]));

    for (let offset = 0; offset <= schedule.lookaheadDays; offset += 1) {
      const dateKey = addDays(current.dateKey, offset);
      if (!dateKey || excludedDates.has(dateKey)) continue;

      const special = specialDates.get(dateKey);
      const weekday = weekdayForDate(dateKey);
      let source = '';
      let startTime = schedule.startTime;
      let endTime = schedule.endTime;
      let room = '';
      let note = '';

      if (special) {
        source = 'special';
        startTime = special.startTime;
        endTime = special.endTime;
        room = special.room;
        note = special.note;
      } else if (schedule.regularWeekdays.includes(weekday) && isDateInActivePeriod(dateKey, schedule.activePeriods)) {
        source = 'regular';
      } else {
        continue;
      }

      const startSeconds = timeToSeconds(startTime);
      const endSeconds = timeToSeconds(endTime);
      let state = 'upcoming';
      if (offset === 0) {
        if (current.secondsSinceMidnight >= endSeconds) continue;
        if (current.secondsSinceMidnight >= startSeconds) state = 'ongoing';
      }

      return Object.freeze({
        date: dateKey,
        dateKey,
        weekday,
        startTime,
        endTime,
        timeZone: schedule.timeZone,
        state,
        source,
        room,
        note,
        isWithinConfiguredPeriod: schedule.activePeriods.length > 0 && isDateInActivePeriod(dateKey, schedule.activePeriods),
        certainty: source === 'special'
          ? 'special'
          : (schedule.activePeriods.length ? 'configured-period' : 'usual-pattern')
      });
    }
    return null;
  }

  function findNextActivity(rawSchedule = {}, now = new Date()) {
    return findNextFromNormalized(normalizeSchedule(rawSchedule), now);
  }

  function formatActivityDate(activity) {
    if (!activity || !isValidDateKey(activity.dateKey || activity.date)) return '';
    const dateKey = activity.dateKey || activity.date;
    const [, month, day] = dateKey.split('-').map(Number);
    const weekday = weekdayForDate(dateKey);
    const time = activity.startTime && activity.endTime ? `${activity.startTime}〜${activity.endTime}` : '';
    return `${month}月${day}日（${WEEKDAY_LABELS[weekday]}）${time}`;
  }

  const scheduleAPI = Object.freeze({
    defaults: DEFAULT_SCHEDULE,
    normalizeSchedule,
    getZonedParts,
    addDays,
    weekdayForDate,
    findNextActivity,
    formatActivityDate
  });
  window.AZBDebateSchedule = scheduleAPI;

  /** ===== 設定読み込み（埋め込み JSON） / Load embedded config ===== */
  function loadConfig() {
    try {
      const el = byId('club-config');
      if (!el) return {};
      const parsed = JSON.parse(el.textContent || '{}');
      return isObject(parsed) ? parsed : {};
    } catch (error) {
      console.warn('設定の読み込みに失敗したため、HTMLの表示を使用します', error);
      return {};
    }
  }

  function isSafeEmail(value) {
    return typeof value === 'string' && /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(value.trim());
  }

  function isSafeLineURL(value) {
    if (typeof value !== 'string' || !value.trim()) return false;
    try {
      const url = new URL(value.trim());
      return url.protocol === 'https:' && (url.hostname === 'line.me' || url.hostname.endsWith('.line.me'));
    } catch {
      return false;
    }
  }

  function safeXHandle(value) {
    if (typeof value !== 'string') return '';
    const handle = value.trim().replace(/^@/, '');
    return /^[A-Za-z0-9_]{1,15}$/.test(handle) ? handle : '';
  }

  function existingEmail() {
    for (const link of qsa('[data-email-link]')) {
      const href = link.getAttribute('href') || '';
      if (!/^mailto:/i.test(href)) continue;
      let candidate = href.slice(7).split('?')[0];
      try {
        candidate = decodeURIComponent(candidate);
      } catch {
        // 不正な静的URLは未変換のまま検証 / Validate a malformed static URL without decoding.
      }
      if (isSafeEmail(candidate)) return candidate.trim();
    }
    for (const el of qsa('[data-bind="email"]')) {
      if (isSafeEmail(el.textContent)) return el.textContent.trim();
    }
    return '';
  }

  function existingLineURL() {
    const link = qsa('[data-bind="line-link"]').find(item => isSafeLineURL(item.getAttribute('href') || ''));
    return link ? link.getAttribute('href').trim() : '';
  }

  function existingXHandle() {
    for (const el of qsa('[data-bind="x-handle"]')) {
      const handle = safeXHandle(el.textContent);
      if (handle) return handle;
    }
    for (const link of qsa('[data-bind="x-link"]')) {
      try {
        const url = new URL(link.getAttribute('href') || '', document.baseURI);
        if (url.hostname !== 'x.com' && url.hostname !== 'www.x.com') continue;
        const handle = safeXHandle(url.pathname.split('/').filter(Boolean)[0] || '');
        if (handle) return handle;
      } catch {
        // 不正な静的候補は無視して探索を継続 / Ignore an invalid static fallback.
      }
    }
    return '';
  }

  /** ===== 設定値を DOM に適用 / Apply config to DOM ===== */
  function applyConfig(cfg) {
    const specialKeys = new Set(['email', 'line', 'line-link', 'x', 'x-link', 'x-handle']);
    qsa('[data-bind]').forEach(el => {
      const key = el.getAttribute('data-bind') || '';
      if (!key || specialKeys.has(key) || !hasOwn(cfg, key)) return;
      const value = cfg[key];
      if (typeof value === 'string' && value.trim()) el.textContent = value.trim();
    });

    const addrEl = qs('[data-bind="addr"]');
    const addr = addrEl ? addrEl.textContent.trim() : '';
    const mapLink = byId('map-open');
    if (mapLink && addr) mapLink.href = `https://www.google.com/maps?q=${encodeURIComponent(addr)}`;

    const configuredX = safeXHandle(cfg.x);
    const fallbackX = existingXHandle();
    const resolvedX = configuredX || fallbackX;
    if (resolvedX) {
      qsa('[data-bind="x-link"]').forEach(link => {
        link.href = `https://x.com/${resolvedX}`;
      });
      qsa('[data-bind="x-handle"]').forEach(el => {
        el.textContent = `@${resolvedX}`;
      });
      qsa('.x-text[data-bind="x-link"]').forEach(link => {
        link.textContent = `@${resolvedX}`;
      });
    }

    const configuredLine = isSafeLineURL(cfg.line) ? cfg.line.trim() : '';
    const fallbackLine = existingLineURL();
    const resolvedLine = configuredLine || fallbackLine;
    if (resolvedLine) {
      qsa('[data-bind="line-link"]').forEach(link => {
        link.href = resolvedLine;
        link.style.removeProperty('display');
      });
    }

    const configuredEmail = isSafeEmail(cfg.email) ? cfg.email.trim() : '';
    const fallbackEmail = existingEmail();
    const resolvedEmail = configuredEmail || fallbackEmail;
    if (resolvedEmail) {
      qsa('[data-bind="email"]').forEach(el => {
        el.textContent = resolvedEmail;
      });
      qsa('[data-email-link]').forEach(link => {
        link.href = `mailto:${resolvedEmail}`;
        link.style.removeProperty('display');
        link.removeAttribute('aria-disabled');
        link.removeAttribute('tabindex');
      });
    }

    qsa('a[target="_blank"]').forEach(link => {
      const rel = new Set((link.getAttribute('rel') || '').split(/\s+/).filter(Boolean));
      rel.add('noopener');
      rel.add('noreferrer');
      link.setAttribute('rel', Array.from(rel).join(' '));
    });

    return Object.freeze({ email: resolvedEmail, line: resolvedLine, x: resolvedX });
  }

  /** ===== 次回活動を表示 / Render the next activity ===== */
  function setupNextActivity(cfg) {
    const headingEl = qs('[data-next-heading]');
    const dateEl = qs('[data-next-date]');
    const metaEl = qs('[data-next-meta]');
    const statusEl = qs('[data-next-status]');
    if (!headingEl && !dateEl && !metaEl && !statusEl) return;
    const panelEl = headingEl?.closest('.next-activity') || dateEl?.closest('.next-activity');

    const schedule = normalizeSchedule(cfg.activitySchedule);
    if (schedule.issues.length) console.warn('活動日程設定の一部を補正しました', schedule.issues);
    const configuredRoom = typeof cfg.room === 'string' ? cfg.room.trim() : '';
    const fallbackRoom = qs('[data-bind="room"]')?.textContent.trim() || '';

    const setText = (el, text) => {
      if (el && el.textContent !== text) el.textContent = text;
    };

    const render = (now = new Date()) => {
      const activity = findNextFromNormalized(schedule, now);
      const room = activity?.room || configuredRoom || fallbackRoom;
      if (!activity) {
        if (panelEl) panelEl.dataset.scheduleState = 'fallback';
        setText(headingEl, '次回活動日は未掲載です');
        setText(dateEl, `通常日程：毎週火・木・金 ${schedule.startTime}〜${schedule.endTime}`);
        setText(metaEl, [room, '予約不要'].filter(Boolean).join('・'));
        setText(statusEl, '通常日程と最新のお知らせをご確認ください。');
        if (dateEl?.tagName === 'TIME') dateEl.removeAttribute('datetime');
        return null;
      }

      const isRegular = activity.source === 'regular';
      const isOngoing = activity.state === 'ongoing';
      if (panelEl) panelEl.dataset.scheduleState = isOngoing ? 'ongoing' : 'upcoming';
      const heading = isOngoing
        ? (isRegular ? '本日の活動（通常日程）' : '本日の活動')
        : (isRegular ? '通常日程上の次回候補' : '次回の活動');
      let status = '';
      if (activity.note) {
        status = activity.note;
      } else if (isRegular && isOngoing) {
        status = '通常日程では活動時間中です。変更情報がないか最新のお知らせもご確認ください。';
      } else if (isRegular) {
        status = '通常日程上の候補です。試験前・休校日・長期休暇などは活動しない場合があります。';
      } else {
        status = '臨時日程として設定されています。最新のお知らせもあわせてご確認ください。';
      }

      setText(headingEl, heading);
      setText(dateEl, formatActivityDate(activity));
      setText(metaEl, [room, '予約不要'].filter(Boolean).join('・'));
      setText(statusEl, status);
      if (dateEl?.tagName === 'TIME') {
        const offset = activity.timeZone === 'Asia/Tokyo' ? '+09:00' : '';
        dateEl.setAttribute('datetime', `${activity.dateKey}T${activity.startTime}:00${offset}`);
      }
      return activity;
    };

    let refreshTimer = 0;
    const queueMinuteRefresh = () => {
      clearTimeout(refreshTimer);
      const delay = 60000 - (Date.now() % 60000) + 50;
      refreshTimer = window.setTimeout(() => {
        render();
        queueMinuteRefresh();
      }, delay);
    };

    render();
    queueMinuteRefresh();
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        render();
        queueMinuteRefresh();
      }
    });
    window.addEventListener('pagehide', () => clearTimeout(refreshTimer));
    window.addEventListener('pageshow', () => {
      render();
      queueMinuteRefresh();
    });
  }

  /** ===== 目次のアクティブ状態を制御 / Keep TOC active state ===== */
  function setupActiveTOC() {
    const toc = qs('nav.toc');
    if (!toc) return;
    const links = qsa('a[href^="#"]', toc);
    const entries = links.map(link => {
      const href = link.getAttribute('href') || '';
      const id = href.slice(1);
      return { link, id, section: id ? byId(id) : null };
    }).filter(entry => entry.section);
    if (!entries.length) return;

    const header = qs('.site-header');
    const tocShell = qs('.toc-shell') || toc;
    const entryById = new Map(entries.map(entry => [entry.id, entry]));
    let activeId = '';
    let pendingId = '';
    let pendingUntil = 0;
    let pendingTimer = 0;
    let ticking = false;

    const getHeaderBottom = () => header ? Math.max(0, header.getBoundingClientRect().bottom) : 0;
    const atPageBottom = () => Math.ceil(window.scrollY + window.innerHeight) >= document.documentElement.scrollHeight - 2;

    const syncHeaderOffset = () => {
      const height = header ? Math.ceil(header.getBoundingClientRect().height) : 0;
      document.documentElement.style.setProperty('--header-offset', `${height}px`);
    };

    const updateTocEdges = () => {
      const scrollable = toc.scrollWidth > toc.clientWidth + 1;
      const canScrollLeft = scrollable && toc.scrollLeft > 2;
      const canScrollRight = scrollable && toc.scrollLeft + toc.clientWidth < toc.scrollWidth - 2;
      tocShell.classList.toggle('is-scrollable', scrollable);
      tocShell.classList.toggle('can-scroll-left', canScrollLeft);
      tocShell.classList.toggle('can-scroll-right', canScrollRight);
    };

    const revealActiveLink = link => {
      if (toc.scrollWidth <= toc.clientWidth + 1) return;
      const tocRect = toc.getBoundingClientRect();
      const linkRect = link.getBoundingClientRect();
      const inset = 16;
      if (linkRect.left >= tocRect.left + inset && linkRect.right <= tocRect.right - inset) return;
      const left = toc.scrollLeft + (linkRect.left - tocRect.left) - (toc.clientWidth - linkRect.width) / 2;
      toc.scrollTo({ left: Math.max(0, left), behavior: reducedMotion() ? 'auto' : 'smooth' });
    };

    const setActive = (id, reveal = true) => {
      const nextId = entryById.has(id) ? id : '';
      entries.forEach(entry => {
        const active = entry.id === nextId;
        entry.link.classList.toggle('is-active', active);
        if (active) entry.link.setAttribute('aria-current', 'location');
        else entry.link.removeAttribute('aria-current');
      });
      if (nextId !== activeId) {
        activeId = nextId;
        if (reveal && nextId) revealActiveLink(entryById.get(nextId).link);
      }
    };

    const clearPending = (updateAfter = false) => {
      pendingId = '';
      pendingUntil = 0;
      clearTimeout(pendingTimer);
      if (updateAfter) onScroll();
    };

    const keepPending = id => {
      if (!entryById.has(id)) return;
      pendingId = id;
      pendingUntil = performance.now() + 1400;
      clearTimeout(pendingTimer);
      pendingTimer = window.setTimeout(() => clearPending(true), 1450);
      setActive(id);
    };

    const update = () => {
      const line = getHeaderBottom() + 2;
      if (pendingId) {
        const pending = entryById.get(pendingId);
        const rect = pending.section.getBoundingClientRect();
        const reached = (rect.top <= line && rect.bottom > line) || (atPageBottom() && pending === entries[entries.length - 1]);
        if (!reached && performance.now() < pendingUntil) {
          setActive(pendingId, false);
          ticking = false;
          return;
        }
        clearPending(false);
      }

      let current = '';
      entries.forEach(entry => {
        if (entry.section.getBoundingClientRect().top <= line) current = entry.id;
      });
      const hashEntry = entryById.get(safeHashId());
      if (hashEntry) {
        const hashRect = hashEntry.section.getBoundingClientRect();
        const nearHeader = hashRect.top > line && hashRect.top <= line + 96 && hashRect.bottom > line;
        if (nearHeader) current = hashEntry.id;
      }
      if (atPageBottom()) current = entries[entries.length - 1].id;
      setActive(current);
      ticking = false;
    };

    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    }

    const safeHashId = () => {
      const raw = (location.hash || '').replace(/^#/, '');
      if (!raw) return '';
      try {
        return decodeURIComponent(raw);
      } catch {
        return raw;
      }
    };

    entries.forEach(entry => {
      entry.link.addEventListener('click', () => keepPending(entry.id));
    });
    toc.addEventListener('scroll', updateTocEdges, { passive: true });
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', () => {
      syncHeaderOffset();
      updateTocEdges();
      onScroll();
    });
    window.addEventListener('hashchange', () => {
      const id = safeHashId();
      if (entryById.has(id)) keepPending(id);
      onScroll();
    });
    window.addEventListener('scrollend', () => clearPending(true));
    window.addEventListener('wheel', () => clearPending(true), { passive: true });
    window.addEventListener('touchstart', () => clearPending(true), { passive: true });
    window.addEventListener('keydown', event => {
      if (['PageUp', 'PageDown', 'Home', 'End', 'ArrowUp', 'ArrowDown', ' '].includes(event.key)) clearPending(true);
    });

    if ('ResizeObserver' in window && header) {
      const resizeObserver = new ResizeObserver(() => {
        syncHeaderOffset();
        onScroll();
      });
      resizeObserver.observe(header);
    }

    syncHeaderOffset();
    updateTocEdges();
    const initialId = safeHashId();
    if (entryById.has(initialId)) keepPending(initialId);
    onScroll();
  }

  /** ===== フッターの年号を更新 / Update footer year ===== */
  function setYear() {
    const el = byId('year');
    const tokyoNow = getZonedParts(new Date(), DEFAULT_SCHEDULE.timeZone);
    if (el && tokyoNow) el.textContent = String(tokyoNow.year);
  }

  /** ===== コピー操作 / Copy actions ===== */
  function setupCopyButtons(values) {
    const buttons = qsa('[data-copy]');
    if (!buttons.length) return;

    const notes = new Map();
    qsa('[data-copy-note]').forEach(el => {
      el.setAttribute('aria-atomic', 'true');
      notes.set(el.dataset.copyNote, el);
    });

    const writeText = async text => {
      if (navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(text);
          return true;
        } catch {
          // キーボード操作を保つ代替処理へ移行 / Continue with the keyboard-safe fallback.
        }
      }

      const previousFocus = document.activeElement;
      const temp = document.createElement('textarea');
      try {
        temp.value = text;
        temp.setAttribute('readonly', '');
        temp.setAttribute('aria-hidden', 'true');
        temp.setAttribute('tabindex', '-1');
        temp.style.position = 'fixed';
        temp.style.top = '-100vh';
        temp.style.left = '0';
        document.body.appendChild(temp);
        temp.select();
        return typeof document.execCommand === 'function' && document.execCommand('copy');
      } catch {
        return false;
      } finally {
        temp.remove();
        if (previousFocus instanceof HTMLElement && previousFocus.isConnected) {
          try {
            previousFocus.focus({ preventScroll: true });
          } catch {
            previousFocus.focus();
          }
        }
      }
    };

    const flashNote = (key, ok) => {
      const note = notes.get(key);
      if (!note) return;
      clearTimeout(note._timer);
      cancelAnimationFrame(note._raf);
      note.classList.remove('is-visible');
      note.textContent = '';
      note._raf = requestAnimationFrame(() => {
        note.textContent = ok ? 'コピーしました' : 'コピーできませんでした';
        note.classList.add('is-visible');
        note._timer = window.setTimeout(() => {
          note.classList.remove('is-visible');
          note.textContent = '';
        }, 3000);
      });
    };

    buttons.forEach(button => {
      const key = button.dataset.copy;
      const text = typeof values?.[key] === 'string' ? values[key].trim() : '';
      button.disabled = !text;
      button.addEventListener('click', async () => {
        if (!text) return;
        flashNote(key, await writeText(text));
      });
    });
  }

  /** ===== 軽いインビュー演出 / Gentle in-view motion ===== */
  function setupInViewMotion() {
    const targets = qsa('[data-motion]');
    if (!targets.length) return;

    if (reducedMotion() || !('IntersectionObserver' in window)) {
      targets.forEach(el => el.classList.add('is-inview'));
      return;
    }

    document.body.classList.add('motion-enhanced');
    const observer = new IntersectionObserver((entries, io) => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-inview');
        io.unobserve(entry.target);
      });
    }, {
      threshold: 0.12,
      rootMargin: '0px 0px -8% 0px'
    });

    targets.forEach(el => {
      const rect = el.getBoundingClientRect();
      if (rect.top < (window.innerHeight || 0) * 0.92) el.classList.add('is-inview');
      observer.observe(el);
    });
  }

  try {
    const cfg = loadConfig();
    const resolved = applyConfig(cfg);
    setupNextActivity(cfg);
    setupActiveTOC();
    setYear();
    setupCopyButtons(resolved);

    if (document.readyState === 'complete') {
      setupInViewMotion();
    } else {
      window.addEventListener('load', setupInViewMotion, { once: true });
    }

    console.assert(qs('#about') && qs('#qa'), '必須セクションが存在すること');
    console.assert(qsa('nav.toc a.is-active').length <= 1, '目次のアクティブリンクは 1 件以下であること');
  } catch (error) {
    console.error('初期化でエラーが発生しました', error);
  }
})();
