(() => {
  'use strict';

  /** ===== utils ===== */
  const qs  = (s, el=document) => el.querySelector(s);
  const qsa = (s, el=document) => Array.from(el.querySelectorAll(s));
  const byId = id => document.getElementById(id);

  /** ===== config loader (inline JSON) ===== */
  function loadConfig() {
    try {
      const el = byId('club-config');
      if (!el) return {};
      return JSON.parse(el.textContent || '{}');
    } catch (e) {
      console.warn('config parse failed', e);
      return {};
    }
  }

  /** ===== apply config to DOM ===== */
  function applyConfig(cfg) {
    // data-bind text fills
    qsa('[data-bind]').forEach(el => {
      const key = el.getAttribute('data-bind');
      if (key && cfg[key]) el.textContent = cfg[key];
    });

    // Google Maps link from addr
    const addrEl = qs('[data-bind="addr"]');
    const addr = addrEl ? addrEl.textContent.trim() : '';
    const mapsHref = addr ? 'https://www.google.com/maps?q=' + encodeURIComponent(addr) : '';
    const mapLink = byId('map-open');
    if (mapLink && mapsHref) mapLink.href = mapsHref;

    // X link(s)
    const xHandle = (cfg.x || '').replace(/^@/, '');
    const xHref = xHandle ? 'https://x.com/' + xHandle : 'https://x.com/';
    qsa('[data-bind="x-link"]').forEach(a => { a.href = xHref; });
    qsa('.x-text[data-bind="x-link"]').forEach(a => { if (xHandle) a.textContent = '@' + xHandle; });

    // LINE button
    const lineURL = (cfg.line || '').trim();
    qsa('[data-bind="line-link"]').forEach(a => {
      if (lineURL) { a.href = lineURL; a.style.display = ''; }
      else { a.style.display = 'none'; }
    });

    // email (plain text)
    const emailSpan = qs('[data-bind="email"]');
    if (emailSpan) emailSpan.textContent = (cfg.email || '').trim() || '（後日掲載）';
  }

  /** ===== TOC active highlight (strict, single) ===== */
  function setupActiveTOC(){
    const links = Array.from(document.querySelectorAll('nav.toc a[href^="#"]'));
    const sections = links.map(a => document.querySelector(a.getAttribute('href'))).filter(Boolean);
    if (!sections.length) return;

    const getHeaderH = () => (document.querySelector('.site-header')?.offsetHeight || 56);
    const setActive = (id) => {
      links.forEach(a => a.classList.toggle('is-active', a.getAttribute('href') === '#' + id));
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

  /** ===== footer year ===== */
  function setYear() {
    const y = new Date().getFullYear();
    const el = byId('year');
    if (el) el.textContent = y;
  }

  /** ===== equal height for .basic-grid (SP only, all cards equal) ===== */
  function setupEqualHeightsSP(selector='.basic-grid', breakpoint='(max-width: 480px)'){
    const grid = document.querySelector(selector);
    if (!grid) return;
    if (grid.dataset.eqhAttached === '1') return;        // 多重アタッチ防止
    grid.dataset.eqhAttached = '1';

    const items = Array.from(grid.querySelectorAll('.basic-card'));
    if (!items.length) return;

    const mq = window.matchMedia(breakpoint);

    const equalizeAll = () => {
      // PC/タブは解除
      if (!mq.matches) {
        items.forEach(el => el.style.height = 'auto');
        return;
      }
      // リセット
      items.forEach(el => el.style.height = 'auto');
      // 1カラム時は均等化しない（読みやすさ優先）
      const cols = getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length;
      if (cols <= 1) return;
      // 全カードの最大高さを計測し統一
      const maxH = Math.max(...items.map(el => el.getBoundingClientRect().height));
      items.forEach(el => el.style.height = maxH + 'px');
    };

    // 監視：リサイズと内容変化（メール折返し等）
    const ro = new ResizeObserver(equalizeAll);
    items.forEach(el => ro.observe(el));
    mq.addEventListener?.('change', equalizeAll);
    window.addEventListener('resize', equalizeAll, { passive:true });
    window.addEventListener('load', equalizeAll);

    equalizeAll();
  }

  /** ===== boot ===== */
  try {
    const cfg = loadConfig();
    applyConfig(cfg);
    setupActiveTOC();
    setYear();
    setupEqualHeightsSP('.basic-grid', '(max-width: 480px)');

    // self-checks (dev)
    console.assert(qs('#about') && qs('#qa'), 'Required sections exist');
    console.assert(qsa('nav.toc a.is-active').length <= 1, 'TOC active should be <= 1');
  } catch (e) {
    console.error('init error', e);
  }
})();
