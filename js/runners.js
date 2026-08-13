    (function initRunners() {
      const grid            = document.getElementById('runners-grid');
      const detail          = document.getElementById('runner-detail');
      const detailPhoto     = document.getElementById('runner-detail-photo');
      const detailPhotoBg   = document.getElementById('runner-detail-photo-bg');
      const detailPhotoImg  = document.getElementById('runner-detail-photo-img');
      const detailName      = document.getElementById('runner-detail-name');
      const detailFlag      = document.getElementById('runner-detail-flag');
      const detailRealName  = document.getElementById('runner-detail-realname');
      const detailPills     = document.getElementById('runner-detail-pills');
      const detailAchvBadges = document.getElementById('runner-detail-achv-badges');
      const detailSocials    = document.getElementById('runner-detail-socials');
      const panelInfo         = document.getElementById('runner-detail-panel-info');
      const panelMatches      = document.getElementById('runner-detail-panel-matches');
      const panelAchievements = document.getElementById('runner-detail-panel-achievements');
      const backBtn      = document.getElementById('runner-back-btn');
      const pageTitle    = document.querySelector('#runners .page-title');
      const pageDivider  = document.querySelector('#runners .divider');
      if (!grid || !detail) return;

      let runnersData = null;
      let activeRunner = null;

      function fmtCalendarDate(dateStr) {
        if (!dateStr) return '';
        const m = String(dateStr).match(/^(\d{4})-(\d{2})-(\d{2})/);
        const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(dateStr);
        return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
      }

      function runnerImageUrl(runner, hover) {
        const file = (hover && runner.hoverImage) || runner.image || `${runner.slug}.webp`;
        return encodeURI(`/assets/runners/${file}`);
      }

      function applyNameColor(el, name) {
        const c = window._nameColorMap && window._nameColorMap[name.toLowerCase()];
        el.style.background = '';
        el.style.backgroundSize = '';
        el.style.webkitBackgroundClip = '';
        el.style.backgroundClip = '';
        el.style.webkitTextFillColor = '';
        el.style.color = '';
        el.classList.remove('has-gradient-name');
        if (!c) return;
        if (c.colorFrom && c.colorTo) {
          el.style.background = `linear-gradient(90deg, ${c.colorFrom}, ${c.colorTo}, ${c.colorFrom})`;
          el.style.backgroundSize = '200% 100%';
          el.style.webkitBackgroundClip = 'text';
          el.style.backgroundClip = 'text';
          el.style.webkitTextFillColor = 'transparent';
          el.classList.add('has-gradient-name');
        } else if (c.colorSolid) {
          el.style.color = c.colorSolid;
        }
      }

      function hexToRgb(hex) {
        const h = hex.replace('#', '');
        const full = h.length === 3 ? h.split('').map(ch => ch + ch).join('') : h;
        const n = parseInt(full, 16);
        return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
      }

      function applyGlowColor(el, name) {
        const c = window._nameColorMap && window._nameColorMap[name.toLowerCase()];
        let stops;
        if (c && c.colorFrom && c.colorTo) {
          const [r1, g1, b1] = hexToRgb(c.colorFrom);
          const [r2, g2, b2] = hexToRgb(c.colorTo);
          stops = `rgba(${r1},${g1},${b1},.5) 0%, rgba(${r2},${g2},${b2},.22) 45%, rgba(${r2},${g2},${b2},0) 100%`;
        } else if (c && c.colorSolid) {
          const [r, g, b] = hexToRgb(c.colorSolid);
          stops = `rgba(${r},${g},${b},.5) 0%, rgba(${r},${g},${b},0) 100%`;
        } else {
          stops = `rgba(154,170,187,.45) 0%, rgba(154,170,187,0) 100%`;
        }
        el.style.background = `linear-gradient(to bottom, ${stops})`;
      }

      function getNameVerticalCenterPercent(card, nameEl) {
        const cardRect = card.getBoundingClientRect();
        const range = document.createRange();
        range.selectNodeContents(nameEl);
        const textRect = range.getBoundingClientRect();
        const centerY = textRect.top + textRect.height / 2;
        return ((centerY - cardRect.top) / cardRect.height) * 100;
      }

      function buildNameOutline(card, runner, verticalCenterPercent) {
        const c = window._nameColorMap && window._nameColorMap[runner.name.toLowerCase()];
        const svgNS = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(svgNS, 'svg');
        svg.setAttribute('class', 'runner-card-name-outline');
        svg.setAttribute('viewBox', '0 0 300 100');
        svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
        if (verticalCenterPercent != null) svg.style.top = `${verticalCenterPercent}%`;

        const defs = document.createElementNS(svgNS, 'defs');
        const gradId = `runner-outline-grad-${runner.slug}`;
        const grad = document.createElementNS(svgNS, 'linearGradient');
        grad.setAttribute('id', gradId);
        grad.setAttribute('x1', '0%'); grad.setAttribute('y1', '0%');
        grad.setAttribute('x2', '100%'); grad.setAttribute('y2', '0%');
        const stops = (c && c.colorFrom && c.colorTo) ? [c.colorFrom, c.colorTo]
          : (c && c.colorSolid) ? [c.colorSolid, c.colorSolid]
          : ['#9aaabb', '#9aaabb'];
        stops.forEach((color, i) => {
          const stop = document.createElementNS(svgNS, 'stop');
          stop.setAttribute('offset', `${i * 100}%`);
          stop.setAttribute('stop-color', color);
          grad.appendChild(stop);
        });
        defs.appendChild(grad);
        svg.appendChild(defs);

        const text = document.createElementNS(svgNS, 'text');
        text.setAttribute('x', '50%');
        text.setAttribute('y', '52%');
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('dominant-baseline', 'central');
        text.setAttribute('font-family', "'Aurebesh', 'Rubik', sans-serif");
        text.setAttribute('font-size', '74.3');
        text.setAttribute('font-weight', 'normal');
        text.setAttribute('fill', 'none');
        text.setAttribute('stroke', `url(#${gradId})`);
        text.setAttribute('stroke-width', '1.43');
        text.textContent = (runner.displayName || runner.name).toLowerCase();
        svg.appendChild(text);

        card.appendChild(svg);
      }

      let usernameMap = null;
      let participantsDataPromise = null;
      function getParticipantsData() {
        if (!participantsDataPromise) {
          participantsDataPromise = fetch('/data/participants.json', { cache: 'no-store' })
            .then(r => r.json())
            .catch(() => ({}));
        }
        return participantsDataPromise;
      }

      let usernameMapPromise = null;
      function getUsernameMap() {
        if (!usernameMapPromise) {
          usernameMapPromise = getParticipantsData().then(data => {
            const map = new Map();
            ['season3', 'season2', 'season1'].forEach(sk => {
              (data[sk] || []).forEach(p => {
                const key = p.name.toLowerCase();
                if (!map.has(key)) map.set(key, p.username || p.name);
              });
            });
            usernameMap = map;
            return map;
          }).catch(() => (usernameMap = new Map()));
        }
        return usernameMapPromise;
      }

      function getRunnerIdentity(runner) {
        const mapped = usernameMap && usernameMap.get(runner.name.toLowerCase());
        return (mapped || runner.name).toLowerCase();
      }

      function getSrcEntry(runner) {
        const srcPBMap = window.srcPBMap;
        if (!srcPBMap) return null;
        const mappedUsername = usernameMap && usernameMap.get(runner.name.toLowerCase());
        const srUser = (mappedUsername || runner.name).toLowerCase();
        return srcPBMap[srUser] || null;
      }

      function getRankInfo(runner) {
        const entry = getSrcEntry(runner);
        if (!entry) return null;
        const colors = { 1: '#d4b84a', 2: '#c0c0c0', 3: '#cd7f32', 4: '#4a90d4' };
        return { place: entry.place, color: colors[entry.place] || null };
      }

      let gameIdsPromise = null;
      function getBoardGameIds() {
        if (!gameIdsPromise) {
          gameIdsPromise = Promise.all(['lswtcs', 'lswtcsce'].map(abbr =>
            fetch(`https://www.speedrun.com/api/v1/games/${abbr}`)
              .then(r => r.json()).then(d => d.data?.id || null).catch(() => null)
          )).then(ids => ids.filter(Boolean));
        }
        return gameIdsPromise;
      }

      const firstRunCache = new Map();
      function getFirstRunDate(runner) {
        const entry = getSrcEntry(runner);
        if (!entry || !entry.srcId) return Promise.resolve(null);
        if (firstRunCache.has(entry.srcId)) return firstRunCache.get(entry.srcId);
        const promise = getBoardGameIds().then(gameIds => Promise.all(gameIds.map(gid =>
          fetch(`https://www.speedrun.com/api/v1/runs?user=${entry.srcId}&game=${gid}&orderby=date&direction=asc&max=1&status=verified`)
            .then(r => r.json()).then(d => d.data?.[0] || null).catch(() => null)
        ))).then(results => {
          const valid = results.filter(Boolean);
          if (!valid.length) return null;
          valid.sort((a, b) => new Date(a.date || a.submitted) - new Date(b.date || b.submitted));
          return valid[0].date || valid[0].submitted || null;
        });
        firstRunCache.set(entry.srcId, promise);
        return promise;
      }

      function getTournamentPB(runner) {
        return getMatchIndex().then(index => {
          const matches = index[runner.name.toLowerCase()] || [];
          let best = null;
          matches.forEach(m => {
            const secs = toSecs(m.time);
            if (secs !== Infinity && (best == null || secs < best)) best = secs;
          });
          return best;
        });
      }

      function computeAge(birthdate) {
        if (!birthdate) return null;
        const dob = new Date(birthdate + 'T00:00:00');
        if (isNaN(dob)) return null;
        const now = new Date();
        let age = now.getFullYear() - dob.getFullYear();
        const hadBirthdayThisYear = (now.getMonth() > dob.getMonth()) ||
          (now.getMonth() === dob.getMonth() && now.getDate() >= dob.getDate());
        if (!hadBirthdayThisYear) age--;
        return age;
      }

      function attachPillTooltips() {
        let pTip = document.getElementById('bp-shared-tooltip');
        if (!pTip) {
          pTip = document.createElement('div');
          pTip.id = 'bp-shared-tooltip';
          document.body.appendChild(pTip);
          document.addEventListener('click', () => { pTip.style.display = 'none'; });
        }
        detailPills.querySelectorAll('.runner-detail-pill-tip').forEach(el => {
          el.addEventListener('mouseenter', () => {
            pTip.style.minWidth = '0';
            pTip.style.padding = '.5rem .8rem';
            pTip.innerHTML = `<div style="font-size:.85rem;color:var(--text)">${el.dataset.tip}</div>`;
            pTip.style.display = 'block';
            pTip.style.left = '0px';
            pTip.style.top = '0px';
            const tr = pTip.getBoundingClientRect();
            const er = el.getBoundingClientRect();
            let left = er.left + er.width / 2 - tr.width / 2;
            left = Math.max(8, Math.min(left, window.innerWidth - tr.width - 8));
            const top = er.top - tr.height - 8 >= 0 ? er.top - tr.height - 8 : er.bottom + 8;
            pTip.style.left = `${left}px`;
            pTip.style.top = `${top}px`;
          });
          el.addEventListener('mouseleave', () => { pTip.style.display = 'none'; });
        });
      }

      function renderPills(runner) {
        const rank = getRankInfo(runner);
        const placementColors = { 1: '#d4b84a', 2: '#c0c0c0', 3: '#cd7f32' };
        const peak = runner.peakPlacement;
        const peakLabel = peak != null ? (typeof pOrdinal === 'function' ? pOrdinal(peak) : `#${peak}`) : '—';
        const age = computeAge(runner.birthdate);
        const pills = [
          { key: 'age', label: 'Age', value: age != null ? age : '—' },
          { key: 'rank', label: 'Rank', value: rank ? `#${rank.place}` : '—', color: rank ? rank.color : null, tip: 'Any% Leaderboard Rank' },
          { key: 'peak', label: 'Peak', value: peakLabel, color: peak != null ? (placementColors[peak] || null) : null, tip: 'Peak Any% Leaderboard Placement' },
          { key: 'firstrun', label: 'First Run', value: '—' },
          { key: 'tournamentpb', label: 'Tournament PB', value: '—' },
        ];
        detailPills.innerHTML = pills.map(p =>
          `<div class="runner-detail-pill${p.tip ? ' runner-detail-pill-tip' : ''}" data-pill="${p.key}"${p.tip ? ` data-tip="${p.tip}"` : ''}><span class="runner-detail-pill-label">${p.label}</span><span class="runner-detail-pill-value"${p.color ? ` style="color:${p.color}"` : ''}>${p.value}</span></div>`
        ).join('');
        attachPillTooltips();

        if (runner.firstRunOverride) {
          const el = detailPills.querySelector('[data-pill="firstrun"] .runner-detail-pill-value');
          if (el) el.textContent = fmtCalendarDate(runner.firstRunOverride);
        } else {
          getFirstRunDate(runner).then(dateStr => {
            if (activeRunner !== runner) return;
            const el = detailPills.querySelector('[data-pill="firstrun"] .runner-detail-pill-value');
            if (!el) return;
            el.textContent = dateStr ? fmtCalendarDate(dateStr) : '—';
          });
        }

        getTournamentPB(runner).then(secs => {
          if (activeRunner !== runner) return;
          const el = detailPills.querySelector('[data-pill="tournamentpb"] .runner-detail-pill-value');
          if (!el) return;
          el.textContent = secs != null && typeof pFmtTime === 'function' ? pFmtTime(secs) : '—';
        });
      }

      function fillStatTokens(text, wrRecords) {
        wrRecords = wrRecords || [];
        const totalWRs = wrRecords.reduce((sum, wr) => sum + wr.count, 0);
        return text
          .replace(/\{\{totalWRs\}\}/g, totalWRs)
          .replace(/\{\{wrDays:([^}]+)\}\}/g, (m, category) => {
            const rec = wrRecords.find(wr => wr.category.toLowerCase() === category.trim().toLowerCase());
            return rec && rec.daysHeld != null ? rec.daysHeld : m;
          })
          .replace(/\{\{wr:([^}]+)\}\}/g, (m, category) => {
            const rec = wrRecords.find(wr => wr.category.toLowerCase() === category.trim().toLowerCase());
            return rec ? rec.count : m;
          });
      }

      function bioHtmlFor(runner, wrRecords) {
        return runner.bio
          ? `<div class="runner-detail-bio">${fillStatTokens(runner.bio, wrRecords).split(/\n+/).filter(Boolean).map(p => `<p>${p}</p>`).join('')}</div>`
          : `<div class="runner-detail-empty"></div>`;
      }

      function renderInfoTab(runner) {
        const photos = runner.photos || [];
        const galleryHtml = !photos.length ? '' : `
          <div class="runner-detail-gallery">
            <div class="runner-detail-gallery-title">Photos of ${runner.displayName || runner.name}</div>
            <div class="runner-detail-gallery-grid">
              ${photos.map((f, i) => {
                const url = `/photos/runners/${encodeURIComponent(f)}`;
                return `<button type="button" class="runner-detail-gallery-item" data-photo-index="${i}"><img src="${url}" alt="${runner.name}" loading="lazy"></button>`;
              }).join('')}
            </div>
          </div>`;

        panelInfo.innerHTML = bioHtmlFor(runner, runner.worldRecords) + galleryHtml;

        if (photos.length) {
          panelInfo.querySelectorAll('.runner-detail-gallery-item').forEach(btn => {
            btn.addEventListener('click', () => openPhotoLightbox(runner, Number(btn.dataset.photoIndex)));
          });
        }

        if (runner.bio) {
          getLiveWorldRecords().then(map => {
            if (activeRunner !== runner) return;
            const live = liveRecordsFor(runner, map);
            if (!live) return;
            const bioEl = panelInfo.querySelector('.runner-detail-bio');
            if (bioEl) bioEl.outerHTML = bioHtmlFor(runner, live);
          });
        }
      }

      let lightboxOverlay = null, lightboxImg = null, lightboxCounter = null;
      let lightboxPhotos = [], lightboxIndex = 0;

      function buildLightbox() {
        if (lightboxOverlay) return;
        lightboxOverlay = document.createElement('div');
        lightboxOverlay.className = 'runner-lightbox-overlay';
        lightboxOverlay.innerHTML = `
          <button class="runner-lightbox-close" aria-label="Close">&times;</button>
          <button class="runner-lightbox-nav runner-lightbox-prev" aria-label="Previous photo">&#10094;</button>
          <img class="runner-lightbox-img" alt="">
          <button class="runner-lightbox-nav runner-lightbox-next" aria-label="Next photo">&#10095;</button>
          <div class="runner-lightbox-counter"></div>`;
        lightboxImg = lightboxOverlay.querySelector('.runner-lightbox-img');
        lightboxCounter = lightboxOverlay.querySelector('.runner-lightbox-counter');
        lightboxOverlay.querySelector('.runner-lightbox-close').addEventListener('click', closePhotoLightbox);
        lightboxOverlay.querySelector('.runner-lightbox-prev').addEventListener('click', () => stepLightbox(-1));
        lightboxOverlay.querySelector('.runner-lightbox-next').addEventListener('click', () => stepLightbox(1));
        lightboxOverlay.addEventListener('click', e => { if (e.target === lightboxOverlay) closePhotoLightbox(); });
        document.body.appendChild(lightboxOverlay);
      }

      function showLightboxPhoto() {
        lightboxImg.src = encodeURI(lightboxPhotos[lightboxIndex]);
        lightboxCounter.textContent = `${lightboxIndex + 1} / ${lightboxPhotos.length}`;
      }

      function stepLightbox(delta) {
        lightboxIndex = (lightboxIndex + delta + lightboxPhotos.length) % lightboxPhotos.length;
        showLightboxPhoto();
      }

      function openLightbox(photos, index) {
        buildLightbox();
        lightboxPhotos = photos || [];
        lightboxIndex = index;
        showLightboxPhoto();
        lightboxOverlay.classList.add('open');
      }
      window._openLightbox = openLightbox;

      function openPhotoLightbox(runner, index) {
        openLightbox((runner.photos || []).map(f => `/photos/runners/${f}`), index);
      }

      function closePhotoLightbox() {
        if (!lightboxOverlay) return;
        lightboxOverlay.classList.remove('open');
      }

      document.addEventListener('keydown', e => {
        if (!lightboxOverlay || !lightboxOverlay.classList.contains('open')) return;
        if (e.key === 'Escape') closePhotoLightbox();
        else if (e.key === 'ArrowLeft') stepLightbox(-1);
        else if (e.key === 'ArrowRight') stepLightbox(1);
      });

      let achievementsPromise = null;
      function getAchievements() {
        if (!achievementsPromise) {
          achievementsPromise = fetch('/data/achievements.json', { cache: 'no-store' })
            .then(r => r.json())
            .catch(() => ({ tournaments: [], placements: {} }));
        }
        return achievementsPromise;
      }

      const LIVE_WR_SHEET_URL = 'https://docs.google.com/spreadsheets/d/1JNHrwCf6pKsgqu8Bg7cLKmojSyUau4dwtXJYoJ4DRAU/gviz/tq?tqx=out:csv&range=AX54:AX60';
      const WR_SHEET_NAME_ALIASES = { dragon76: 'dragon' };

      function parseLiveWorldRecordsCsv(text) {
        const map = new Map();
        text.split(/\r?\n/).forEach(line => {
          line = line.trim();
          if (!line) return;
          const unquoted = line.replace(/^"|"$/g, '').replace(/""/g, '"');
          const rowMatch = unquoted.match(/^(.+?):\s*Total:\s*\d+\s*\|\s*(.*)$/);
          if (!rowMatch) return;
          const records = rowMatch[2].split('|').map(seg => {
            const segMatch = seg.trim().match(/^(.+?)\s*:?\s+(\d+)\s+Days,\s*(\d+)\s*$/);
            return segMatch ? { category: segMatch[1].trim(), daysHeld: Number(segMatch[2]), count: Number(segMatch[3]) } : null;
          }).filter(Boolean);
          map.set(rowMatch[1].trim().toLowerCase(), records);
        });
        return map;
      }

      function liveRecordsFor(runner, map) {
        if (!map) return null;
        const key = WR_SHEET_NAME_ALIASES[runner.name.toLowerCase()] || runner.name.toLowerCase();
        return map.get(key) || null;
      }

      let liveWorldRecordsPromise = null;
      function getLiveWorldRecords() {
        if (!liveWorldRecordsPromise) {
          liveWorldRecordsPromise = fetch(LIVE_WR_SHEET_URL)
            .then(r => r.text())
            .then(parseLiveWorldRecordsCsv)
            .catch(() => null);
        }
        return liveWorldRecordsPromise;
      }

      function placementLabel(place) {
        if (place === 1) return { text: 'Champion', cls: 'gold' };
        if (place === 2) return { text: 'Runner-Up', cls: 'silver' };
        if (place === 3) return { text: '3rd Place', cls: 'bronze' };
        const ordText = `${typeof pOrdinal === 'function' ? pOrdinal(place) : place + 'th'} Place`;
        if (place != null && place <= 8) return { text: ordText, cls: 'top8' };
        if (place != null) return { text: ordText, cls: 'outside-top8' };
        return { text: 'Competed', cls: 'none' };
      }

      const ord = n => typeof pOrdinal === 'function' ? pOrdinal(n) : `${n}th`;
      function season3PlacementLabel(place) {
        if (place === 1) return { text: '★ Champion ★', style: 'color:#d4b84a;font-weight:700' };
        if (place === 2) return { text: 'Runner-Up', style: 'color:#c0c0c0;font-weight:700' };
        if (place === 3) return { text: `${ord(3)} Place`, style: 'color:#cd7f32;font-weight:700' };
        if (place != null && place <= 8) return { text: `${ord(place)} Place`, style: 'color:#aebdd9' };
        if (place != null) return { text: `${ord(place)} Place`, style: 'color:#ba3b3b' };
        return { text: 'Competed', style: 'color:var(--dim)' };
      }

      const LLS_SEASON_KEY = { LLS1: 'season1', LLS2: 'season2', LLS3: 'season3' };

      function renderAchievementsTab(runner) {
        panelAchievements.innerHTML = `<div class="runner-detail-empty">Loading…</div>`;
        Promise.all([getAchievements(), getParticipantsData(), getUsernameMap(), getLiveWorldRecords()]).then(([achv, pdata, , liveMap]) => {
          const tournaments = achv.tournaments || [];
          const mine = (achv.placements && achv.placements[runner.slug]) || {};
          const identity = getRunnerIdentity(runner);

          const competed = new Set(Object.keys(mine));
          Object.entries(LLS_SEASON_KEY).forEach(([tourney, seasonKey]) => {
            const inRoster = (pdata[seasonKey] || []).some(p => ((p.username || p.name) || '').toLowerCase() === identity);
            if (inRoster) competed.add(tourney);
          });

          const shown = tournaments.filter(t => competed.has(t));
          if (!shown.length) {
            panelAchievements.innerHTML = `<div class="runner-detail-empty">No recorded results yet.</div>`;
            return;
          }
          const rows = shown.map(t => {
            if (t === 'LLS3') {
              const entry = (pdata.season3 || []).find(p => ((p.username || p.name) || '').toLowerCase() === identity);
              const place = entry ? window._season3Placement?.[entry.name.toLowerCase()] ?? null : null;
              const { text, style } = season3PlacementLabel(place);
              return `<tr><td>${t}</td><td class="runner-achv-placement"${style ? ` style="${style}"` : ''}>${text}</td></tr>`;
            }
            let place = mine[t];
            if (place == null && LLS_SEASON_KEY[t]) {
              const entry = (pdata[LLS_SEASON_KEY[t]] || []).find(p => ((p.username || p.name) || '').toLowerCase() === identity);
              place = entry && entry.placement != null ? entry.placement : null;
            }
            const { text, cls } = placementLabel(place);
            return `<tr><td>${t}</td><td class="runner-achv-placement ${cls}">${text}</td></tr>`;
          }).join('');
          const wrRecords = liveRecordsFor(runner, liveMap) || runner.worldRecords || [];
          const wrRows = wrRecords.map(wr =>
            `<tr><td><strong>${wr.count}x</strong> ${wr.category}</td><td>${wr.daysHeld != null ? wr.daysHeld : ''}</td></tr>`
          ).join('')
            + (wrRecords.length ? `<tr class="runner-achv-total-row"><td><strong>${wrRecords.reduce((sum, wr) => sum + wr.count, 0)}x</strong> Total WRs</td><td></td></tr>` : '');

          const barriers = runner.notableBarriers || [];
          const barrierRows = barriers.map(b =>
            `<tr><td>${b.label}</td><td>${b.date}</td></tr>`
          ).join('');

          panelAchievements.innerHTML = `
            <table class="runner-achv-table">
              <thead><tr><th>Tournament</th><th>Result</th></tr></thead>
              <tbody>${rows}</tbody>
            </table>
            ${wrRecords.length ? `
            <table class="runner-achv-table">
              <thead><tr><th>World Records</th><th>Days Held</th></tr></thead>
              <tbody>${wrRows}</tbody>
            </table>` : ''}
            ${barriers.length ? `
            <table class="runner-achv-table">
              <thead><tr><th>Notable Barriers</th><th>Date Achieved</th></tr></thead>
              <tbody>${barrierRows}</tbody>
            </table>` : ''}`;
        });
      }

      let matchIndexPromise = null;
      function getMatchIndex() {
        if (!matchIndexPromise) matchIndexPromise = buildMatchIndex();
        return matchIndexPromise;
      }

      function toSecs(t) {
        if (!t || t === 'DNF' || t === 'N/A') return Infinity;
        const parts = t.split(':').map(Number);
        if (parts.some(isNaN)) return Infinity;
        if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
        if (parts.length === 2) return parts[0] * 60 + parts[1];
        return Infinity;
      }

      function sortSecsOf(p) {
        return p.sortSecs != null ? p.sortSecs : toSecs(p.time);
      }

      async function buildMatchIndex() {
        const [pastSeasons, lls3, participants] = await Promise.all([
          fetch('/data/past_seasons.json', { cache: 'no-store' }).then(r => r.json()).catch(() => ({})),
          fetch('/data/lls3_results.json', { cache: 'no-store' }).then(r => r.json()).catch(() => ({})),
          fetch('/data/participants.json', { cache: 'no-store' }).then(r => r.json()).catch(() => ({})),
        ]);
        const nameMap = new Map((participants.season3 || []).map(p => [p.name.toLowerCase(), p.name]));
        const normalize = n => (n && nameMap.get(n.toLowerCase())) || n;

        const seedLookup = {};
        [1, 2, 3].forEach(season => {
          const map = {};
          (participants[`season${season}`] || []).forEach(p => { map[p.name.toLowerCase()] = p.seed; });
          seedLookup[season] = map;
        });

        function computeQualSeed(resultsDict) {
          const seed = {};
          for (let w = 1; w <= 8; w++) {
            const r = resultsDict[`${w}_1`];
            if (!r || !r.places || !r.places.length) continue;
            const winner = [...r.places].sort((a, b) => sortSecsOf(a) - sortSecsOf(b))[0];
            if (winner && winner.name) seed[winner.name.toLowerCase()] = w;
          }
          return seed;
        }
        const s3LadderResults = {};
        (lls3.events || []).forEach(ev => {
          const parsed = parseKey3(ev.name);
          if (!parsed || parsed.type !== 'ladder') return;
          const places = [];
          Object.entries(ev.runner_state || {}).forEach(([id, rs]) => {
            const name = normalize(lls3.people?.[id]?.name);
            const time = rs.result?.SingleScore?.score?.final_result ?? rs.result?.SplitTimes?.final_result;
            const precise = rs.result?.SplitTimes?.final_result_precise;
            if (name && time) places.push({ name, time, sortSecs: precise ? toSecs(precise) : toSecs(time) });
          });
          if (places.length) s3LadderResults[`${parsed.w}_${parsed.r}`] = { places };
        });
        const qualSeedLookup = {
          1: computeQualSeed(pastSeasons.season1?.results || {}),
          2: computeQualSeed(pastSeasons.season2?.results || {}),
          3: computeQualSeed(s3LadderResults),
        };

        const index = {};
        function addMatch(name, entry) {
          const key = name.toLowerCase();
          (index[key] || (index[key] = [])).push(entry);
        }

        function processHeat({ season, sortOrder, label, vod, date, places, isBracket, matchKey }) {
          const valid = places.filter(p => p && p.name);
          const sorted = [...valid].sort((a, b) => sortSecsOf(a) - sortSecsOf(b));
          const seedMap = isBracket ? (qualSeedLookup[season] || {}) : (seedLookup[season] || {});
          const withSeed = valid.map(p => ({
            name: p.name,
            time: p.time,
            place: sorted.indexOf(p) + 1,
            seed: seedMap[p.name.toLowerCase()] ?? Infinity,
          }));
          const bySeed = [...withSeed].sort((a, b) => a.seed - b.seed);
          valid.forEach(p => {
            const mine = withSeed.find(w => w.name === p.name);
            const opponents = withSeed.filter(w => w.name !== p.name);
            addMatch(p.name, {
              season, sortOrder, label, vod: vod || null, date: date || null,
              time: p.time, place: mine.place, totalPlayers: valid.length, opponents,
              participantsBySeed: bySeed,
              outcome: p.outcome || null, isBracket: !!isBracket,
              matchKey: matchKey || null,
            });
          });
        }

        const stageNames = { qf: 'Quarterfinal', sf: 'Semifinal', gf: 'Grand Finals', tp: '3rd Place Match' };
        const stageBase   = { qf: 1000, sf: 1010, gf: 1020, tp: 1020 };

        [1, 2].forEach(season => {
          const data = pastSeasons[`season${season}`];
          if (!data) return;
          (data.playins || []).forEach((match, i) => {
            const matchKey = season === 1 ? `s1_playin_${i + 1}` : null;
            processHeat({ season, sortOrder: i, label: `Play-In ${match.label}`, vod: match.vod, date: match.date, places: match.places, matchKey });
          });
          Object.entries(data.results || {}).forEach(([key, result]) => {
            const [w, r] = key.split('_').map(Number);
            if (isNaN(w)) return;
            const label = w === (data.wildcardWeek || 8) ? 'Wildcard Match' : `Week ${w} Rung ${r}`;
            const matchKey = season === 1 ? `s1_${key}` : null;
            processHeat({ season, sortOrder: 100 + w * 10 + r, label, vod: result.vod, date: result.date, places: result.places, matchKey });
          });
          Object.entries(data.top8 || {}).forEach(([key, result]) => {
            const [stage, nStr] = key.split('_');
            const n = Number(nStr);
            const label = (stage === 'gf' || stage === 'tp') ? stageNames[stage] : `${stageNames[stage]} ${n}`;
            const matchKey = season === 1 ? `s1_${key}` : null;
            processHeat({ season, sortOrder: (stageBase[stage] || 1000) + n, label, vod: result.vod, date: result.date, places: result.places, isBracket: true, matchKey });
          });
        });

        function parseKey3(name) {
          if (!name) return null;
          const n = name.trim().toUpperCase();
          let m;
          if ((m = n.match(/^WEEK (\d+) RUNG (\d+)$/))) return { type: 'ladder', w: +m[1], r: +m[2] };
          if ((m = n.match(/^LCQ (\d+)$/)))              return { type: 'lcq', n: +m[1] };
          if ((m = n.match(/^QUARTERFINAL (\d+)$/)))     return { type: 'qf', n: +m[1] };
          if ((m = n.match(/^SEMIFINAL (\d+)$/)))        return { type: 'sf', n: +m[1] };
          if (n === 'GRAND FINALS')                      return { type: 'gf' };
          if (n === '3RD PLACE MATCH')                   return { type: 'tp' };
          if (n === 'WILDCARD MATCH')                    return { type: 'ladder', w: 8, r: 1 };
          return null;
        }

        (lls3.events || []).forEach(ev => {
          const parsed = parseKey3(ev.name);
          if (!parsed) return;
          const places = [];
          Object.entries(ev.runner_state || {}).forEach(([id, rs]) => {
            const name = normalize(lls3.people?.[id]?.name);
            const time = rs.result?.SingleScore?.score?.final_result ?? rs.result?.SplitTimes?.final_result;
            const precise = rs.result?.SplitTimes?.final_result_precise;
            if (name && time) places.push({ name, time, sortSecs: precise ? toSecs(precise) : toSecs(time) });
          });
          if (!places.length) return;

          let label, sortOrder, isBracket = false;
          let matchKey;
          if (parsed.type === 'ladder') {
            label = parsed.w === 8 ? 'Wildcard Match' : `Week ${parsed.w} Rung ${parsed.r}`;
            sortOrder = 100 + parsed.w * 10 + parsed.r;
            matchKey = `${parsed.w}_${parsed.r}`;
          } else if (parsed.type === 'lcq') {
            label = `LCQ ${parsed.n}`;
            sortOrder = parsed.n;
            matchKey = `lcq_${parsed.n}`;
          } else {
            label = (parsed.type === 'gf' || parsed.type === 'tp') ? stageNames[parsed.type] : `${stageNames[parsed.type]} ${parsed.n}`;
            sortOrder = (stageBase[parsed.type] || 1000) + (parsed.n || 0);
            isBracket = true;
            matchKey = (parsed.type === 'gf' || parsed.type === 'tp') ? `${parsed.type}_1` : `${parsed.type}_${parsed.n}`;
          }
          processHeat({ season: 3, sortOrder, label, vod: ev.console || null, date: ev.event_start_time || null, places, isBracket, matchKey });
        });

        Object.values(index).forEach(list => list.sort((a, b) => (b.season - a.season) || (b.sortOrder - a.sortOrder)));
        return index;
      }

      function renderMatchesTab(runner) {
        panelMatches.innerHTML = `<div class="runner-detail-empty">Loading…</div>`;
        getMatchIndex().then(index => {
          const matches = index[runner.name.toLowerCase()] || [];
          if (!matches.length) {
            panelMatches.innerHTML = `<div class="runner-detail-empty">No recorded matches yet.</div>`;
            return;
          }
          const dispName = n => n.toLowerCase() === runner.name.toLowerCase() ? (runner.displayName || runner.name) : n;

          panelMatches.innerHTML = `
            <div class="runner-match-header">
              <span></span>
              <span>Match</span>
              <span>Matchup</span>
              <span>Result</span>
              <span>Time</span>
              <span>Date</span>
            </div>
            <div class="runner-match-list">${matches.map(m => {
            const placeCls = !m.isBracket ? '' : (m.place === 1 ? 'win' : 'loss');
            const placeText = m.isBracket ? (m.place === 1 ? 'W' : 'L') : (typeof pOrdinal === 'function' ? pOrdinal(m.place) : `${m.place}`);
            const dateText = m.date ? fmtCalendarDate(m.date) : '';

            const seeded = m.participantsBySeed || [];
            const nameHtml = p => p.place === 1 ? `<strong>${dispName(p.name)}</strong>` : dispName(p.name);
            const middle = seeded.length ? seeded.map(nameHtml).join(' vs ') : '—';

            const tag = m.vod ? 'a' : 'div';
            const openAttrs = m.vod ? ` href="${m.vod}" target="_blank" rel="noopener"${m.matchKey ? ` data-match="${m.matchKey}"` : ''}` : '';
            return `
              <${tag} class="runner-match-row${m.vod ? ' has-vod' : ''}"${openAttrs}>
                <span class="runner-match-season">S${m.season}</span>
                <span class="runner-match-label">${m.label}</span>
                <span class="runner-match-opponents">${middle}</span>
                <span class="runner-match-result">
                  <span class="runner-match-place ${placeCls}">${placeText}</span>
                  <span class="runner-match-time">${m.time}</span>
                </span>
                ${dateText ? `<span class="runner-match-date">${dateText}</span>` : ''}
              </${tag}>`;
          }).join('')}</div>`;
        });
      }

      const detailTabs = document.querySelectorAll('.runner-detail-tab');
      const detailPanels = { info: panelInfo, matches: panelMatches, achievements: panelAchievements };
      const tabRenderers = { info: renderInfoTab, matches: renderMatchesTab, achievements: renderAchievementsTab };
      detailTabs.forEach(tab => {
        tab.addEventListener('click', () => {
          if (!activeRunner) return;
          detailTabs.forEach(t => t.classList.remove('active'));
          tab.classList.add('active');
          Object.values(detailPanels).forEach(p => p.classList.remove('active'));
          const rtab = tab.dataset.rtab;
          detailPanels[rtab].classList.add('active');
          tabRenderers[rtab](activeRunner);
        });
      });

      function achievementBadgeClass(text) {
        if (/\bBTR\b/i.test(text)) return 'purple';
        if (/days held/i.test(text)) return 'blue';
        if (/board sweep/i.test(text)) return 'orange';
        return 'gold';
      }

      const SOCIAL_META = {
        x: {
          label: 'X',
          icon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>',
        },
        twitch: {
          label: 'Twitch',
          icon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714z"/></svg>',
        },
        youtube: {
          label: 'YouTube',
          icon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M23.495 6.205a3.007 3.007 0 0 0-2.088-2.088c-1.87-.501-9.396-.501-9.396-.501s-7.507-.01-9.396.501A3.007 3.007 0 0 0 .527 6.205a31.247 31.247 0 0 0-.522 5.805 31.247 31.247 0 0 0 .522 5.783 3.007 3.007 0 0 0 2.088 2.088c1.868.502 9.396.502 9.396.502s7.506 0 9.396-.502a3.007 3.007 0 0 0 2.088-2.088 31.247 31.247 0 0 0 .5-5.783 31.247 31.247 0 0 0-.5-5.805zM9.609 15.601V8.408l6.264 3.602z"/></svg>',
        },
        speedrun: {
          label: 'speedrun.com',
          icon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M15 1H9v2h6V1zm-4 13h2V8h-2v6zm8.03-6.61l1.42-1.42c-.43-.51-.9-.99-1.41-1.41l-1.42 1.42A8.962 8.962 0 0012 4c-4.97 0-9 4.03-9 9s4.02 9 9 9a9 9 0 006.03-15.61zM12 20c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z"/></svg>',
        },
        therun: { label: 'theRun.gg', icon: '<img src="/assets/therun-icon.png" alt="theRun.gg" class="runner-detail-social-icon-img">' },
      };
      const SOCIAL_ORDER = ['x', 'twitch', 'youtube', 'speedrun', 'therun'];

      function renderSocials(runner) {
        const socials = runner.socials || {};
        detailSocials.innerHTML = SOCIAL_ORDER.filter(k => socials[k]).map(k => {
          const meta = SOCIAL_META[k];
          return `<a class="runner-detail-social-icon ${k}" href="${socials[k]}" target="_blank" rel="noopener" aria-label="${meta.label}">${meta.icon}</a>`;
        }).join('');
      }

      function fadeOutThen(els, cb) {
        const targets = els.filter(Boolean);
        targets.forEach(el => el.classList.add('runners-fade-out'));
        setTimeout(() => {
          targets.forEach(el => el.classList.remove('runners-fade-out'));
          cb();
        }, 220);
      }
      function fadeIn(els) {
        const targets = els.filter(Boolean);
        targets.forEach(el => { el.style.transition = 'none'; el.classList.add('runners-fade-in-start'); });
        void detail.offsetHeight;
        targets.forEach(el => { el.style.transition = ''; });
        requestAnimationFrame(() => requestAnimationFrame(() => {
          targets.forEach(el => el.classList.remove('runners-fade-in-start'));
        }));
      }

      function showDetail(runner) {
        activeRunner = runner;
        fadeOutThen([grid, pageTitle, pageDivider], () => {
          grid.style.display = 'none';
          if (pageTitle) pageTitle.style.display = 'none';
          if (pageDivider) pageDivider.style.display = 'none';
          detail.style.display = 'flex';
          fadeIn([detail]);

          detailName.textContent = runner.displayName || runner.name;
          applyNameColor(detailName, runner.name);
          detailPhotoBg.style.backgroundImage = runner.bgImage ? `url('${encodeURI(runner.bgImage)}')` : 'none';
          detailPhotoImg.onerror = () => { detailPhotoImg.style.display = 'none'; };
          detailPhotoImg.onload = () => { detailPhotoImg.style.display = ''; };
          detailPhotoImg.src = runnerImageUrl(runner);
          detailPhotoImg.alt = runner.name;
          detailFlag.className = runner.country ? `fi fi-${(runner.country === 'UK' ? 'GB' : runner.country).toLowerCase()}` : 'fi';
          detailRealName.textContent = runner.realName || '';
          detailRealName.style.display = runner.realName ? '' : 'none';
          const renderBadges = wrRecords => (runner.playerAchievements || [])
            .map(a => fillStatTokens(a, wrRecords))
            .map(a => `<span class="runner-detail-achv-badge ${achievementBadgeClass(a)}">${a}</span>`).join('');
          detailAchvBadges.innerHTML = renderBadges(runner.worldRecords);
          getLiveWorldRecords().then(map => {
            if (activeRunner !== runner) return;
            const live = liveRecordsFor(runner, map);
            if (live) detailAchvBadges.innerHTML = renderBadges(live);
          });
          renderSocials(runner);
          renderPills(runner);
          getUsernameMap().then(() => { if (activeRunner === runner) renderPills(runner); });

          detailTabs.forEach(t => t.classList.toggle('active', t.dataset.rtab === 'info'));
          Object.values(detailPanels).forEach(p => p.classList.remove('active'));
          panelInfo.classList.add('active');
          renderInfoTab(runner);

          window.scrollTo(0, 0);
        });
      }

      function showGrid() {
        activeRunner = null;
        fadeOutThen([detail], () => {
          detail.style.display = 'none';
          grid.style.display = 'grid';
          if (pageTitle) pageTitle.style.display = '';
          if (pageDivider) pageDivider.style.display = '';
          fadeIn([grid, pageTitle, pageDivider]);
        });
      }

      backBtn.addEventListener('click', showGrid);

      window._resetRunnersView = () => {
        if (!activeRunner) return;
        activeRunner = null;
        detail.style.display = 'none';
        grid.style.display = 'grid';
        if (pageTitle) pageTitle.style.display = '';
        if (pageDivider) pageDivider.style.display = '';
      };

      function renderGrid() {
        grid.innerHTML = '';
        runnersData.filter(runner => !runner.hidden).forEach(runner => {
          const card = document.createElement('div');
          card.className = 'runner-card';
          grid.appendChild(card);

          if (runner.bgImage) {
            const bg = document.createElement('div');
            bg.className = 'runner-card-bg';
            bg.style.backgroundImage = `url('${encodeURI(runner.bgImage)}')`;
            card.appendChild(bg);
          }

          const photo = document.createElement('img');
          photo.className = 'runner-card-photo';
          photo.alt = runner.name;
          photo.addEventListener('error', () => { photo.style.display = 'none'; });
          photo.addEventListener('load', () => { photo.style.display = ''; });
          photo.src = runnerImageUrl(runner);
          card.appendChild(photo);

          if (runner.hoverImage) {
            card.classList.add('has-hover-photo');
            const photoHover = document.createElement('img');
            photoHover.className = 'runner-card-photo-hover';
            photoHover.alt = '';
            photoHover.src = runnerImageUrl(runner, true);
            card.appendChild(photoHover);
          }

          const scrim = document.createElement('div');
          scrim.className = 'runner-card-scrim';
          card.appendChild(scrim);

          const glow = document.createElement('div');
          glow.className = 'runner-card-glow';
          applyGlowColor(glow, runner.name);
          card.appendChild(glow);

          const nameEl = document.createElement('span');
          nameEl.className = 'runner-card-name';
          nameEl.textContent = runner.displayName || runner.name;
          applyNameColor(nameEl, runner.name);
          card.appendChild(nameEl);

          buildNameOutline(card, runner, null);

          card.addEventListener('click', () => showDetail(runner));
        });
        if (typeof observeAll === 'function') observeAll();
        realignNameOutlines();
      }

      function realignNameOutlines() {
        const updates = [];
        document.querySelectorAll('.runner-card-name-outline').forEach(outline => {
          const card = outline.closest('.runner-card');
          const nameEl = card && card.querySelector('.runner-card-name');
          if (!card || !nameEl) return;
          if (card.getBoundingClientRect().height === 0) return;
          updates.push([outline, getNameVerticalCenterPercent(card, nameEl)]);
        });
        updates.forEach(([outline, percent]) => { outline.style.top = `${percent}%`; });
      }

      document.querySelectorAll('[data-page="runners"]').forEach(link => {
        link.addEventListener('click', () => setTimeout(realignNameOutlines, 60));
      });
      let outlineResizeTimer;
      window.addEventListener('resize', () => {
        clearTimeout(outlineResizeTimer);
        outlineResizeTimer = setTimeout(realignNameOutlines, 100);
      });

      document.addEventListener('nameColorMapReady', () => {
        if (runnersData) renderGrid();
        if (activeRunner) {
          applyNameColor(detailName, activeRunner.name);
          renderPills(activeRunner);
          if (panelAchievements.classList.contains('active')) renderAchievementsTab(activeRunner);
        }
      });

      const runnersDataPromise = fetch('/data/runners.json', { cache: 'no-store' })
        .then(r => r.json())
        .then(runners => {
          runnersData = runners;
          window._runWhenIdle ? window._runWhenIdle(renderGrid) : renderGrid();
          return runners;
        })
        .catch(e => { console.error('Could not load runners.json', e); return []; });

      window._openRunnerProfile = function(name) {
        runnersDataPromise.then(runners => {
          const runner = (runners || []).find(r => r.name.toLowerCase() === String(name).toLowerCase());
          if (!runner || runner.hidden) return;
          showPage('runners', true);
          showDetail(runner);
        });
      };
    })();
