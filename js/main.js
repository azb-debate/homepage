(() => {
  'use strict';

  /** ===== ユーティリティ / Utilities ===== */
  const qs = (s, el = document) => el.querySelector(s);
  const qsa = (s, el = document) => Array.from(el.querySelectorAll(s));
  const byId = id => document.getElementById(id);

  /** ===== 設定読み込み（埋め込み JSON） / Load embedded config ===== */
  function loadConfig() {
    try {
      const el = byId('club-config');
      if (!el) return {};
      return JSON.parse(el.textContent || '{}');
    } catch (e) {
      console.warn('設定の読み込みに失敗しました', e);
      return {};
    }
  }

  /** ===== 設定値を DOM に適用 / Apply config to DOM ===== */
  function applyConfig(cfg) {
    qsa('[data-bind]').forEach(el => {
      const key = el.getAttribute('data-bind');
      if (key && cfg[key]) el.textContent = cfg[key];
    });

    const addrEl = qs('[data-bind="addr"]');
    const addr = addrEl ? addrEl.textContent.trim() : '';
    const mapsHref = addr ? 'https://www.google.com/maps?q=' + encodeURIComponent(addr) : '';
    const mapLink = byId('map-open');
    if (mapLink) {
      if (mapsHref) {
        mapLink.href = mapsHref;
        mapLink.style.display = '';
      } else {
        mapLink.style.display = 'none';
        mapLink.removeAttribute('href');
      }
    }

    const rawHandle = (cfg.x || '').replace(/^@/, '');
    const safeX = /^[A-Za-z0-9_]{1,15}$/.test(rawHandle) ? rawHandle : '';
    const xHref = safeX ? 'https://x.com/' + safeX : 'https://x.com/';
    qsa('[data-bind="x-link"]').forEach(a => {
      a.href = xHref;
      if (a.target === '_blank') a.rel = 'noopener noreferrer';
    });
    qsa('[data-bind="x-handle"]').forEach(el => {
      el.textContent = safeX ? '@' + safeX : '@azbdebateclub';
    });
    qsa('.x-text[data-bind="x-link"]').forEach(a => {
      if (safeX) a.textContent = '@' + safeX;
    });

    const lineURL = (cfg.line || '').trim();
    const isSafeURL = (u) => {
      try {
        const url = new URL(u, location.origin);
        return url.protocol === 'https:' && (url.hostname === 'line.me' || url.hostname.endsWith('.line.me'));
      } catch {
        return false;
      }
    };
    qsa('[data-bind="line-link"]').forEach(a => {
      if (isSafeURL(lineURL)) {
        a.href = lineURL;
        a.style.display = '';
      } else {
        a.style.display = 'none';
        a.removeAttribute('href');
      }
    });

    const emailRaw = (cfg.email || '').trim();
    const safeEmail = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(emailRaw) ? emailRaw : '';
    qsa('[data-bind="email"]').forEach(el => {
      el.textContent = safeEmail || '（後日掲載）';
    });
    qsa('[data-email-link]').forEach(a => {
      if (safeEmail) {
        a.href = 'mailto:' + safeEmail;
        a.style.display = '';
        a.removeAttribute('aria-disabled');
        a.removeAttribute('tabindex');
      } else if (a.hasAttribute('data-email-cta')) {
        a.style.display = 'none';
        a.removeAttribute('href');
      } else {
        a.removeAttribute('href');
        a.setAttribute('aria-disabled', 'true');
        a.setAttribute('tabindex', '-1');
      }
    });

    return { email: safeEmail };
  }

  /** ===== 目次のアクティブ状態を制御 / Keep TOC active state ===== */
  function setupActiveTOC() {
    const links = qsa('nav.toc a[href^="#"]');
    const sections = links.map(a => qs(a.getAttribute('href'))).filter(Boolean);
    if (!sections.length) return;

    const getHeaderH = () => qs('.site-header')?.offsetHeight || 56;
    const setActive = (id) => {
      links.forEach(a => {
        const active = a.getAttribute('href') === '#' + id;
        a.classList.toggle('is-active', active);
        if (active) a.setAttribute('aria-current', 'page');
        else a.removeAttribute('aria-current');
      });
    };

    let ticking = false;
    const update = () => {
      const line = getHeaderH() + 8;
      let current = sections[0]?.id || '';
      sections.forEach(sec => {
        const rect = sec.getBoundingClientRect();
        if (rect.top <= line) current = sec.id;
      });
      if (current) setActive(current);
      ticking = false;
    };

    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    };

    links.forEach(a => {
      a.addEventListener('click', () => {
        const id = (a.getAttribute('href') || '').replace(/^#/, '');
        if (id) setActive(id);
      });
    });

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    window.addEventListener('hashchange', () => {
      const id = decodeURIComponent(location.hash || '').replace(/^#/, '');
      if (id) setActive(id);
      onScroll();
    });

    if (location.hash) {
      window.addEventListener('load', () => {
        const id = decodeURIComponent(location.hash || '').replace(/^#/, '');
        if (id) setActive(id);
        onScroll();
      }, { once: true });
    } else {
      onScroll();
    }
  }

  /** ===== フッターの年号を更新 / Update footer year ===== */
  function setYear() {
    const el = byId('year');
    if (el) el.textContent = String(new Date().getFullYear());
  }

  /** ===== コピー操作 / Copy actions ===== */
  function setupCopyButtons(values) {
    const buttons = qsa('[data-copy]');
    if (!buttons.length) return;

    const notes = new Map();
    qsa('[data-copy-note]').forEach(el => notes.set(el.dataset.copyNote, el));

    const writeText = async (text) => {
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(text);
          return true;
        }
        const temp = document.createElement('textarea');
        temp.value = text;
        temp.setAttribute('readonly', '');
        temp.style.position = 'fixed';
        temp.style.top = '-100vh';
        document.body.appendChild(temp);
        temp.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(temp);
        return ok;
      } catch {
        return false;
      }
    };

    const flashNote = (key, ok) => {
      const note = notes.get(key);
      if (!note) return;
      note.textContent = ok ? 'コピーしました' : 'コピーできませんでした';
      note.classList.add('is-visible');
      clearTimeout(note._timer);
      note._timer = window.setTimeout(() => note.classList.remove('is-visible'), 1400);
    };

    buttons.forEach(btn => {
      const key = btn.dataset.copy;
      const text = (values?.[key] || '').trim();
      btn.disabled = !text;
      btn.addEventListener('click', async () => {
        if (!text) return;
        flashNote(key, await writeText(text));
      });
    });
  }

  /** ===== 軽いインビュー演出 / Gentle in-view motion ===== */
  function setupInViewMotion() {
    const targets = qsa('[data-motion]');
    if (!targets.length) return;

    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    if (reduceMotion || !('IntersectionObserver' in window)) {
      targets.forEach(el => el.classList.add('is-inview'));
      return;
    }

    document.body.classList.add('motion-enhanced');

    const io = new IntersectionObserver((entries, observer) => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-inview');
        observer.unobserve(entry.target);
      });
    }, {
      threshold: 0.12,
      rootMargin: '0px 0px -8% 0px'
    });

    targets.forEach(el => {
      const rect = el.getBoundingClientRect();
      if (rect.top < (window.innerHeight || 0) * 0.92) el.classList.add('is-inview');
      io.observe(el);
    });
  }

  try {
    const cfg = loadConfig();
    const resolved = applyConfig(cfg);
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
  } catch (e) {
    console.error('初期化でエラーが発生しました', e);
  }
})();
