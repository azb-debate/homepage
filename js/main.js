(() => {
  'use strict';

  /** ===== ユーティリティ ===== */
  const qs  = (s, el=document) => el.querySelector(s);
  const qsa = (s, el=document) => Array.from(el.querySelectorAll(s));
  const byId = id => document.getElementById(id);

  /** ===== 設定読み込み（埋め込み JSON） ===== */
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

  /** ===== 設定値を DOM に適用 ===== */
  function applyConfig(cfg) {
    // data-bind 属性の要素に設定値を流し込む
    qsa('[data-bind]').forEach(el => {
      const key = el.getAttribute('data-bind');
      if (key && cfg[key]) el.textContent = cfg[key];
    });

    // 住所から Google マップのリンクを生成
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

    // X のリンクをハンドルに合わせて生成
    const rawHandle = (cfg.x || '').replace(/^@/, '');
    const safeX = /^[A-Za-z0-9_]{1,15}$/.test(rawHandle) ? rawHandle : '';
    const xHref = safeX ? 'https://x.com/' + safeX : 'https://x.com/';
    qsa('[data-bind="x-link"]').forEach(a => {
      a.href = xHref;
      // 新しいタブで開くリンクは rel を安全に維持
      if (a.target === '_blank') a.rel = 'noopener noreferrer';
    });
    qsa('.x-text[data-bind="x-link"]').forEach(a => { if (safeX) a.textContent = '@' + safeX; });

    // LINE ボタンのリンク設定
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

    // メールアドレス（テキストのみ）
    const emailSpan = qs('[data-bind="email"]');
    if (emailSpan) emailSpan.textContent = (cfg.email || '').trim() || '（後日掲載）';
  }

  /** ===== 目次のアクティブ状態を制御（常に 1 件） ===== */
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

  /** ===== フッターの年号を更新 ===== */
  function setYear() {
    const y = new Date().getFullYear();
    const el = byId('year');
    if (el) el.textContent = y;
  }

  /** ===== .basic-grid の高さをスマホ時に揃える ===== */
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

  /** ===== 初期化 ===== */
  try {
    const cfg = loadConfig();
    applyConfig(cfg);
    setupActiveTOC();
    setYear();
    setupEqualHeightsSP('.basic-grid', '(max-width: 480px)');

    // 開発時のセルフチェック
    console.assert(qs('#about') && qs('#qa'), '必須セクションが存在すること');
    console.assert(qsa('nav.toc a.is-active').length <= 1, '目次のアクティブリンクは 1 件以下であること');
  } catch (e) {
    console.error('初期化でエラーが発生しました', e);
  }
})();
