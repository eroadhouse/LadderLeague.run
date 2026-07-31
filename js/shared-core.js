    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    window.scrollTo(0, 0);

    (function() {
      const params = new URLSearchParams(window.location.search);
      const route = params.get('route');
      if (route) {
        params.delete('route');
        const qs = params.toString();
        history.replaceState(null, '', route + (qs ? '?' + qs : ''));
      }
    })();

    const PAGE_TO_PATH = { home: '/', standings: '/standings', participants: '/participants', format: '/format', about: '/about', stats: '/statistics', content: '/content' };
    const PATH_TO_PAGE = { '/': 'home', '/standings': 'standings', '/participants': 'participants', '/format': 'format', '/about': 'about', '/statistics': 'stats', '/content': 'content' };

    function showPage(target, addHistory) {
      const page = document.getElementById(target);
      if (!page) return;
      document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
      document.querySelectorAll('.nav-links a').forEach(a => a.classList.remove('active'));
      page.classList.add('active');
      document.querySelectorAll(`.nav-links a[data-page="${target}"]`).forEach(a => a.classList.add('active'));
      if (addHistory) history.pushState({ page: target }, '', PAGE_TO_PATH[target] || '/');
      if (target === 'stats' && window._statsRender) window._statsRender();
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
            if (name && time) places.push({ name, time });
          }
          places.sort((a, b) => toSecs(a.time) - toSecs(b.time));
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



    // this was the starfield animating but we do not need this anymore
    (function() {
      const canvas = document.getElementById('starfield');
      const ctx = canvas.getContext('2d');
      let stars = [];
      const COUNT = 60;

      function resize() {
        canvas.width  = window.innerWidth;
        canvas.height = window.innerHeight;
      }

      function rand(min, max) { return Math.random() * (max - min) + min; }

      function createStar() {
        return {
          x:        rand(0, canvas.width),
          y:        rand(0, canvas.height),
          r:        rand(0.4, 1.4),
          alpha:    rand(0.2, 0.8),
          targetAlpha: rand(0.2, 0.8),
          fadeSpeed: rand(0.003, 0.012),
          driftX:   rand(-0.06, 0.06),
          driftY:   rand(-0.04, 0.04),
          driftTimer: rand(0, 300),
          driftInterval: rand(200, 600),
          movingX:  0,
          movingY:  0,
        };
      }

      function init() {
        resize();
        stars = Array.from({ length: COUNT }, createStar);
      }

      //lowkey yoinked this entire animated star thing
      function update(s) {
        s.driftTimer++;
        if (s.driftTimer > s.driftInterval) {
          s.movingX = rand(-0.08, 0.08);
          s.movingY = rand(-0.06, 0.06);
          s.driftTimer = 0;
          s.driftInterval = rand(200, 600);
        }
        s.x += s.movingX;
        s.y += s.movingY;
        s.movingX *= 0.97;
        s.movingY *= 0.97;

        if (s.x < 0) s.x = canvas.width;
        if (s.x > canvas.width) s.x = 0;
        if (s.y < 0) s.y = canvas.height;
        if (s.y > canvas.height) s.y = 0;

        if (Math.abs(s.alpha - s.targetAlpha) < 0.01) {
          s.targetAlpha = rand(0.1, 0.85);
        }
        s.alpha += (s.targetAlpha - s.alpha) * s.fadeSpeed;
      }

      let rafId = null;
      function draw() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        for (const s of stars) {
          update(s);
          ctx.beginPath();
          ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(200, 215, 240, ${s.alpha})`;
          ctx.fill();
        }
        rafId = requestAnimationFrame(draw);
      }

      window.__pauseStarfield = () => { if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; } };
      window.__resumeStarfield = () => { if (rafId === null) draw(); };

      window.addEventListener('resize', () => { resize(); });
      init();
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

      const QF1_START   = 18 * 60 + 33;               // 0:18:33
      const QF1_CUT_OUT = 2 * 3600 + 12 * 60 + 48;    // 2:12:48
      const QF1_CUT_IN  = 2 * 3600 + 53 * 60 + 17;    // 2:53:17
      const CHAT_REPLAYS = {
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
        const textHtml = c.fragments.map(f => {
          const id = f.emoticon && f.emoticon.emoticon_id;
          if (id) {
            const url = chatState.emoteMap[id] || `https://static-cdn.jtvnw.net/emoticons/v2/${encodeURIComponent(id)}/default/dark/1.0`;
            return emoteHtml(url, f.text);
          }
          return renderTextFragment(f.text, chatState.sevenTvMap);
        }).join('');
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
        const idMatch = card.id && card.id.match(/-([a-z]+)-(\d+)$/);
        const matchKey = idMatch ? `${idMatch[1]}_${idMatch[2]}` : null;
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
      document.querySelectorAll('.participant-card, .reveal, .reveal-left, .reveal-scale').forEach(el => {
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

