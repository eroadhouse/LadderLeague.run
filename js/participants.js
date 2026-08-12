    //participants data js
    const grid = document.getElementById('p-grid');

    const DEFAULT_AVATAR_ICON = '<svg viewBox="0 0 24 24" width="60%" height="60%" fill="var(--dim)"><path d="M12 12c2.7 0 4.9-2.2 4.9-4.9S14.7 2.2 12 2.2 7.1 4.4 7.1 7.1 9.3 12 12 12zm0 2.5c-3.3 0-9.9 1.7-9.9 5v2.3h19.8V19.5c0-3.3-6.6-5-9.9-5z"/></svg>';

    function pOrdinal(n) {
      const s = ['th','st','nd','rd'], v = n % 100;
      return n + (s[(v - 20) % 10] || s[v] || s[0]);
    }
    function pParseTime(t) {
      if (!t) return null;
      const [h, m, s] = t.split(':').map(Number);
      return h * 3600 + m * 60 + s;
    }
    function pFmtTime(secs) {
      const h = Math.floor(secs / 3600);
      const m = Math.floor((secs % 3600) / 60);
      const s = Math.floor(secs % 60);
      return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    }

    //src api call
    Promise.all([
      fetch('/data/participants.json',  { cache: 'no-store' }).then(r => r.json()),
      fetch('/data/results.json',       { cache: 'no-store' }).then(r => r.json()),
      fetch('/data/past_seasons.json',  { cache: 'no-store' }).then(r => r.json()).catch(() => ({})),
      fetch('https://www.speedrun.com/api/v1/leaderboards/46w33l1r/category/9d8p7ylk?embed=players&platform=PC&top=150&var-j84pew89=0q5v2grl').then(r => r.json()).catch(() => null),
    ]).then(([allParticipants, ladderResults, pastSeasons, lbData]) => {
      const _runParticipantsRender = () => {
      const participants = allParticipants.season3 || [];

      //season tab switching (hardcoding previous seasons cuz its easier)
      let activeSeason = 'season3';
      document.querySelectorAll('.participants-season-tab[data-season]').forEach(tab => {
        tab.addEventListener('click', () => {
          document.querySelectorAll('.participants-season-tab[data-season]').forEach(t => t.classList.remove('active'));
          tab.classList.add('active');
          activeSeason = tab.dataset.season;
          const subtitle = document.getElementById('participants-subtitle');
          const seasonNum = activeSeason.replace('season', '');
          const seasonList = allParticipants[activeSeason] || [];
          if (subtitle) subtitle.textContent = `Season 0${seasonNum}`;
          const pCdEl = document.getElementById('participants-countdown');
          const pGridEl = document.getElementById('p-grid');
          if (activeSeason === 'season3') {
            if (season3CountdownActive) {
              if (pCdEl) pCdEl.style.display = 'block';
              if (pGridEl) pGridEl.style.display = 'none';
            } else {
              if (pCdEl) pCdEl.style.display = 'none';
              if (pGridEl) pGridEl.style.display = '';
              renderSeason3();
            }
          } else {
            //gating out countdown for past seasons and only using it on current one
            if (pCdEl) pCdEl.style.display = 'none';
            if (pGridEl) pGridEl.style.display = '';
            renderSimple(seasonList, activeSeason);
          }
        });
      });

      function renderSimple(list, seasonKey) {
        const seasonWideStats = pastSeasonWideStats[seasonKey] || {};
        grid.innerHTML = '';
        const sorted = [...list].sort((a, b) => {
          if (a.placement == null && b.placement == null) return 0;
          if (a.placement == null) return 1;
          if (b.placement == null) return -1;
          return a.placement - b.placement;
        });
        sorted.forEach(p => {
          const iso = (p.country === 'UK' ? 'GB' : p.country || 'US').toLowerCase();
          const srUser = p.username || p.name;
          const srcEntry = srcPBMap[srUser.toLowerCase()];

          const nameStyle = (srcEntry?.colorFrom && srcEntry?.colorTo)
            ? `style="background: linear-gradient(90deg, ${srcEntry.colorFrom}, ${srcEntry.colorTo}); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;"`
            : (srcEntry?.colorSolid ? `style="color: ${srcEntry.colorSolid};"` : '');
          const avatarStyle = (srcEntry?.colorFrom && srcEntry?.colorTo)
            ? `style="border: 3px solid transparent; background: linear-gradient(#0f111c, #0f111c) padding-box, linear-gradient(to bottom, ${srcEntry.colorFrom}, ${srcEntry.colorTo}) border-box;"`
            : (srcEntry?.colorSolid ? `style="border: 3px solid ${srcEntry.colorSolid};"` : '');
          const avatarContent = srcEntry?.imageUri
            ? `<img src="${srcEntry.imageUri}" alt="${p.name}" loading="lazy">`
            : DEFAULT_AVATAR_ICON;

          const placementColors = { 1: '#d4b84a', 2: '#9aa8b8', 3: '#b07040' };
          let statusHtml = '';
          if (p.placement != null) {
            const label = p.placement === 1 ? '★ Champion ★' : p.placement === 2 ? 'Runner-Up' : `${pOrdinal(p.placement)} Place`;
            const color = placementColors[p.placement] || null;
            const isTop8 = p.placement >= 4 && p.placement <= 8;
            if (color) {
              statusHtml = `<div class="p-stat-status" style="color:${color}">${label}</div>`;
            } else if (isTop8) {
              statusHtml = `<div class="p-stat-status" style="color:#aebdd9">${label}</div>`;
            } else {
              statusHtml = `<div class="p-stat-status eliminated">${label}</div>`;
            }
          }

          //accolade badges
          const acBadges = (() => {
            const ac = p.accolades;
            if (!ac) return '';
            const badges = [];
            if (ac.WR) badges.push(`<span class="p-accolade p-accolade-wr">WR ${ac.WR}<span style="text-transform:none;vertical-align:baseline">x</span></span>`);
            [].concat(ac['tourney-wins'] || []).forEach(s => badges.push(`<span class="p-accolade p-accolade-win">${s} Champion</span>`));
            [].concat(ac['tourney-runnerups'] || []).forEach(s => badges.push(`<span class="p-accolade p-accolade-ru">${s} Runner-Up</span>`));
            return badges.length ? `<div class="p-accolades">${badges.join('')}</div>` : '';
          })();

          //making participant card
          grid.innerHTML += `
            <a class="participant-card" href="https://www.speedrun.com/users/${encodeURIComponent(srUser)}" target="_blank" rel="noopener">
              <div class="p-avatar" ${avatarStyle}>${avatarContent}</div>
              <div class="p-handle"><span class="fi fi-${iso}"></span><span ${nameStyle}>${p.name}</span></div>
              <div class="p-role">Seed ${p.seed}</div>
              <div class="p-stats">
                <div class="p-stat-row">
                  ${p.seededPB != null ? `<div class="p-stat"><span class="p-stat-label">Seeded PB</span><span class="p-stat-value">${p.seededPB}</span></div>` : ''}
                  ${(() => { const st = seasonWideStats[p.name]; if (!st) return ''; const pb = pFmtTime(st.best); const avg = pFmtTime(st.times.reduce((a,b)=>a+b,0)/st.times.length); return `<div class="p-stat"><span class="p-stat-label">Season PB</span><span class="p-stat-value">${pb}</span></div><div class="p-stat"><span class="p-stat-label">Season AVG</span><span class="p-stat-value">${avg}</span></div>`; })()}
                </div>
                ${acBadges}
                ${statusHtml}
              </div>
            </a>`;
        });
        observeAll();
      }

      const subtitle = document.getElementById('participants-subtitle');
      if (subtitle) subtitle.textContent = `Season 03`;

      const weekMatchCounts = [7, 6, 5, 4, 3, 2, 1, 1];

      const TOP8_MATCH_LABELS = { qf: 'Quarterfinals', sf: 'Semifinals', gf: 'Grand Finals', tp: '3rd Place Match' };
      function pMatchLabel(key) {
        if (!key) return '';
        if (key.startsWith('lcq_')) return `LCQ ${key.split('_')[1]}`;
        const [w] = key.split('_');
        if (TOP8_MATCH_LABELS[w]) return TOP8_MATCH_LABELS[w];
        if (w === '8') return 'Wildcard Match';
        const [, r] = key.split('_');
        return `Week ${w} Rung ${r}`;
      }

      //pbs + ladder pbs (weeks 1-7 only - this also feeds wildcard-seed derivation below,
      //so it needs to stay ladder-only; the participants page shows a separate season-wide stat)
      const playerPB = {}, playerPBKey = {}, playerTimes = {};
      Object.entries(ladderResults).forEach(([key, result]) => {
        if (!result || !result.places) return;
        const w = parseInt(key.split('_')[0]);
        if (isNaN(w) || w < 1 || w > 7) return;
        result.places.forEach(entry => {
          const secs = pParseTime(entry.time);
          if (secs === null || isNaN(secs)) return;
          if (playerPB[entry.name] == null) {
            playerPB[entry.name] = secs; playerPBKey[entry.name] = key; playerTimes[entry.name] = [secs];
          } else {
            if (secs < playerPB[entry.name]) { playerPB[entry.name] = secs; playerPBKey[entry.name] = key; }
            playerTimes[entry.name].push(secs);
          }
        });
      });

      //season-wide PB/AVG for the participants page ("Season PB"/"Season AVG") - every stage a
      //player could have run in: ladder weeks, wildcard, LCQ, and top 8
      const seasonPB = {}, seasonPBKey = {}, seasonTimes = {};
      Object.entries(ladderResults).forEach(([key, result]) => {
        if (!result || !result.places) return;
        result.places.forEach(entry => {
          const secs = pParseTime(entry.time);
          if (secs === null || isNaN(secs)) return;
          if (seasonPB[entry.name] == null) {
            seasonPB[entry.name] = secs; seasonPBKey[entry.name] = key; seasonTimes[entry.name] = [secs];
          } else {
            if (secs < seasonPB[entry.name]) { seasonPB[entry.name] = secs; seasonPBKey[entry.name] = key; }
            seasonTimes[entry.name].push(secs);
          }
        });
      });

      const pastSeasonWideStats = {};
      ['season1', 'season2'].forEach(sKey => {
        const sData = pastSeasons[sKey];
        if (!sData) return;
        const stats = {};
        function addEntry(name, timeStr) {
          if (!name || !timeStr || timeStr === 'DNF') return;
          const secs = pParseTime(timeStr);
          if (secs == null || isNaN(secs)) return;
          if (!stats[name]) stats[name] = { best: secs, times: [secs] };
          else { if (secs < stats[name].best) stats[name].best = secs; stats[name].times.push(secs); }
        }
        Object.values(sData.results || {}).forEach(result => (result.places || []).forEach(e => addEntry(e.name, e.time)));
        Object.values(sData.top8 || {}).forEach(result => (result.places || []).forEach(e => addEntry(e.name, e.time)));
        (sData.playins || []).forEach(match => (match.places || []).forEach(e => addEntry(e.name, e.time)));
        pastSeasonWideStats[sKey] = stats;
      });

      //top 8 seeds
      const playerQualSeed = {};
      for (let w = 1; w <= 8; w++) {
        const r = ladderResults[`${w}_1`];
        const name = r ? (r.places[0] || {}).name : null;
        if (name) playerQualSeed[name] = w;
      }

      //placements
      const playerPlacement = {};
      //wildcard matchups
      const pWcBest = {}, pWcAllTimes = {};
      Object.entries(playerPB).forEach(([name, best]) => {
        if (!playerQualSeed[name]) { pWcBest[name] = best; pWcAllTimes[name] = playerTimes[name]; }
      });
      const pWcFastest = Object.entries(pWcBest).sort((a, b) => a[1] - b[1])[0]?.[0] || null;
      const pWcAvg = Object.entries(pWcAllTimes)
        .filter(([name]) => name !== pWcFastest)
        .map(([name, times]) => [name, times.reduce((a, b) => a + b, 0) / times.length])
        .sort((a, b) => a[1] - b[1])[0]?.[0] || null;
      const wcParticipants = new Set([pWcFastest, pWcAvg].filter(Boolean));

      const wcMatchWinner = (ladderResults['8_1']?.places?.[0] || {}).name || null;
      const week7DoneP = !!(ladderResults[`7_${weekMatchCounts[6]}`]?.places?.length);

      function pBuildElimBase() {
        const base = [];
        for (let w = 7; w >= 1; w--) {
          const mc = weekMatchCounts[w - 1];
          for (let place = 2; place <= 3; place++) {
            const r = ladderResults[`${w}_${mc}`];
            base.push(r ? (r.places[place - 1] || {}).name || null : null);
          }
        }
        return base;
      }

      let pElimEntries;
      if (wcMatchWinner) {
        const base = pBuildElimBase();
        const winnerIdx = base.findIndex(n => n === wcMatchWinner);
        const filtered = [...base];
        if (winnerIdx >= 0) filtered.splice(winnerIdx, 1);
        pElimEntries = filtered.slice(0, 13);
      } else if (week7DoneP) {
        const base = pBuildElimBase();
        const candidates = new Set([pWcFastest, pWcAvg].filter(Boolean));
        const removed = new Set();
        const filtered = [];
        for (const name of base) {
          if (name && candidates.has(name) && !removed.has(name)) {
            removed.add(name);
          } else {
            filtered.push(name);
          }
        }
        pElimEntries = [null, ...filtered.slice(0, 12)];
      } else {
        pElimEntries = [null];
        for (let w = 6; w >= 1; w--) {
          const mc = weekMatchCounts[w - 1];
          for (let place = 2; place <= 3; place++) {
            const r = ladderResults[`${w}_${mc}`];
            pElimEntries.push(r ? (r.places[place - 1] || {}).name || null : null);
          }
        }
      }

      pElimEntries.forEach((name, i) => {
        if (name) playerPlacement[name] = 9 + i;
      });

      //top 8 placements
      const top8Placement = {};
      const top8PlacementColors = { 1: '#d4b84a', 2: '#9aa8b8', 3: '#b07040' };
      (() => {
        if (ladderResults['gf_1']?.places?.[0]?.name) top8Placement[ladderResults['gf_1'].places[0].name] = 1;
        if (ladderResults['gf_1']?.places?.[1]?.name) top8Placement[ladderResults['gf_1'].places[1].name] = 2;
        if (ladderResults['tp_1']?.places?.[0]?.name) top8Placement[ladderResults['tp_1'].places[0].name] = 3;
        if (ladderResults['tp_1']?.places?.[1]?.name) top8Placement[ladderResults['tp_1'].places[1].name] = 4;
        const qfLosers = ['qf_1','qf_2','qf_3','qf_4']
          .map(key => { const l = ladderResults[key]?.places?.[1]; return l ? { name: l.name, secs: pParseTime(l.time) ?? Infinity } : null; })
          .filter(Boolean)
          .sort((a, b) => a.secs - b.secs);
        qfLosers.forEach((p, i) => { top8Placement[p.name] = 5 + i; });
      })();

      //still in top 8
      const top8ActiveStatus = {};
      (() => {
        const gfDone = !!ladderResults['gf_1']?.places?.length;
        const tpDone = !!ladderResults['tp_1']?.places?.length;

        //in grands
        if (!gfDone) {
          ['sf_1','sf_2'].forEach(key => {
            const w = ladderResults[key]?.places?.[0]?.name;
            if (w) top8ActiveStatus[w] = 'IN GRAND FINALS';
          });
        }
        //in third place match
        if (!tpDone) {
          ['sf_1','sf_2'].forEach(key => {
            const l = ladderResults[key]?.places?.[1]?.name;
            if (l) top8ActiveStatus[l] = '3rd–4th Place';
          });
        }
        //in semis
        const sfDone = new Set(['sf_1','sf_2'].filter(k => ladderResults[k]?.places?.length).map(k => {
          return [ladderResults[k].places[0]?.name, ladderResults[k].places[1]?.name];
        }).flat().filter(Boolean));
        ['qf_1','qf_2','qf_3','qf_4'].forEach(key => {
          const w = ladderResults[key]?.places?.[0]?.name;
          if (w && !sfDone.has(w) && !top8ActiveStatus[w]) top8ActiveStatus[w] = 'IN SEMIFINALS';
        });
      })();

      //didn't make it into ladder at all
      const lcqQualifiers = new Set();
      const lcq2Time      = {};
      Object.entries(ladderResults).forEach(([key, result]) => {
        if (!key.startsWith('lcq_') || !result || !result.places) return;
        result.places.forEach((entry, idx) => {
          if (idx < 3) lcqQualifiers.add(entry.name);
          if (key === 'lcq_2') {
            const secs = pParseTime(entry.time);
            if (secs !== null) lcq2Time[entry.name] = secs;
          }
        });
      });
      const lcqEliminated = Object.entries(lcq2Time)
        .filter(([name]) => !lcqQualifiers.has(name))
        .sort((a, b) => a[1] - b[1]);
      const lcqStartPlace = participants.length - lcqEliminated.length + 1;
      lcqEliminated.forEach(([name], i) => { playerPlacement[name] = lcqStartPlace + i; });

      //mapping everyones pb from src to their name
      window.srcPBMap = {};
      const srcPBMap = window.srcPBMap;
      if (lbData && lbData.data) {
        const playerIndex = {};
        (lbData.data.players?.data || []).forEach(pl => {
          const slug  = (pl.weblink || '').replace(/.*\//, '').toLowerCase();
          const intl  = (pl.names?.international || '').toLowerCase();
          const style = pl['name-style'] || {};
          const colorFrom = (style['color-from']?.dark) || null;
          const colorTo   = (style['color-to']?.dark)   || null;
          const colorSolid = (style['color']?.dark)     || null;
          const imageUri   = pl.assets?.image?.uri     || null;
          playerIndex[pl.id] = { slug, intl, colorFrom, colorTo, colorSolid, imageUri };
        });
        lbData.data.runs.forEach(entry => {
          const pid  = entry.run?.players?.[0]?.id;
          const info = pid ? playerIndex[pid] : null;
          const t         = entry.run?.times?.realtime_t;
          const submitted = entry.run?.submitted || null;
          if (!info || t == null) return;
          const val = { t, place: entry.place, colorFrom: info.colorFrom, colorTo: info.colorTo, colorSolid: info.colorSolid, imageUri: info.imageUri, submitted, srcId: pid };
          if (info.slug && !srcPBMap[info.slug]) srcPBMap[info.slug] = val;
          if (info.intl && info.intl !== info.slug && !srcPBMap[info.intl]) srcPBMap[info.intl] = val;
        });
      }

      window._nameColorMap = {};
      const allSeasonsParticipants = [
        ...(allParticipants.season1 || []),
        ...(allParticipants.season2 || []),
        ...(allParticipants.season3 || [])
      ];
      allSeasonsParticipants.forEach(p => {
        const entry = srcPBMap[(p.username || p.name).toLowerCase()];
        if (!entry) return;
        window._nameColorMap[p.name.toLowerCase()] = entry.colorFrom || entry.colorSolid
          ? { colorFrom: entry.colorFrom, colorTo: entry.colorTo, colorSolid: entry.colorSolid }
          : null;
      });
      window._season3Placement = {};
      participants.forEach(p => {
        const place = top8Placement[p.name] ?? playerPlacement[p.name] ?? null;
        if (place != null) window._season3Placement[p.name.toLowerCase()] = place;
      });

      document.dispatchEvent(new CustomEvent('nameColorMapReady'));

      function renderSeason3() {
      grid.innerHTML = '';
      //sort by final placement (top 8 finish, then ladder/LCQ elimination order), same as past seasons
      const sorted3 = [...participants].sort((a, b) => {
        const placeA = top8Placement[a.name] ?? playerPlacement[a.name] ?? Infinity;
        const placeB = top8Placement[b.name] ?? playerPlacement[b.name] ?? Infinity;
        return placeA - placeB;
      });
      sorted3.forEach(p => {
        const iso      = (p.country === 'UK' ? 'GB' : p.country).toLowerCase();
        const pb      = seasonPB[p.name]    != null ? pFmtTime(seasonPB[p.name]) : '—';
        const pbLabel = seasonPBKey[p.name] ? pMatchLabel(seasonPBKey[p.name]) : null;
        const avg = seasonTimes[p.name] != null
          ? pFmtTime(seasonTimes[p.name].reduce((a, b) => a + b, 0) / seasonTimes[p.name].length) : '—';
        const qualSeed  = playerQualSeed[p.name];
        const placement = playerPlacement[p.name];

        const srUser   = p.username || p.name;
        const srcEntry = srcPBMap[srUser.toLowerCase()];
        const srcPb    = srcEntry ? pFmtTime(srcEntry.t) : '—';
        const srcPbDate = srcEntry?.submitted
          ? new Date(srcEntry.submitted).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
          : null;
        const srcPlace = srcEntry ? `#${srcEntry.place}` : '—';
        const srcPlaceColor = !srcEntry ? '' : (() => {
          const pl = srcEntry.place;
          if (pl === 1) return '#d4b84a';
          if (pl === 2) return '#c0c0c0';
          if (pl === 3) return '#cd7f32';
          if (pl === 4) return '#4a90d4';
          return '';
        })();
        const nameStyle = (srcEntry?.colorFrom && srcEntry?.colorTo)
          ? `style="background: linear-gradient(90deg, ${srcEntry.colorFrom}, ${srcEntry.colorTo}); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;"`
          : (srcEntry?.colorSolid ? `style="color: ${srcEntry.colorSolid};"` : '');
        const avatarStyle = (srcEntry?.colorFrom && srcEntry?.colorTo)
          ? `style="border: 3px solid transparent; background: linear-gradient(#0f111c, #0f111c) padding-box, linear-gradient(to bottom, ${srcEntry.colorFrom}, ${srcEntry.colorTo}) border-box;"`
          : (srcEntry?.colorSolid ? `style="border: 3px solid ${srcEntry.colorSolid};"` : '');

        const top8Place  = top8Placement[p.name];
        const activeStage = top8ActiveStatus[p.name];
        let statusHtml = '';
        if (top8Place != null) {
          const color = top8PlacementColors[top8Place] || '#aebdd9';
          const placeLabel = top8Place === 1 ? '★ Champion ★' : top8Place === 2 ? 'Runner-Up' : `${pOrdinal(top8Place)} Place`;
          statusHtml = `<div class="p-stat-status" style="color:${color}">${placeLabel}</div>`;
        } else if (activeStage) {
          const stageColor = activeStage === '3rd–4th Place' ? '#cd7f32' : '#4a90d4';
          statusHtml = `<div class="p-stat-status" style="color:${stageColor}">${activeStage}</div>`;
        } else if (qualSeed != null) {
          statusHtml = `<div class="p-stat-status qualified">Top 8 Seed #${qualSeed}</div>`;
        } else if (placement != null) {
          statusHtml = `<div class="p-stat-status eliminated">${pOrdinal(placement)} Place</div>`;
        }

        grid.innerHTML += `
          <a class="participant-card" href="https://www.speedrun.com/users/${encodeURIComponent(srUser)}" target="_blank" rel="noopener">
            <div class="p-avatar" ${avatarStyle}>${srcEntry?.imageUri ? `<img src="${srcEntry.imageUri}" alt="${p.name}" loading="lazy">` : DEFAULT_AVATAR_ICON}</div>
            <div class="p-handle"><span class="fi fi-${iso}"></span><span ${nameStyle}>${p.name}</span></div>
            <div class="p-role">Seed ${p.seed}</div>
            <div class="p-stats">
              <div class="p-stat-row">
                <div class="p-stat"><span class="p-stat-label">PB</span><span class="p-stat-value${srcPbDate ? ' p-stat-tip' : ''}"${srcPbDate ? ` data-tip="${srcPbDate}" data-tip-label="Achieved on"` : ''}>${srcPb}</span></div>
                <div class="p-stat p-stat-tip" data-tip="Any% Leaderboard Rank"><span class="p-stat-label">Rank</span><span class="p-stat-value" ${srcPlaceColor ? `style="color:${srcPlaceColor};"` : ''}>${srcPlace}</span></div>
                ${seasonPB[p.name] != null ? `<div class="p-stat"><span class="p-stat-label">Season PB</span><span class="p-stat-value${pbLabel ? ' p-stat-tip' : ''}"${pbLabel ? ` data-tip="${pbLabel}" data-tip-label="Achieved in"` : ''}>${pb}</span></div>` : ''}
                ${seasonPB[p.name] != null ? `<div class="p-stat"><span class="p-stat-label">Season AVG</span><span class="p-stat-value">${avg}</span></div>` : ''}
              </div>
              ${(() => {
                const ac = p.accolades;
                if (!ac) return '';
                const badges = [];
                if (ac.WR)                badges.push(`<span class="p-accolade p-accolade-wr">WR ${ac.WR}<span style="text-transform:none;vertical-align:baseline">x</span></span>`);
                [].concat(ac['tourney-wins']    || []).forEach(s => badges.push(`<span class="p-accolade p-accolade-win">${s} Champion</span>`));
                [].concat(ac['tourney-runnerups'] || []).forEach(s => badges.push(`<span class="p-accolade p-accolade-ru">${s} Runner-Up</span>`));
                return badges.length ? `<div class="p-accolades">${badges.join('')}</div>` : '';
              })()}
              ${statusHtml}
            </div>
          </a>`;
      });
      observeAll();

      //ladder pb achieved in week x tooltip
      let pTip = document.getElementById('bp-shared-tooltip');
      if (!pTip) {
        pTip = document.createElement('div');
        pTip.id = 'bp-shared-tooltip';
        document.body.appendChild(pTip);
        document.addEventListener('click', () => { pTip.style.display = 'none'; });
      }
      grid.querySelectorAll('.p-stat-tip').forEach(el => {
        el.addEventListener('mouseenter', e => {
          pTip.style.minWidth = '0';
          pTip.style.padding = '.5rem .8rem';
          pTip.innerHTML = el.dataset.tipLabel
            ? `<div style="font-size:.78rem;color:var(--dim);letter-spacing:1px;text-transform:uppercase">${el.dataset.tipLabel}</div><div style="font-size:.9rem;color:var(--text);margin-top:.2rem">${el.dataset.tip}</div>`
            : `<div style="font-size:.85rem;color:var(--text)">${el.dataset.tip}</div>`;
          pTip.style.display = 'block';
          pTip.style.left = '0px';
          pTip.style.top = '0px';
          const tr = pTip.getBoundingClientRect();
          const er = el.getBoundingClientRect();
          let left = er.right + 8;
          let top  = er.top + er.height / 2 - tr.height / 2;
          left = Math.max(8, Math.min(left, window.innerWidth - tr.width - 8));
          pTip.style.left = `${left}px`;
          pTip.style.top  = `${top}px`;
        });
        el.addEventListener('mouseleave', () => { pTip.style.display = 'none'; });
      });
      }

      renderSeason3();
      };
      window._runWhenIdle ? window._runWhenIdle(_runParticipantsRender) : _runParticipantsRender();
    }).catch(() => {});


