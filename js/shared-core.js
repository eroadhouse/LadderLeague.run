    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    window.scrollTo(0, 0);

    window._runWhenIdle = fn => {
      if ('requestIdleCallback' in window) requestIdleCallback(fn, { timeout: 2000 });
      else setTimeout(fn, 200);
    };

    (function() {
      const params = new URLSearchParams(window.location.search);
      const route = params.get('route');
      if (route) {
        params.delete('route');
        const qs = params.toString();
        history.replaceState(null, '', route + (qs ? '?' + qs : ''));
      }
    })();

    const PAGE_TO_PATH = { home: '/', runners: '/runners', standings: '/standings', participants: '/participants', format: '/format', gallery: '/gallery', team: '/team', stats: '/statistics', content: '/content' };
    const PATH_TO_PAGE = { '/': 'home', '/runners': 'runners', '/standings': 'standings', '/participants': 'participants', '/format': 'format', '/gallery': 'gallery', '/team': 'team', '/statistics': 'stats', '/content': 'content' };

    function showPage(target, addHistory) {
      const page = document.getElementById(target);
      if (!page) return;
      document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
      document.querySelectorAll('.nav-links a').forEach(a => a.classList.remove('active'));
      document.querySelectorAll('.nav-dropdown-toggle').forEach(t => t.classList.remove('active'));
      page.classList.add('active');
      document.querySelectorAll(`.nav-links a[data-page="${target}"]`).forEach(a => {
        a.classList.add('active');
        const toggle = a.closest('.nav-dropdown')?.querySelector('.nav-dropdown-toggle');
        if (toggle) toggle.classList.add('active');
      });
      if (addHistory) history.pushState({ page: target }, '', PAGE_TO_PATH[target] || '/');
      if (target === 'stats' && window._statsRender) window._statsRender();
      if (target === 'runners' && window._resetRunnersView) window._resetRunnersView();
    }

    window.addEventListener('popstate', e => {
      const page = (e.state && e.state.page) || PATH_TO_PAGE[window.location.pathname.replace(/\/$/, '') || '/'] || 'home';
      showPage(page, false);
      window.scrollTo(0, 0);
    });

    //set initial page
    const _initialPath = window.location.pathname.replace(/\/$/, '') || '/';
    const _initialPage = PATH_TO_PAGE[_initialPath] || 'home';
    history.replaceState({ page: _initialPage }, '', window.location.href);
    if (_initialPage !== 'home') showPage(_initialPage, false);

    const AUTOMARATHON_ENABLED = true;
    (function initAutomarathon() {
      if (!AUTOMARATHON_ENABLED) return;
      let _resolveResults, _resolveSchedule;
      const _resultsReady  = new Promise(r => (_resolveResults  = r));
      const _scheduleReady = new Promise(r => (_resolveSchedule = r));
      let _cachedResults  = null;
      let _cachedSchedule = null;
      let _firstMessage   = false;

      const _nativeFetch = window.fetch.bind(window);

      //Fetch static config fields
      const _staticSchedule = _nativeFetch('/data/schedule.json', { cache: 'no-store' })
        .then(r => r.json()).catch(() => ({}));

      const _staticResults = _nativeFetch('/data/results.json', { cache: 'no-store' })
        .then(r => r.json()).catch(() => ({}));

      //Name map (so stuff is not case sensitive)
      const _nameMap = _nativeFetch('/data/participants.json', { cache: 'no-store' })
        .then(r => r.json())
        .then(data => new Map((data.season3 || []).map(p => [p.name.toLowerCase(), p.name])))
        .catch(() => new Map());

       window.fetch = function(url, opts) {
        const u = typeof url === 'string' ? url : String(url);
        if (u === '/data/results.json')  return _resultsReady.then(() => new Response(JSON.stringify(_cachedResults),  { headers: { 'Content-Type': 'application/json' } }));
        if (u === '/data/schedule.json') return _scheduleReady.then(() => new Response(JSON.stringify(_cachedSchedule), { headers: { 'Content-Type': 'application/json' } }));
        return _nativeFetch(url, opts);
      };

      const _fallbackTimer = setTimeout(() => {
        if (_firstMessage) return;
        _cachedResults  = {};
        _cachedSchedule = {};
        _resolveResults(_cachedResults);
        _resolveSchedule(_cachedSchedule);
      }, 15000);

      function parseKey(name) {
        if (!name) return null;
        const n = name.trim().toUpperCase();
        let m;
        if ((m = n.match(/^WEEK (\d+) RUNG (\d+)$/)))  return `${m[1]}_${m[2]}`;
        if ((m = n.match(/^LCQ (\d+)$/)))               return `lcq_${m[1]}`;
        if ((m = n.match(/^QUARTERFINAL (\d+)$/)))      return `qf_${m[1]}`;
        if ((m = n.match(/^SEMIFINAL (\d+)$/)))         return `sf_${m[1]}`;
        if (n === 'GRAND FINALS')                       return 'gf_1';
        if (n === '3RD PLACE MATCH')                  return 'tp_1';
        if (n === 'WILDCARD MATCH')                     return '8_1';
        return null;
      }

      function toSecs(t) {
        if (!t || t === 'DNF' || t === 'N/A') return Infinity;
        const [h, m, s] = t.split(':').map(Number);
        return h * 3600 + m * 60 + s;
      }

      function transform(state, nameMap) {
        const normName = n => (n && nameMap.get(n.toLowerCase())) || n;
        const results = {};
        const ladder = {}, top8 = {};

        for (const event of (state.events || [])) {
          const key = parseKey(event.name);
          if (!key) continue;

          const isTop8 = /^(qf|sf|gf|tp)_/.test(key);
          const isLcq  = key.startsWith('lcq_');
          if (isLcq) continue;
          const section = isTop8 ? top8 : ladder;

          const players = Object.keys(event.runner_state || {})
            .map(id => normName(state.people?.[id]?.name)).filter(Boolean);

          if (event.event_start_time)
            section[key] = { time: event.event_start_time, players };

          const places = [];
          for (const [id, rs] of Object.entries(event.runner_state || {})) {
            const name = normName(state.people?.[id]?.name);
            const time = rs.result?.SingleScore?.score?.final_result ?? rs.result?.SplitTimes?.final_result;
            const sortSecs = rs.result?.SplitTimes?.final_result_precise ? toSecs(rs.result.SplitTimes.final_result_precise) : toSecs(time);
            if (name && time) places.push({ name, time, sortSecs });
          }
          places.sort((a, b) => a.sortSecs - b.sortSecs);
          places.forEach(p => delete p.sortSecs);
          if (places.length) results[key] = { places, vod: event.console || null };
        }

        return { results, schedule: { ladder, top8 } };
      }

      async function applyState(raw) {
        const state = typeof raw === 'string' ? JSON.parse(raw) : raw;
        window._amRawState = state;
        console.log('[automarathon] state received, events:', (state?.events || []).length);
        const nameMap = await _nameMap;
        const { results, schedule: evSched } = transform(state, nameMap);
        const staticSched   = await _staticSchedule;
        const staticResults = await _staticResults;

        _cachedResults  = { ...staticResults, ...results };
        _cachedSchedule = { ...staticSched, ...evSched };

        if (!_firstMessage) {
          _firstMessage = true;
          clearTimeout(_fallbackTimer);
          _resolveResults(_cachedResults);
          _resolveSchedule(_cachedSchedule);
        }

        document.dispatchEvent(new CustomEvent('amUpdate'));
      }

      _nativeFetch('/data/lls3_results.json', { cache: 'no-store' })
        .then(r => r.json())
        .then(state => applyState(state))
        .catch(err => {
          console.error('[automarathon] failed to load lls3_results.json', err);
          if (!_firstMessage) {
            _firstMessage = true;
            clearTimeout(_fallbackTimer);
            _cachedResults = {};
            _cachedSchedule = {};
            _resolveResults(_cachedResults);
            _resolveSchedule(_cachedSchedule);
          }
        });
    })();
    // ────────────────────────────────────────────────────────────────────────────

    const schedulePromise      = fetch('/data/schedule.json',      { cache: 'no-store' }).then(r => r.json()).catch(() => ({}));
    const resultsPromise       = fetch('/data/results.json',       { cache: 'no-store' }).then(r => r.json()).catch(() => ({}));
    const participantsPromise  = fetch('/data/participants.json',  { cache: 'no-store' }).then(r => r.json()).catch(() => ({}));

    //navbar on standings page
    let s3DefaultTab = 'ladder';
    schedulePromise.then(sd => {
      //updating default tab depending on where we are in the schedule
      const now = new Date();
      const lcqEnd = new Date(sd.lcqEnd || '2026-05-11T05:00:00Z');
      const wildcardEntry   = sd.ladder && sd.ladder['8_1'];
      const wildcardTimeStr = wildcardEntry ? (typeof wildcardEntry === 'string' ? wildcardEntry : wildcardEntry.time || wildcardEntry.start || null) : null;
      const ladderEnd = wildcardTimeStr
        ? new Date(new Date(wildcardTimeStr).getTime() + 3 * 60 * 60 * 1000)
        : sd.ladderEnd ? new Date(sd.ladderEnd) : new Date('2026-06-25T05:00:00Z');
      s3DefaultTab = now < lcqEnd ? 'lcq' : now < ladderEnd ? 'ladder' : 'top8';
      document.querySelector(`#standings-s3-tabs .standings-tab[data-tab="${s3DefaultTab}"]`).classList.add('active');
      document.getElementById(`standings-tab-${s3DefaultTab}`).classList.add('active');
      updateTheoryToggleVisibility();
    });

    document.querySelectorAll('#standings-s3-tabs .standings-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        const name = tab.dataset.tab;
        document.querySelectorAll('#standings-s3-tabs .standings-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('#standings-s3 .standings-tab-panel').forEach(p => p.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById(`standings-tab-${name}`).classList.add('active');
        if (name === 'top8') {
          const boxIds = ['top8-champion-box','top8-runnerup-box','top8-bronze-box','top8-rest-box'];
          boxIds.forEach(id => {
            const el = document.getElementById(id);
            if (el && el.classList.contains('visible')) {
              el.classList.remove('visible');
              requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('visible')));
            }
          });
        }
        updateTheoryToggleVisibility();
      });
    });

    document.querySelectorAll('[data-page]').forEach(link => {
      link.addEventListener('click', e => {
        e.preventDefault();
        showPage(link.dataset.page, true);
        window.scrollTo(0, 0);
        hamburgerBtn.classList.remove('open');
        navLinks.classList.remove('open');
        closeAllDropdowns();
      });
    });

    //Hamburger menu
    const hamburgerBtn = document.getElementById('hamburger-btn');
    const navLinks     = document.getElementById('nav-links');
    hamburgerBtn.addEventListener('click', () => {
      hamburgerBtn.classList.toggle('open');
      navLinks.classList.toggle('open');
    });
    navLinks.querySelectorAll('a[target="_blank"]').forEach(a => {
      a.addEventListener('click', () => {
        hamburgerBtn.classList.remove('open');
        navLinks.classList.remove('open');
      });
    });

    const MENU_OPEN_ANIM_MS = 150;
    function closeAllDropdowns() {
      document.querySelectorAll('.nav-dropdown.open').forEach(d => {
        d.classList.remove('open');
        d.querySelector('.nav-dropdown-menu')?.classList.remove('menu-interactive');
      });
    }
    function closeOtherDropdowns(except) {
      document.querySelectorAll('.nav-dropdown.open').forEach(d => {
        if (d !== except) { d.classList.remove('open'); d.querySelector('.nav-dropdown-menu')?.classList.remove('menu-interactive'); }
      });
    }
    document.querySelectorAll('.nav-dropdown').forEach(drop => {
      const menu = drop.querySelector('.nav-dropdown-menu');
      let hoverTimer = null;
      drop.addEventListener('mouseenter', () => {
        closeOtherDropdowns(drop);
        clearTimeout(hoverTimer);
        hoverTimer = setTimeout(() => menu.classList.add('menu-interactive'), MENU_OPEN_ANIM_MS);
      });
      drop.addEventListener('mouseleave', () => {
        clearTimeout(hoverTimer);
        menu.classList.remove('menu-interactive');
      });
      drop.querySelector('.nav-dropdown-toggle').addEventListener('click', e => {
        e.stopPropagation();
        const willOpen = !drop.classList.contains('open');
        closeOtherDropdowns(drop);
        drop.classList.toggle('open', willOpen);
        menu.classList.toggle('menu-interactive', willOpen);
      });
    });
    document.addEventListener('click', e => {
      if (!e.target.closest('.nav-dropdown')) closeAllDropdowns();
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') closeAllDropdowns();
    });

    (function() {
      const navEl = document.querySelector('nav');
      const logoEl = document.querySelector('.nav-logo');
      const measureList = navLinks.cloneNode(true);
      measureList.removeAttribute('id');
      measureList.classList.remove('nav-links');
      measureList.classList.add('nav-measure-links');
      document.body.appendChild(measureList);

      function updateNavCollapse() {
        const navStyle = getComputedStyle(navEl);
        const available = navEl.clientWidth - parseFloat(navStyle.paddingLeft) - parseFloat(navStyle.paddingRight);
        const needed = logoEl.getBoundingClientRect().width + measureList.getBoundingClientRect().width + 24;
        const fits = needed <= available;
        document.body.classList.toggle('nav-collapsed', !fits);
        if (fits) {
          hamburgerBtn.classList.remove('open');
          navLinks.classList.remove('open');
        }
      }

      updateNavCollapse();
      let resizeTimer;
      window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(updateNavCollapse, 100);
      });
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(updateNavCollapse);
    })();

    (function() {
      const statusBar = document.querySelector('.status-bar');
      const statusBarRight = document.querySelector('.status-bar-right');
      if (!statusBar || !statusBarRight) return;
      const leftItems = [...statusBar.querySelectorAll('.status-item')];

      const measureRight = statusBarRight.cloneNode(true);
      measureRight.removeAttribute('class');
      measureRight.classList.add('status-bar-measure');
      document.body.appendChild(measureRight);

      function updateStatusBarCollapse() {
        const barStyle = getComputedStyle(statusBar);
        const available = statusBar.clientWidth - parseFloat(barStyle.paddingLeft) - parseFloat(barStyle.paddingRight);
        const gap = parseFloat(barStyle.columnGap || barStyle.gap) || 0;
        const leftWidth = leftItems.reduce((sum, el) => sum + el.getBoundingClientRect().width, 0) + gap * leftItems.length;
        const rightWidth = measureRight.getBoundingClientRect().width;
        const fits = (leftWidth + rightWidth) <= available;
        document.body.classList.toggle('status-bar-collapsed', !fits);
      }

      updateStatusBarCollapse();
      let statusResizeTimer;
      window.addEventListener('resize', () => {
        clearTimeout(statusResizeTimer);
        statusResizeTimer = setTimeout(updateStatusBarCollapse, 100);
      });
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(updateStatusBarCollapse);
    })();

    (function() {
      const canvas = document.getElementById('starfield');
      const ctx = canvas.getContext('2d');
      const COUNT = 60;

      function rand(min, max) { return Math.random() * (max - min) + min; }

      function createStar() {
        return { x: rand(0, canvas.width), y: rand(0, canvas.height), r: rand(0.4, 1.4), alpha: rand(0.2, 0.8) };
      }

      function draw() {
        canvas.width  = window.innerWidth;
        canvas.height = window.innerHeight;
        const stars = Array.from({ length: COUNT }, createStar);
        for (const s of stars) {
          ctx.beginPath();
          ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(200, 215, 240, ${s.alpha})`;
          ctx.fill();
        }
      }

      let resizeTimer;
      window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(draw, 150); });
      draw();
    })();

    let _ytApiPromise = null;
    function loadYouTubeIframeAPI() {
      if (_ytApiPromise) return _ytApiPromise;
      _ytApiPromise = new Promise(resolve => {
        if (window.YT && window.YT.Player) { resolve(window.YT); return; }
        const prevReady = window.onYouTubeIframeAPIReady;
        window.onYouTubeIframeAPIReady = () => { if (prevReady) prevReady(); resolve(window.YT); };
        const tag = document.createElement('script');
        tag.src = 'https://www.youtube.com/iframe_api';
        document.head.appendChild(tag);
      });
      return _ytApiPromise;
    }
    
    function disableCaptions(e) {
      try { e.target.unloadModule('captions'); } catch (err) { /* ignore */ }
    }

    function youtubeErrorHtml(watchUrl) {
      return `
        <div class="vod-error">
          <p>This video can't be played here - it's likely restricted in your region.</p>
          <a href="${watchUrl}" target="_blank" rel="noopener">Watch on YouTube<span aria-hidden="true"> &rarr;</span></a>
        </div>
      `;
    }

    (function() {
      const S1_QF1_FILE = 'chats/Season 1 2024/Top 8/ANY_ LADDER LEAGUE  QUARTERFINAL  ZAC (1) vs DAHAMSTER (8) 2200329490.json';
      const S1_QF2_FILE = 'chats/Season 1 2024/Top 8/ANY_ LADDER LEAGUE  QUARTERFINAL  EROADHOUSE (4) VS SCYNOR (5) 2204653311.json';
      const S1_QF3_FILE = 'chats/Season 1 2024/Top 8/ANY_ LADDER LEAGUE  QUARTERFINAL  FROSTBYTE (3) VS WIISUPER (6) 2202991949.json';
      const S1_QF4_FILE = 'chats/Season 1 2024/Top 8/ANY_ LADDER LEAGUE  QUARTER-FINAL  Ginger (2) vs Jared (7) 2199473478.json';
      const S1_SF1_FILE = 'chats/Season 1 2024/Top 8/ANY_ LADDER LEAGUE  SEMIFINALS  ZAC (1) VS. EROADHOUSE (4) 2206611483.json';
      const S1_SF2_FILE = 'chats/Season 1 2024/Top 8/ANY_ LADDER LEAGUE  SEMIFINALS  WIISUPER (6) VS ITSJARED97 (7) 2204654724.json';
      const S1_GF1_FILE = 'chats/Season 1 2024/Top 8/ANY_ LADDER LEAGUE  GRAND FINALS  EROADHOUSE (4) VS. ITSJARED97 (7) 2208442047.json';

      const QF_TOP8_FILE = 'chats/Season 3 2026/TOP 8/[7-10-26] LEGOSpeedruns - LADDER LEAGUE PLAYOFFS ｜ QUARTERFINAL 1 ｜ DRAGON VS JARED - Chat.json';
      const SF_TOP8_FILE = 'chats/Season 3 2026/TOP 8/[7-11-26] LEGOSpeedruns - LADDER LEAGUE PLAYOFFS ｜ SEMIFINAL 1 ｜ DRAGON VS ZAC - Chat.json';
      const GF_DAY_TOP8_FILE = 'chats/Season 3 2026/TOP 8/[7-12-26] LEGOSpeedruns - LADDER LEAGUE PLAYOFFS ｜ THIRD PLACE MATCH ｜ ZAC VS WIISUPER - Chat.json';

      //ladder chat files - one per rung except where noted; a few rungs share a stream-day file
      //(same pattern as Top 8) but we don't have the individual offsets to split those apart yet
      const W1R1_FILE = 'chats/Season 3 2026/WEEK 1/[5-13-26] LEGOSpeedruns - TCS ANY_ LADDER LEAGUE S3 ｜ WEEK 1 RUNG 1 - Chat.json';
      const W1R2_FILE = 'chats/Season 3 2026/WEEK 1/[5-17-26] LEGOSpeedruns - TCS ANY_ LADDER LEAGUE S3 ｜ WEEK 1 RUNG 2 ｜ EROADHOUSE VS ANORAKDT VS BRICKO - Chat.json';
      const W1R4_FILE = 'chats/Season 3 2026/WEEK 1/[5-14-26] LEGOSpeedruns - TCS ANY_ LADDER LEAGUE S3 ｜ WEEK 1 RUNG 4 ｜ FLAMINGLAZER vs. DIMEI vs. EJPMAN - Chat.json';
      const W1R7_FILE = 'chats/Season 3 2026/WEEK 1/[5-15-26] LEGOSpeedruns - TCS ANY_ LADDER LEAGUE S3 ｜ WEEK 1 RUNG  7.json';
      const W1R356_FILE = 'chats/Season 3 2026/WEEK 1/[5-16-26] LEGOSpeedruns - TCS ANY_ LADDER LEAGUE S3 ｜ WEEK 1 RUNG 6,5,3 Chat.json';
      const W2R3_FILE = 'chats/Season 3 2026/WEEK 2/[5-21-26] LEGOSpeedruns - TCS ANY_ LADDER LEAGUE S3 ｜ WEEK 2 RUNG 3 ｜ ANORAKDT VS WAZZIP VS COLTEN - Chat.json';
      const W2R46_FILE = 'chats/Season 3 2026/WEEK 2/[5-23-26] LEGOSpeedruns - TCS ANY_ LADDER LEAGUE S3 ｜ WEEK 2 RUNG 4,6.json';
      const W2R51_FILE = 'chats/Season 3 2026/WEEK 2/[5-24-26] LEGOSpeedruns - TCS ANY_ LADDER LEAGUE S3 ｜ WEEK 2 RUNG 5,1.json';
      const W3R1_FILE = 'chats/Season 3 2026/WEEK 3/[5-26-26] LEGOSpeedruns - TCS ANY_ LADDER LEAGUE S3 ｜ WEEK 3 RUNG 1 ｜ BRICKO VS FLAMINGLAZER VS ANORAK - Chat.json';
      const W3R23_FILE = 'chats/Season 3 2026/WEEK 3/[5-28-26] LEGOSpeedruns - TCS ANY_ LADDER LEAGUE S3 ｜ WEEK 3 RUNG 2,3 - Chat.json';
      const W3R4_FILE = 'chats/Season 3 2026/WEEK 3/[5-31-26] LEGOSpeedruns - TCS ANY_ LADDER LEAGUE S3 ｜ WEEK 3 RUNG 4 ｜ WAZZIP VS DIMEI VS CHARZIGHT - Chat.json';
      const W3R5_FILE = 'chats/Season 3 2026/WEEK 3/[5-29-26] LEGOSpeedruns - TCS ANY_ LADDER LEAGUE S3 ｜ WEEK 3 RUNG 5 ｜ COOLISEN VS MELLOVRO - Chat.json';
      const W4R1_FILE = 'chats/Season 3 2026/WEEK 4/[6-3-26] LEGOSpeedruns - TCS ANY_ LADDER LEAGUE S3 ｜ WEEK 4 RUNG 1 ｜ ZAC vs JARED vs BRICKO - Chat.json';
      const W4R2_FILE = 'chats/Season 3 2026/WEEK 4/[6-7-26] LEGOSpeedruns - TCS ANY_ LADDER LEAGUE S3 ｜ WEEK 4 RUNG 2 ｜ SCYNOR vs WAZZIP vs LAZER - Chat.json';
      const W4R3_FILE = 'chats/Season 3 2026/WEEK 4/[6-5-26] LEGOSpeedruns - TCS ANY_ LADDER LEAGUE S3 ｜ WEEK 4 RUNG 3 ｜ WIISUPER VS COLTEN VS MELLOVRO - Chat.json';
      const W4R4_FILE = 'chats/Season 3 2026/WEEK 4/[6-2-26] LEGOSpeedruns - TCS ANY_ LADDER LEAGUE S3  WEEK 4 RUNG 4  DIMEI VS EJPMAN VS CHARZIGHT - Chat.json';
      const W5R1_FILE = 'chats/Season 3 2026/WEEK 5/[6-11-26] LEGOSpeedruns - TCS ANY_ LADDER LEAGUE S3 ｜ WEEK 5 RUNG 1 ｜ JARED VS SCYNOR VS WIISUPER - Chat.json';
      const W5R2_FILE = 'chats/Season 3 2026/WEEK 5/[6-10-26] LEGOSpeedruns - TCS ANY_ LADDER LEAGUE S3 ｜ WEEK 5 RUNG 2 ｜ BRICKO VS FLAMINGLAZER VS COLTEN - Chat.json';
      const W5R3_FILE = 'chats/Season 3 2026/WEEK 5/[6-9-26] LEGOSpeedruns - TCS ANY_ LADDER LEAGUE S3 ｜ WEEK 5 RUNG 3 ｜ WAZZIP VS DIMEI VS MELLOVRO - Chat.json';
      const W6R1_FILE = 'chats/Season 3 2026/WEEK 6/[6-13-26] LEGOSpeedruns - TCS ANY_ LADDER LEAGUE S3 ｜ WEEK 6 RUNG 1 ｜ BRICKO VS WIISUPER VS FLAMINGLAZER - Chat.json';
      const W6R2_FILE = 'chats/Season 3 2026/WEEK 6/[6-14-26] LEGOSpeedruns - TCS ANY_ LADDER LEAGUE S3 ｜ WEEK 6 RUNG 2 ｜ JARED VS DIMEI VS COLTEN - Chat.json';
      const W7R1_FILE = 'chats/Season 3 2026/WEEK 7/[6-23-26] LEGOSpeedruns - TCS ANY_ LADDER LEAGUE S3 ｜ WEEK 7 ｜ JARED VS BRICKO VS FLAMINGLAZER - Chat.json';
      const WILDCARD_FILE = 'chats/Season 3 2026/WILDCARD/[6-27-26] LEGOSpeedruns - TCS ANY_ LADDER LEAGUE S3 ｜ WILDCARD MATCH ｜ JARED VS LAZER - Chat.json';
      const LCQ1_FILE = 'chats/Season 3 2026/LCQ/[5-9-26] LEGOSpeedruns - TCS ANY_ LADDER LEAGUE S3 ｜ LCQ DAY 1 - Chat.json';
      const LCQ2_FILE = 'chats/Season 3 2026/LCQ/[5-10-26] LEGOSpeedruns - TCS ANY_ LADDER LEAGUE S3 ｜ LCQ DAY 2 - Chat.json';

      const QF1_START   = 18 * 60 + 33;               // 0:18:33
      const QF1_CUT_OUT = 2 * 3600 + 12 * 60 + 48;    // 2:12:48
      const QF1_CUT_IN  = 2 * 3600 + 53 * 60 + 17;    // 2:53:17
      const CHAT_REPLAYS = {
        s1_qf_1: { file: S1_QF1_FILE, segments: [{ streamStart: 0, videoStart: 0 }] },
        s1_qf_2: { file: S1_QF2_FILE, segments: [{ streamStart: 0, videoStart: 0 }] },
        s1_qf_3: { file: S1_QF3_FILE, segments: [{ streamStart: 0, videoStart: 0 }] },
        s1_qf_4: { file: S1_QF4_FILE, segments: [{ streamStart: 0, videoStart: 0 }] },
        s1_sf_1: { file: S1_SF1_FILE, segments: [{ streamStart: 0, videoStart: 0 }] },
        s1_sf_2: { file: S1_SF2_FILE, segments: [{ streamStart: 0, videoStart: 0 }] },
        s1_gf_1: { file: S1_GF1_FILE, segments: [{ streamStart: 0, videoStart: 0 }] },

        s1_playin_1: { file: 'chats/Season 1 2024/Play Ins/TCS Any_ LADDER LEAGUE  PLAYINS MATCH 1  PHANTOM (21) VS NOLAN (24) VS APPLE (25) 2141490209.json', segments: [{ streamStart: 0, videoStart: 0 }] },
        s1_playin_2: { file: 'chats/Season 1 2024/Play Ins/TCS Any_ LADDER LEAGUE  PLAYINS MATCH 2  ANONYMOUS (22) VS YAHOOTLES (23) VS RAPHO 2141829802.json', segments: [{ streamStart: 0, videoStart: 0 }] },
        s1_playin_3: { file: 'chats/Season 1 2024/Play Ins/TCS Any_ LADDER LEAGUE  PLAYINS FINAL  GILDETPHANTOM (21) VS ANONYMOUS (22) 2143340582.json', segments: [{ streamStart: 0, videoStart: 0 }] },

        s1_1_1: { file: 'chats/Season 1 2024/WEEK 1/TCS Any_ LADDER LEAGUE  WEEK 1 RUNG 1  ZAC (1) VS GINGER (2) VS JARED (3) 2145237748.json', segments: [{ streamStart: 0, videoStart: 0 }] },
        s1_1_2: { file: 'chats/Season 1 2024/WEEK 1/ANY_ LADDER LEAGUE  WEEK 1 RUNG 2  EROADHOUSE (4) vs WIISUPER (5) vs SCYNOR (6) 2150263719.json', segments: [{ streamStart: 0, videoStart: 0 }] },
        s1_1_3: { file: 'chats/Season 1 2024/WEEK 1/[5-13-24] LEGOSpeedruns2 - ANY_ LADDER LEAGUE ｜ WEEK 1 RUNG 3 ｜ FROSTBYTE (7) JABLAKY (8) EJPMAN (9) - Chat.json', segments: [{ streamStart: 0, videoStart: 0 }] },
        s1_1_4: { file: 'chats/Season 1 2024/WEEK 1/ANY_ LADDER LEAGUE  WEEK 1 RUNG 4  HAMSTER (10) vs LAZER (11) vs CORE (12) 2148542133.json', segments: [{ streamStart: 0, videoStart: 0 }] },
        s1_1_5: { file: 'chats/Season 1 2024/WEEK 1/ANY_ LADDER LEAGUE  WEEK 1 RUNG 5  HERASMIE (13) vs GARRISON (14) vs REVVYLO (15) 2148254977.json', segments: [{ streamStart: 0, videoStart: 0 }] },
        s1_1_6: { file: 'chats/Season 1 2024/WEEK 1/ANY_ LADDER LEAGUE  WEEK 1 RUNG 6  FLUP (16) VS CHARZIGHT (17) VS ANORAK (18) 2145812298.json', segments: [{ streamStart: 0, videoStart: 0 }] },
        s1_1_7: { file: 'chats/Season 1 2024/WEEK 1/ANY_ LADDER LEAGUE  WEEK 1 RUNG 7  ZOTA (19) vs TWICELYTE (20) vs PHANTOM (21) 2149335031.json', segments: [{ streamStart: 0, videoStart: 0 }] },
        s1_1_8: { file: 'chats/Season 1 2024/WEEK 1/ANY_ LADDER LEAGUE  WEEK 1 RUNG 8  ANONYMOUS (22) vs NOLAN (24) vs RAPHO (26) 2148254285.json', segments: [{ streamStart: 0, videoStart: 0 }] },

        s1_2_1: { file: 'chats/Season 1 2024/WEEK 2/ANY_ LADDER LEAGUE  WEEK 2 RUNG 1  GINGER (2) vs WIISUPER (5) vs SCYNOR (6) 2151960842.json', segments: [{ streamStart: 0, videoStart: 0 }] },
        s1_2_3: { file: 'chats/Season 1 2024/WEEK 2/ANY_ LADDER LEAGUE  WEEK 2 RUNG 3  EROADHOUSE (4) VS LAZER (11) VS HAMSTER (10) 2157243974.json', segments: [{ streamStart: 0, videoStart: 0 }] },
        s1_2_4: { file: 'chats/Season 1 2024/WEEK 2/ANY_ LADDER LEAGUE  WEEK 2 RUNG 4  JABLAKY (8) vs HERASMIE (13) vs REVVYLO (15) 2154315221.json', segments: [{ streamStart: 0, videoStart: 0 }] },
        s1_2_5: { file: 'chats/Season 1 2024/WEEK 2/ANY_ LADDER LEAGUE  WEEK 2 RUNG 5  CORE (12) vs FLUP (16) vs CHARZIGHT (17) 2151706459.json', segments: [{ streamStart: 0, videoStart: 0 }] },
        s1_2_6: { file: 'chats/Season 1 2024/WEEK 2/ANY_ LADDER LEAGUE  WEEK 2 RUNG 6  GARRISON (14) vs TWICELYTE (20) vs PHANTOM (21) 2152556518.json', segments: [{ streamStart: 0, videoStart: 0 }] },
        s1_2_7: { file: 'chats/Season 1 2024/WEEK 2/ANY_ LADDER LEAGUE  WEEK 2 RUNG 7  ANORAK (18) vs THENZOTA (19) vs NOLAN (24) 2155516541.json', segments: [{ streamStart: 0, videoStart: 0 }] },

        s1_3_1: { file: 'chats/Season 1 2024/WEEK 3/ANY_ LADDER LEAGUE  WEEK 3 RUNG 1  JARED (3) vs SCYNOR (6) vs FROST (7) 2158867194.json', segments: [{ streamStart: 0, videoStart: 0 }] },
        s1_3_3: { file: 'chats/Season 1 2024/WEEK 3/ANY_ LADDER LEAGUE  WEEK 3 RUNG 3  JABLAKY (8) vs EJPMAN (9) vs HERASMIE (13) 2158607180.json', segments: [{ streamStart: 0, videoStart: 0 }] },
        s1_3_4: { file: 'chats/Season 1 2024/WEEK 3/[5-29-24] LEGOSpeedruns2 - TCS Any_： LADDER LEAGUE ｜ WEEK 3 RUNG 4 ｜ DAHAMSTER (10) FLUP (16) CHARZIGHT (17) - Chat.json', segments: [{ streamStart: 0, videoStart: 0 }] },
        s1_3_5: { file: 'chats/Season 1 2024/WEEK 3/ANY_ LADDER LEAGUE  WEEK 3 RUNG 5  GARRISON (14) vs REVVYLO (15) vs TWICELYTE (20) 2160283894.json', segments: [{ streamStart: 0, videoStart: 0 }] },
        s1_3_6: { file: 'chats/Season 1 2024/WEEK 3/ANY_ LADDER LEAGUE  WEEK 3 RUNG 6  CORE (12) vs PHANTOM (21) vs ZOTA (18) Part 1 2161314457.json', segments: [{ streamStart: 0, videoStart: 0 }] },

        s1_4_1: { file: 'chats/Season 1 2024/WEEK 4/ANY_ LADDER LEAGUE  WEEK 4 RUNG 1  JARED (3) vs. EROADHOUSE (4) vs. WIISUPER (5) 2172443834.json', segments: [{ streamStart: 0, videoStart: 0 }] },
        s1_4_2: { file: 'chats/Season 1 2024/WEEK 4/ANY_ LADDER LEAGUE  WEEK 4 RUNG 2  SCYNOR (6) vs. EJPMAN (9) vs. HERASMIE (13) 2173367912.json', segments: [{ streamStart: 0, videoStart: 0 }] },
        s1_4_3: { file: 'chats/Season 1 2024/WEEK 4/ANY_ LADDER LEAGUE  WEEK 4 RUNG 3  HAMSTER (10) VS LAZER (11) VS FLUP (16) 2170548641.json', segments: [{ streamStart: 0, videoStart: 0 }] },
        s1_4_4: { file: 'chats/Season 1 2024/WEEK 4/ANY_ LADDER LEAGUE  WEEK 4 RUNG 4  JABLAKY (8) VS GARRISON (14) VS REVVYLO (15) 2170735334.json', segments: [{ streamStart: 0, videoStart: 0 }] },
        s1_4_5: { file: 'chats/Season 1 2024/WEEK 4/ANY_ LADDER LEAGUE  WEEK 4 RUNG 5  CHARZIGHT (17) VS TWICELYTE (20) VS PHANTOM (21) 2168796720.json', segments: [{ streamStart: 0, videoStart: 0 }] },

        s1_5_1: { file: 'chats/Season 1 2024/WEEK 5/ANY_ LADDER LEAGUE  WEEK 5 RUNG 1  JARED (3) vs. SCYNOR (6) vs. EJPMAN (9) 2176693712.json', segments: [{ streamStart: 0, videoStart: 0 }] },
        s1_5_2: { file: 'chats/Season 1 2024/WEEK 5/ANY_ LADDER LEAGUE  WEEK 5 RUNG 2  WIISUPER (5) vs. DAHAMSTER (10) vs. FLAMINGLAZER (11) 2176300892.json', segments: [{ streamStart: 0, videoStart: 0 }] },
        s1_5_3: { file: 'chats/Season 1 2024/WEEK 5/ANY_ LADDER LEAGUE  WEEK 5 RUNG 3  HERASMIE (13) vs. GARRISON (14) vs. REVVYLO (15) 2176693710.json', segments: [{ streamStart: 0, videoStart: 0 }] },

        s1_6_1: { file: 'chats/Season 1 2024/WEEK 6/ANY_ LADDER LEAGUE  WEEK 6 RUNG 1  WIISUPER (5) vs. EJP (9) vs. LAZER (11) 2183247154.json', segments: [{ streamStart: 0, videoStart: 0 }] },
        s1_6_2: { file: 'chats/Season 1 2024/WEEK 6/ANY_ LADDER LEAGUE  WEEK 6 RUNG 2  JARED (3) vs. HERASMIE (13) vs. REVVYLO (15) 2188775875.json', segments: [{ streamStart: 0, videoStart: 0 }] },
        s1_6_3: { file: 'chats/Season 1 2024/WEEK 6/ANY_ LADDER LEAGUE  WEEK 6 RUNG 3  JABLAKY (8) vs. HAMSTER (10) vs. GARRISON (14) 2185392354.json', segments: [{ streamStart: 0, videoStart: 0 }] },

        s1_7_1: { file: 'chats/Season 1 2024/WEEK 7/ANY_ LADDER LEAGUE  WEEK 7 RUNG 1  JARED (3) vs. EJP (9) vs. HERASMIE (13) 2191928871.json', segments: [{ streamStart: 0, videoStart: 0 }] },
        s1_7_2: { file: 'chats/Season 1 2024/WEEK 7/ANY_ LADDER LEAGUE  WEEK 7 RUNG 2  HAMSTER (10) vs. LAZER (11) vs. REVVYLO (15) 2188770899.json', segments: [{ streamStart: 0, videoStart: 0 }] },

        s1_8_1: { file: 'chats/Season 1 2024/WEEK 8/ANY_ LADDER LEAGUE  WEEK 8 RUNG 1  EJP (9) vs. HAMSTER (10) vs. HERASMIE (13) 2195431937.json', segments: [{ streamStart: 0, videoStart: 0 }] },

        qf_1: { file: QF_TOP8_FILE, segments: [
          { streamStart: QF1_START, streamEnd: QF1_CUT_OUT, videoStart: 0 },
          { streamStart: QF1_CUT_IN, videoStart: QF1_CUT_OUT - QF1_START },
        ] },
        qf_2: { file: QF_TOP8_FILE, segments: [{ streamStart: 3 * 3600 + 58 * 60 + 25, videoStart: 0 }] },
        qf_3: { file: QF_TOP8_FILE, segments: [{ streamStart: 7 * 3600 +  5 * 60 + 50, videoStart: 0 }] },
        qf_4: { file: QF_TOP8_FILE, segments: [{ streamStart: 10 * 3600 + 12 * 60 + 56, videoStart: 0 }] },
        sf_1: { file: SF_TOP8_FILE, segments: [{ streamStart: 0 * 3600 + 14 * 60 + 37, videoStart: 0 }] },
        sf_2: { file: SF_TOP8_FILE, segments: [{ streamStart: 3 * 3600 + 33 * 60 + 34, videoStart: 0 }] },
        tp_1: { file: GF_DAY_TOP8_FILE, segments: [{ streamStart: 0 * 3600 + 19 * 60 + 58, videoStart: 0 }] },
        gf_1: { file: GF_DAY_TOP8_FILE, segments: [{ streamStart: 3 * 3600 + 29 * 60 + 36, videoStart: 0 }] },

        //ladder matches - offsets computed from (video's actual start time, converted to UTC)
        //minus (this file's stream created_at). "no offset" ones were confirmed directly.
        '1_1': { file: W1R1_FILE, segments: [{ streamStart: 14 * 60 + 26, videoStart: 0 }] },           // 0:14:26
        '1_2': { file: W1R2_FILE, segments: [{ streamStart: 0, videoStart: 0 }] },
        '1_3': { file: W1R356_FILE, segments: [{ streamStart: 6 * 3600 + 9 * 60, videoStart: 0 }] },     // 6:09:00
        '1_4': { file: W1R4_FILE, segments: [{ streamStart: 0, videoStart: 0 }] },
        '1_5': { file: W1R356_FILE, segments: [{ streamStart: 2 * 3600 + 50 * 60 + 47, videoStart: 0 }] }, // 2:50:47
        '1_7': { file: W1R7_FILE, segments: [{ streamStart: 0, videoStart: 0 }] },
        '2_1': { file: W2R51_FILE, segments: [{ streamStart: 3 * 3600 + 5 * 60 + 30, videoStart: 0 }] }, // 3:05:30
        '2_3': { file: W2R3_FILE, segments: [{ streamStart: 27 * 60 + 53, videoStart: 0 }] },            // 0:27:53
        '2_4': { file: W2R46_FILE, segments: [{ streamStart: 1 * 60 + 22, videoStart: 0 }] },            // 0:01:22
        '2_5': { file: W2R51_FILE, segments: [{ streamStart: 5 * 60 + 54, videoStart: 0 }] },            // 0:05:54
        '2_6': { file: W2R46_FILE, segments: [{ streamStart: 3 * 3600 + 9 * 60 + 59, videoStart: 0 }] }, // 3:09:59
        '3_1': { file: W3R1_FILE, segments: [{ streamStart: 10 * 60 + 8, videoStart: 0 }] },             // 0:10:08
        '3_3': { file: W3R23_FILE, segments: [{ streamStart: 3 * 3600 + 2 * 60 + 18, videoStart: 0 }] }, // 3:02:18
        '3_4': { file: W3R4_FILE, segments: [{ streamStart: 0, videoStart: 0 }] },
        '3_5': { file: W3R5_FILE, segments: [{ streamStart: 0, videoStart: 0 }] },
        '4_1': { file: W4R1_FILE, segments: [{ streamStart: 2, videoStart: 0 }] },                     // 0:02
        '4_2': { file: W4R2_FILE, segments: [{ streamStart: 21 * 60 + 26, videoStart: 0 }] },           // 21:26
        '4_3': { file: W4R3_FILE, segments: [{ streamStart: 0, videoStart: 0 }] },
        '4_4': { file: W4R4_FILE, segments: [{ streamStart: 0, videoStart: 0 }] },
        '5_1': { file: W5R1_FILE, segments: [{ streamStart: 4 * 60 + 42, videoStart: 0 }] },           // 4:42
        '5_2': { file: W5R2_FILE, segments: [{ streamStart: 0, videoStart: 0 }] },
        '5_3': { file: W5R3_FILE, segments: [{ streamStart: 5 * 60 + 51, videoStart: 0 }] },           // 5:51
        '6_1': { file: W6R1_FILE, segments: [{ streamStart: 1 * 60 + 42, videoStart: 0 }] },           // 1:42
        '6_2': { file: W6R2_FILE, segments: [{ streamStart: 0, videoStart: 0 }] },
        '7_1': { file: W7R1_FILE, segments: [{ streamStart: 0, videoStart: 0 }] },
        '8_1': { file: WILDCARD_FILE, segments: [{ streamStart: 8, videoStart: 0 }] },                 // 0:08

        //LCQ days - no offset for now
        lcq_1: { file: LCQ1_FILE, segments: [{ streamStart: 0, videoStart: 0 }] },
        lcq_2: { file: LCQ2_FILE, segments: [{ streamStart: 0, videoStart: 0 }] },
      };

      function mapStreamTimeToVideoTime(segments, streamOffset) {
        for (let i = 0; i < segments.length; i++) {
          const seg = segments[i];
          const end = seg.streamEnd != null ? seg.streamEnd : (segments[i + 1] ? segments[i + 1].streamStart : Infinity);
          if (streamOffset >= seg.streamStart && streamOffset < end) return seg.videoStart + (streamOffset - seg.streamStart);
        }
        return null;
      }

      let overlay = null, modalEl = null, player = null, chatPanel = null, chatMessagesEl = null, openToken = 0;
      let chatSyncTimer = null;
      let chatState = { comments: [], renderedCount: 0, badgeMap: {}, emoteMap: {}, sevenTvMap: {} };

      function embeddedImageMime(base64) {
        if (base64.startsWith('iVBORw0KGgo')) return 'image/png';
        if (base64.startsWith('R0lGOD'))      return 'image/gif';
        if (base64.startsWith('UklGR'))       return 'image/webp';
        return 'image/png';
      }

      function buildEmbeddedMaps(embeddedData) {
        const badgeMap = {}, emoteMap = {}, sevenTvMap = {};
        for (const b of (embeddedData && embeddedData.twitchBadges) || []) {
          for (const [version, info] of Object.entries(b.versions || {})) {
            if (info.bytes) badgeMap[`${b.name}/${version}`] = { url: `data:${embeddedImageMime(info.bytes)};base64,${info.bytes}`, title: info.title || b.name };
          }
        }
        for (const e of (embeddedData && embeddedData.firstParty) || []) {
          if (e.id && e.data) emoteMap[e.id] = `data:${embeddedImageMime(e.data)};base64,${e.data}`;
        }
        for (const e of (embeddedData && embeddedData.thirdParty) || []) {
          if (e.name && e.data) sevenTvMap[e.name] = `data:${embeddedImageMime(e.data)};base64,${e.data}`;
        }
        return { badgeMap, emoteMap, sevenTvMap };
      }

      function extractYouTubeId(url) {
        const m = url.match(/(?:youtube(?:-nocookie)?\.com\/(?:watch\?v=|embed\/|live\/)|youtu\.be\/)([a-zA-Z0-9_-]{6,})/);
        return m ? m[1] : null;
      }

      function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
      }

      function buildOverlay() {
        overlay = document.createElement('div');
        overlay.className = 'vod-modal-overlay';
        overlay.innerHTML = `
          <div class="vod-modal">
            <button class="vod-modal-close" aria-label="Close video">&times;</button>
            <div class="vod-modal-body">
              <div class="vod-modal-player"></div>
              <div class="vod-modal-chat">
                <div class="vod-chat-header">Chat Replay</div>
                <div class="vod-chat-messages"></div>
              </div>
            </div>
          </div>
        `;
        modalEl = overlay.querySelector('.vod-modal');
        player = overlay.querySelector('.vod-modal-player');
        chatPanel = overlay.querySelector('.vod-modal-chat');
        chatMessagesEl = overlay.querySelector('.vod-chat-messages');
        overlay.querySelector('.vod-modal-close').addEventListener('click', closeVodModal);
        overlay.addEventListener('click', e => { if (e.target === overlay) closeVodModal(); });
        document.body.appendChild(overlay);

        chatMessagesEl.addEventListener('mouseover', e => {
          const wrap = e.target.closest('.vod-emote-wrap');
          const tip = wrap && wrap.querySelector('.vod-emote-tooltip');
          if (!tip) return;
          const margin = 6;
          const boundsRect = chatMessagesEl.getBoundingClientRect();
          const wrapRect = wrap.getBoundingClientRect();
          const tipWidth = tip.offsetWidth;
          if (!tipWidth) return;
          const minLeft = boundsRect.left + margin;
          const maxLeft = boundsRect.right - margin - tipWidth;
          const centeredLeft = wrapRect.left + wrapRect.width / 2 - tipWidth / 2;
          const clampedLeft = Math.max(minLeft, Math.min(centeredLeft, maxLeft));
          tip.style.transform = 'none';
          tip.style.left = `${clampedLeft - wrapRect.left}px`;
        });
      }

      const MAX_RENDERED_MESSAGES = 150;

      function stopChatSync() {
        if (chatSyncTimer) { clearInterval(chatSyncTimer); chatSyncTimer = null; }
        chatState = { comments: [], renderedCount: 0, badgeMap: {}, emoteMap: {}, sevenTvMap: {} };
      }

      function emoteHtml(url, name) {
        return `<span class="vod-emote-wrap"><img class="vod-chat-emote" src="${url}" alt="${escapeHtml(name)}"><span class="vod-emote-tooltip"><img class="vod-emote-tooltip-img" src="${url}" alt=""><span class="vod-emote-tooltip-name">${escapeHtml(name)}</span></span></span>`;
      }

      function renderTextFragment(text, sevenTvMap) {
        return text.split(/(\s+)/).map(token => {
          if (!token || /^\s+$/.test(token)) return escapeHtml(token);
          const url = sevenTvMap[token];
          return url ? emoteHtml(url, token) : escapeHtml(token);
        }).join('');
      }

      function chatMessageHtml(c) {
        const badgesHtml = c.badges.map(b => {
          const badge = chatState.badgeMap[`${b._id}/${b.version}`];
          if (!badge) return '';
          return `<img class="vod-chat-badge" src="${badge.url}" alt="${escapeHtml(badge.title)}" title="${escapeHtml(badge.title)}">`;
        }).join('');

        let hostMessage = false;
        let numRaiders = 0;
        let raiderName = "";
        const hostMessageRegex = /^(\d+)\s+raiders\s+from\s+([a-zA-Z]+)\s+have\s+joined!$/;

        const textHtml = c.fragments.map(f => {
          const match = f?.text?.trim().match(hostMessageRegex);
          if (match) {
            numRaiders = parseInt(match[1]);
            raiderName = match[2];
            hostMessage = true;
          }
          
          const id = f.emoticon && f.emoticon.emoticon_id;
          if (id) {
            const url = chatState.emoteMap[id] || `https://static-cdn.jtvnw.net/emoticons/v2/${encodeURIComponent(id)}/default/dark/1.0`;
            return emoteHtml(url, f.text);
          }
          return renderTextFragment(f.text, chatState.sevenTvMap);
        }).join('');
        
        if(hostMessage)
        {
          return `<div class="vod-chat-message host-highlight"><b>${raiderName}</b> is raiding with a party of <b>${numRaiders}</b>.</div>`;
        }

        return `<div class="vod-chat-message"><span class="vod-chat-namegroup">${badgesHtml}<span class="vod-chat-author" style="color:${escapeHtml(c.color)}">${escapeHtml(c.name)}:</span></span>${textHtml}</div>`;
      }

      function pinChatToBottomIfNear() {
        if (chatMessagesEl.scrollTop + chatMessagesEl.clientHeight >= chatMessagesEl.scrollHeight - 40) {
          chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
        }
      }

      function bindImageLoadRescroll() {
        chatMessagesEl.querySelectorAll('img:not([data-scroll-bound])').forEach(img => {
          img.dataset.scrollBound = '1';
          if (!img.complete) img.addEventListener('load', pinChatToBottomIfNear, { once: true });
        });
      }

      function renderChatUpTo(currentTime) {
        const { comments } = chatState;
        let lo = 0, hi = comments.length;
        while (lo < hi) {
          const mid = (lo + hi) >> 1;
          if (comments[mid].t <= currentTime) lo = mid + 1; else hi = mid;
        }
        const targetCount = lo;
        if (targetCount === chatState.renderedCount) return;

        const nearBottom = chatMessagesEl.scrollTop + chatMessagesEl.clientHeight >= chatMessagesEl.scrollHeight - 40;
        if (targetCount < chatState.renderedCount) {
          const start = Math.max(0, targetCount - MAX_RENDERED_MESSAGES);
          chatMessagesEl.innerHTML = comments.slice(start, targetCount).map(chatMessageHtml).join('');
        } else {
          const start = Math.max(chatState.renderedCount, targetCount - MAX_RENDERED_MESSAGES);
          chatMessagesEl.insertAdjacentHTML('beforeend', comments.slice(start, targetCount).map(chatMessageHtml).join(''));
          while (chatMessagesEl.children.length > MAX_RENDERED_MESSAGES) {
            chatMessagesEl.removeChild(chatMessagesEl.firstElementChild);
          }
        }
        chatState.renderedCount = targetCount;
        bindImageLoadRescroll();
        if (nearBottom) chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
      }

      async function loadChatReplay(config, ytPlayer, myToken) {
        chatMessagesEl.innerHTML = '<div class="vod-chat-loading">Loading chat…</div>';
        let data;
        try {
          data = await fetch(encodeURI(config.file)).then(r => r.json());
        } catch (err) {
          if (myToken === openToken) chatMessagesEl.innerHTML = '<div class="vod-chat-loading">Chat replay unavailable.</div>';
          return;
        }
        if (myToken !== openToken) return;

        const comments = (data.comments || [])
          .map(c => {
            const t = mapStreamTimeToVideoTime(config.segments, c.content_offset_seconds);
            if (t === null) return null;
            return {
              t,
              name: (c.commenter && c.commenter.display_name) || 'anonymous',
              color: (c.message && c.message.user_color) || '#9aaabb',
              fragments: (c.message && c.message.fragments && c.message.fragments.length) ? c.message.fragments : [{ text: (c.message && c.message.body) || '', emoticon: null }],
              badges: (c.message && c.message.user_badges) || [],
            };
          })
          .filter(Boolean)
          .sort((a, b) => a.t - b.t);

        const { badgeMap, emoteMap, sevenTvMap } = buildEmbeddedMaps(data.embeddedData);

        chatMessagesEl.innerHTML = '';
        chatState = { comments, renderedCount: 0, badgeMap, emoteMap, sevenTvMap };
        renderChatUpTo(0);
        chatSyncTimer = setInterval(() => {
          if (myToken !== openToken) { stopChatSync(); return; }
          renderChatUpTo(ytPlayer.getCurrentTime ? ytPlayer.getCurrentTime() : 0);
        }, 500);
      }

      function closeVodModal() {
        if (!overlay) return;
        openToken++;
        overlay.classList.remove('open');
        modalEl.classList.remove('with-chat');
        player.innerHTML = '';
        stopChatSync();
        chatMessagesEl.innerHTML = '';
        if (window.__resumeStarfield) window.__resumeStarfield();
      }

      function openVodModal(videoId, watchUrl, matchKey) {
        if (!overlay) buildOverlay();
        const myToken = ++openToken;
        player.innerHTML = '';
        stopChatSync();
        chatMessagesEl.innerHTML = '';
        const chatConfig = CHAT_REPLAYS[matchKey] || null;
        modalEl.classList.toggle('with-chat', !!chatConfig);
        const target = document.createElement('div');
        player.appendChild(target);
        overlay.classList.add('open');
        if (window.__pauseStarfield) window.__pauseStarfield();
        loadYouTubeIframeAPI().then(YT => {
          if (myToken !== openToken) return; //modal closed/reopened before the API finished loading
          new YT.Player(target, {
            videoId,
            playerVars: { autoplay: 1, rel: 0, cc_load_policy: 0, origin: window.location.origin },
            events: {
              onReady: (e) => {
                disableCaptions(e);
                if (chatConfig) loadChatReplay(chatConfig, e.target, myToken);
              },
              onError: (e) => {
                console.error('[vod modal] YouTube player error, code:', e.data, 'videoId:', videoId);
                if (myToken === openToken) player.innerHTML = youtubeErrorHtml(watchUrl);
              },
            },
          });
        });
      }

      document.addEventListener('keydown', e => { if (e.key === 'Escape' && overlay && overlay.classList.contains('open')) closeVodModal(); });

      document.addEventListener('click', e => {
        const card = e.target.closest('a.top8-match.done');
        if (!card || !card.href) return;
        const videoId = extractYouTubeId(card.href);
        if (!videoId) return;
        e.preventDefault();
        const idMatch = card.id && card.id.match(/^top8-card-([a-z]+)-(\d+)$/);
        const matchKey = card.dataset.match || (idMatch ? `${idMatch[1]}_${idMatch[2]}` : null);
        openVodModal(videoId, card.href, matchKey);
      });

      //ladder bracket cards already carry their week_rung key via dataset.match
      document.addEventListener('click', e => {
        const card = e.target.closest('a.bracket-match.done');
        if (!card || !card.href) return;
        const videoId = extractYouTubeId(card.href);
        if (!videoId) return;
        e.preventDefault();
        openVodModal(videoId, card.href, card.dataset.match || null);
      });

      document.addEventListener('click', e => {
        const card = e.target.closest('a.runner-match-row.has-vod');
        if (!card || !card.href) return;
        const videoId = extractYouTubeId(card.href);
        if (!videoId) return;
        e.preventDefault();
        openVodModal(videoId, card.href, card.dataset.match || null);
      });

      document.addEventListener('click', e => {
        const card = e.target.closest('a.participant-card[data-runner-profile]');
        if (!card) return;
        e.preventDefault();
        window._openRunnerProfile && window._openRunnerProfile(decodeURIComponent(card.dataset.runnerProfile));
      });
    })();

    //scroll reveal animations
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
        }
      });
    }, { threshold: 0.1 });

    function observeAll() {
      document.querySelectorAll('.participant-card, .runner-card, .reveal, .reveal-left, .reveal-scale').forEach(el => {
        observer.observe(el);
      });
    }

    //auto refresh when switching pages so it doesn't break the first time
    document.querySelectorAll('[data-page]').forEach(link => {
      link.addEventListener('click', () => {
        setTimeout(observeAll, 50);
      });
    });

    observeAll();

    function goToStandings(tab) {
      showPage('standings', true);
      //make season dropdown default to s3 in this case
      const _dd = document.getElementById('standings-season-dropdown');
      if (_dd) {
        const _lbl = document.getElementById('standings-season-label');
        if (_lbl) _lbl.textContent = 'Season 3';
        _dd.querySelectorAll('.season-dropdown-item').forEach(el => el.classList.toggle('active', el.dataset.sseason === '3'));
        _dd.classList.remove('open');
      }
      const s3El = document.getElementById('standings-s3');
      const pastEl = document.getElementById('standings-past');
      const s3Tabs   = document.getElementById('standings-s3-tabs');
      const pastTabs = document.getElementById('standings-past-tabs');
      if (s3El) s3El.style.display = '';
      if (pastEl) pastEl.style.display = 'none';
      if (s3Tabs)   s3Tabs.style.display = '';
      if (pastTabs) pastTabs.style.display = 'none';
      document.querySelectorAll('#standings-s3-tabs .standings-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('#standings-s3 .standings-tab-panel').forEach(p => p.classList.remove('active'));
      document.querySelector(`#standings-s3-tabs .standings-tab[data-tab="${tab}"]`).classList.add('active');
      document.getElementById(`standings-tab-${tab}`).classList.add('active');
      window.scrollTo(0, 0);
      setTimeout(observeAll, 50);
    }


