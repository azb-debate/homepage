(() => {
  'use strict';

  /** ===== ユーティリティ / Utilities ===== */
  const qs = (s, el = document) => el.querySelector(s);
  const qsa = (s, el = document) => Array.from(el.querySelectorAll(s));
  const byId = id => document.getElementById(id);

  /** ===== ページローダー制御 / Page loader control ===== */
  function setupPageLoader() {
    const body = document.body;
    const loader = qs('.page-loader');
    if (!body || !loader) return Promise.resolve();

    const storageKey = 'azb_loader_seen_session_v1';
    const minDuration = 800;
    const maxDuration = 2500;
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;

    let resolveDone;
    const done = new Promise(resolve => { resolveDone = resolve; });
    let finished = false;

    const finish = (instant = false) => {
      if (finished) return;
      finished = true;
      body.classList.remove('is-loading');
      body.classList.add('is-loaded');
      loader.setAttribute('aria-hidden', 'true');

      if (instant || reduceMotion) {
        loader.style.display = 'none';
        resolveDone();
        return;
      }
      window.setTimeout(() => {
        loader.style.display = 'none';
        resolveDone();
      }, 320);
    };

    let alreadySeen = false;
    try {
      alreadySeen = sessionStorage.getItem(storageKey) === '1';
    } catch {
      alreadySeen = false;
    }

    if (reduceMotion || alreadySeen) {
      finish(true);
      return done;
    }

    let minReady = false;
    let loadReady = document.readyState === 'complete';

    const maybeFinish = () => {
      if (minReady && loadReady) finish(false);
    };

    window.addEventListener('load', () => {
      loadReady = true;
      maybeFinish();
    }, { once: true });

    window.setTimeout(() => {
      minReady = true;
      maybeFinish();
    }, minDuration);

    // 画像遅延時の固着防止 / Fail-safe to avoid loader lock
    window.setTimeout(() => {
      minReady = true;
      loadReady = true;
      maybeFinish();
    }, maxDuration);

    try {
      sessionStorage.setItem(storageKey, '1');
    } catch {
      // ignore storage errors / ストレージ不可時は毎回表示
    }

    return done;
  }

  /** ===== 要素のインビュー演出 / In-view motion ===== */
  function setupInViewMotion() {
    const targets = qsa('[data-motion]');
    if (!targets.length) return;

    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    const isInViewport = (el) => {
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight || document.documentElement.clientHeight || 0;
      return r.top < vh * 0.9 && r.bottom > 0;
    };

    document.body.classList.add('motion-enhanced');

    if (reduceMotion) {
      targets.forEach(el => el.classList.add('is-inview'));
      return;
    }

    targets.forEach(el => {
      if (isInViewport(el)) el.classList.add('is-inview');
    });

    if (!('IntersectionObserver' in window)) {
      targets.forEach(el => el.classList.add('is-inview'));
      return;
    }

    const io = new IntersectionObserver((entries, observer) => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-inview');
        observer.unobserve(entry.target);
      });
    }, {
      threshold: 0.12,
      rootMargin: '0px 0px -10% 0px'
    });

    targets.forEach(el => io.observe(el));
  }

  /** ===== パララックス演出 / Parallax motion ===== */
  function setupParallaxMotion() {
    const layers = qsa('[data-parallax]');
    if (!layers.length) return;

    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    if (reduceMotion) {
      layers.forEach(el => el.style.setProperty('--parallax-y', '0px'));
      return;
    }

    const rootStyles = getComputedStyle(document.documentElement);
    const desktopScale = parseFloat(rootStyles.getPropertyValue('--parallax-scale-desktop')) || 1;
    const mobileScale = parseFloat(rootStyles.getPropertyValue('--parallax-scale-mobile')) || 0.75;
    const mobileMQ = window.matchMedia('(max-width: 760px)');
    let currentScale = mobileMQ.matches ? mobileScale : desktopScale;

    const compute = () => {
      const y = window.scrollY || window.pageYOffset || 0;
      layers.forEach(el => {
        const factor = parseFloat(el.dataset.parallax || '0');
        const offset = y * factor * currentScale;
        el.style.setProperty('--parallax-y', offset.toFixed(2) + 'px');
      });
    };

    let ticking = false;
    const onFrame = () => {
      compute();
      ticking = false;
    };
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(onFrame);
    };
    const onMQChange = () => {
      currentScale = mobileMQ.matches ? mobileScale : desktopScale;
      onScroll();
    };

    mobileMQ.addEventListener?.('change', onMQChange);
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    onScroll();
  }

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
    // data-bind 属性の要素に設定値を流し込む / Apply values to data-bind elements
    qsa('[data-bind]').forEach(el => {
      const key = el.getAttribute('data-bind');
      if (key && cfg[key]) el.textContent = cfg[key];
    });

    // 住所から Google マップのリンクを生成 / Build Google Maps link from address
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

    // X のリンクをハンドルに合わせて生成 / Build X link from handle
    const rawHandle = (cfg.x || '').replace(/^@/, '');
    const safeX = /^[A-Za-z0-9_]{1,15}$/.test(rawHandle) ? rawHandle : '';
    const xHref = safeX ? 'https://x.com/' + safeX : 'https://x.com/';
    qsa('[data-bind="x-link"]').forEach(a => {
      a.href = xHref;
      // 新しいタブで開くリンクは rel を安全に維持 / Keep rel safe for new tabs
      if (a.target === '_blank') a.rel = 'noopener noreferrer';
    });
    qsa('.x-text[data-bind="x-link"]').forEach(a => { if (safeX) a.textContent = '@' + safeX; });

    // LINE ボタンのリンク設定 / Configure LINE links
    const lineURL = (cfg.line || '').trim();
    const isSafeURL = (u) => {
      try {
        const url = new URL(u, location.origin);
        return url.protocol === 'https:' && (url.hostname === 'line.me' || url.hostname.endsWith('.line.me'));
      } catch { return false; }
    };
    qsa('[data-bind="line-link"]').forEach(a => {
      if (isSafeURL(lineURL)) { a.href = lineURL; a.style.display = ''; }
      else { a.style.display = 'none'; a.removeAttribute('href'); }
    });

    // メールアドレスの反映とリンク化 / Email label + mailto
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

    return { email: safeEmail, addr };
  }

  /** ===== 目次のアクティブ状態を制御（常に 1 件） / Keep TOC active state (single) ===== */
  function setupActiveTOC() {
    const links = Array.from(document.querySelectorAll('nav.toc a[href^="#"]'));
    const sections = links.map(a => document.querySelector(a.getAttribute('href'))).filter(Boolean);
    if (!sections.length) return;

    const getHeaderH = () => (document.querySelector('.site-header')?.offsetHeight || 56);
    const setActive = (id) => {
      links.forEach(a => {
        const active = a.getAttribute('href') === '#' + id;
        a.classList.toggle('is-active', active);
        if (active) a.setAttribute('aria-current', 'page');
        else a.removeAttribute('aria-current');
      });
    };

    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const line = getHeaderH() + 12;
        let current = sections[0]?.id || null;
        for (const sec of sections) {
          const r = sec.getBoundingClientRect();
          if (r.top <= line && r.bottom > line) { current = sec.id; break; }
          if (r.top < line) current = sec.id;
        }
        if (current) setActive(current);
        ticking = false;
      });
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    onScroll();
  }

  /** ===== フッターの年号を更新 / Update footer year ===== */
  function setYear() {
    const y = new Date().getFullYear();
    const el = byId('year');
    if (el) el.textContent = y;
  }

  /** ===== コピー操作（メールなど） / Copy actions ===== */
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
      note._timer = setTimeout(() => note.classList.remove('is-visible'), 1400);
    };

    buttons.forEach(btn => {
      const key = btn.dataset.copy;
      const text = (values?.[key] || '').trim();
      btn.disabled = !text;
      btn.addEventListener('click', async () => {
        if (!text) return;
        const ok = await writeText(text);
        flashNote(key, ok);
      });
    });
  }

  /** ===== Q&A を一括で開閉 / Toggle all Q&A ===== */
  function setupQAControls() {
    const container = qs('#qa');
    if (!container) return;

    const toggleAll = (action) => {
      const items = qsa('#qa details');
      if (!items.length) return;
      items.forEach(d => {
        if (action === 'open') d.setAttribute('open', '');
        if (action === 'close') d.removeAttribute('open');
      });
    };

    container.addEventListener('click', (e) => {
      const btn = e.target.closest?.('[data-qa-action]');
      if (!btn) return;
      const action = btn.dataset.qaAction;
      if (action === 'open' || action === 'close') {
        e.preventDefault();
        toggleAll(action);
      }
    });
  }

  /** ===== .basic-grid の高さをスマホ時に揃える / Equalize card heights on mobile ===== */
  function setupEqualHeightsSP(selector = '.basic-grid', breakpoint = '(max-width: 480px)') {
    const grid = document.querySelector(selector);
    if (!grid) return;
    if (grid.dataset.eqhAttached === '1') return; // 多重アタッチ防止 / Avoid duplicate attachment
    grid.dataset.eqhAttached = '1';

    const items = Array.from(grid.querySelectorAll('.basic-card'));
    if (!items.length) return;

    const mq = window.matchMedia(breakpoint);

    const equalizeAll = () => {
      // PC/タブは解除 / Disable for desktop/tablet
      if (!mq.matches) {
        items.forEach(el => el.style.height = 'auto');
        return;
      }
      // リセット / Reset
      items.forEach(el => el.style.height = 'auto');
      // 1カラム時は均等化しない（読みやすさ優先） / Skip on single-column
      const cols = getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length;
      if (cols <= 1) return;
      // 全カードの最大高さを計測し統一 / Apply max height to all cards
      const maxH = Math.max(...items.map(el => el.getBoundingClientRect().height));
      items.forEach(el => el.style.height = maxH + 'px');
    };

    // 監視：リサイズと内容変化（メール折返し等） / Observe resize and content changes
    const ro = new ResizeObserver(equalizeAll);
    items.forEach(el => ro.observe(el));
    mq.addEventListener?.('change', equalizeAll);
    window.addEventListener('resize', equalizeAll, { passive: true });
    window.addEventListener('load', equalizeAll);

    equalizeAll();
  }

  /** ===== 初期化 / Initialize ===== */
  try {
    const loaderDone = setupPageLoader();
    const cfg = loadConfig();
    const resolved = applyConfig(cfg);
    setupActiveTOC();
    setYear();
    setupCopyButtons(resolved);
    setupQAControls();
    setupEqualHeightsSP('.basic-grid', '(max-width: 480px)');
    Promise.resolve(loaderDone).finally(() => {
      setupInViewMotion();
      setupParallaxMotion();
    });

    // 開発時のセルフチェック / Dev-time self checks
    console.assert(qs('#about') && qs('#qa'), '必須セクションが存在すること');
    console.assert(qsa('nav.toc a.is-active').length <= 1, '目次のアクティブリンクは 1 件以下であること');
  } catch (e) {
    console.error('初期化でエラーが発生しました', e);
  }
})();
