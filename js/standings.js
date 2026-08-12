    const SEASON3_LIVE_TRACKING_ENABLED = false;
    const THEORY_TOGGLE_ENABLED = false; //temporarily disabled - the bracket is filled out, nothing left to theorycraft

    let LCQ_RESULTS = {};

    const theoryToggleBtn  = document.getElementById('theory-toggle');
    const standingsBarEl   = document.querySelector('.standings-bar');
    const standingsPageEl  = document.getElementById('standings');
    let   theoryMode       = false;
    const theoryPicks      = {};
    const theoryLeapfrogs  = {};

    function updateTheoryToggleVisibility() {
      if (!theoryToggleBtn) return;
      const isLadder   = !!document.querySelector('#standings-s3-tabs .standings-tab[data-tab="ladder"].active');
      const isS3       = document.getElementById('standings-s3')?.style.display !== 'none';
      const show       = THEORY_TOGGLE_ENABLED && isLadder && isS3;
      const onlyWildcard = !!window._ladderOnlyWildcardLeft;
      theoryToggleBtn.style.display = show ? 'flex' : 'none';
      theoryToggleBtn.disabled = onlyWildcard;
      theoryToggleBtn.style.opacity = onlyWildcard ? '0.4' : '';
      theoryToggleBtn.style.cursor  = onlyWildcard ? 'not-allowed' : '';
      if ((!show || onlyWildcard) && theoryMode) {
        theoryMode = false;
        theoryToggleBtn.classList.remove('active');
        standingsBarEl.classList.remove('theory-mode');
        standingsPageEl.classList.remove('theory-mode');
      }
    }

    theoryToggleBtn.addEventListener('click', () => {
      theoryMode = !theoryMode;
      theoryToggleBtn.classList.toggle('active', theoryMode);
      standingsBarEl.classList.toggle('theory-mode', theoryMode);
      standingsPageEl.classList.toggle('theory-mode', theoryMode);
      if (!theoryMode) {
        Object.keys(theoryPicks).forEach(k => delete theoryPicks[k]);
        Object.keys(theoryLeapfrogs).forEach(k => delete theoryLeapfrogs[k]);
        window._buildBracket?.();
      }
    });

    document.getElementById('bracket-scroll').addEventListener('click', e => {
      const leapBtn = e.target.closest('.theory-leap');
      if (leapBtn) {
        e.preventDefault();
        e.stopPropagation();
        const card = leapBtn.closest('.bracket-match');
        if (!card || !card.dataset.match) return;
        const matchKey = card.dataset.match;
        const pi       = parseInt(leapBtn.closest('.theory-picks').dataset.pi);
        const isActive = theoryLeapfrogs[matchKey] === pi;
        theoryLeapfrogs[matchKey] = isActive ? undefined : pi;
        leapBtn.classList.toggle('active', !isActive);
        window._refreshTheoryBracket?.();
        return;
      }

      const pickBtn = e.target.closest('.theory-pick');
      if (!pickBtn) return;
      e.preventDefault();
      e.stopPropagation();
      const card = pickBtn.closest('.bracket-match');
      if (!card || !card.dataset.match) return;
      const matchKey  = card.dataset.match;
      const picksSpan = pickBtn.closest('.theory-picks');
      const pi        = parseInt(picksSpan.dataset.pi);
      const place     = parseInt(pickBtn.dataset.place);
      if (!theoryPicks[matchKey]) theoryPicks[matchKey] = [null, null, null];
      const alreadySelected = theoryPicks[matchKey][pi] === place;
      theoryPicks[matchKey].forEach((v, i) => { if (v === place) theoryPicks[matchKey][i] = null; });
      theoryPicks[matchKey][pi] = alreadySelected ? null : place;
      if (theoryLeapfrogs[matchKey] === pi && theoryPicks[matchKey][pi] !== 1) {
        theoryLeapfrogs[matchKey] = undefined;
        picksSpan.querySelector('.theory-leap')?.classList.remove('active');
      }
      card.querySelectorAll('.theory-picks').forEach((span, i) => {
        span.querySelectorAll('.theory-pick').forEach(btn => {
          btn.classList.toggle('selected', theoryPicks[matchKey][i] === parseInt(btn.dataset.place));
        });
      });
      window._refreshTheoryBracket?.();
    });

    //LADDER
    (function() {

      //not useful anymore but live match override
      let LIVE_MATCH = null;
      let SEASON_START = null; //also not useful anymore, manual override
      let LADDER_START = null; //^
      let SEASON3_SEEDED = []; //top 5 rungs (this gets populated later)

      //qualified config
      // const QUALIFIED = [
      //   "ZacMuffin",   // Week 1
      //   null,   // Week 2
      //   null,   // Week 3
      //   null,   // Week 4
      //   null,   // Week 5
      //   null,   // Week 6
      //   null,   // Week 7
      //   "WiiSuper",   // Wildcard
      // ];

      let RESULTS = {};
      let SCHEDULE = {};

      //first/second/third conventions
      function ordinal(n) {
        const s = ['th','st','nd','rd'];
        const v = n % 100;
        return n + (s[(v - 20) % 10] || s[v] || s[0]);
      }

      function formatSchedule(isoStr) {
        const d = new Date(isoStr);
        const date = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
        return `${date} · ${time}`;
      }


      const WEEKS = 8;
      const weekMatchCounts = [7, 6, 5, 4, 3, 2, 1, 1];
      const WILDCARD_WEEK = 8;

      function parseTime(t) {
        if (!t) return null;
        const [h, m, s] = t.split(':').map(Number);
        return h * 3600 + m * 60 + s;
      }
      function checkLeapfrog(week, rung) {
        if (rung <= 2) return false;
        const thisResult  = RESULTS[`${week}_${rung}`];
        const aboveResult = RESULTS[`${week}_${rung - 1}`];
        if (!thisResult?.places?.[0] || !aboveResult?.places?.[1]) return false;
        const t1 = parseTime(thisResult.places[0].time);
        const t2 = parseTime(aboveResult.places[1].time);
        if (!t1 || !t2 || isNaN(t1) || isNaN(t2)) return false;
        return t1 < t2;
      }
      function fmtTime(secs) {
        const h = Math.floor(secs / 3600);
        const m = Math.floor((secs % 3600) / 60);
        const s = Math.floor(secs % 60);
        return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
      }

      let wildcardParticipants = ['—', '—'];

      //fill bottom 2 rungs in w1 with LCQ winners
      function lcqWinners(matchKey) {
        const r = LCQ_RESULTS[matchKey];
        if (!r || !r.places) return ['—', '—', '—'];
        return [0, 1, 2].map(i => (r.places[i] ? r.places[i].name : '—'));
      }

      //figure out lineup each week based on prev results
      function computeLineup(week) {
        if (week === 1) {
          if (SEASON_START && new Date() < SEASON_START) {
            const blank = {};
            for (let r = 1; r <= 7; r++) blank[r] = ['—', '—', '—'];
            return blank;
          }
          const w1 = {};
          for (let r = 1; r <= 5; r++) {
            w1[r] = SEASON3_SEEDED.slice((r - 1) * 3, r * 3).map(p => p.name);
            while (w1[r].length < 3) w1[r].push('—');
          }
          w1[6] = lcqWinners("lcq_1");
          w1[7] = lcqWinners("lcq_2");
          return w1;
        }
        const prevWeek = week - 1;
        const prevMatchCount = weekMatchCounts[prevWeek - 1];
        const thisMatchCount = weekMatchCounts[week - 1];

        const nextRung = {};
        for (let r = 1; r <= prevMatchCount; r++) {
          const result = RESULTS[`${prevWeek}_${r}`];
          if (!result) continue;
          const isTop    = r === 1;
          const isBottom = r === prevMatchCount;
          result.places.forEach((entry, i) => {
            const place  = i + 1;
            const name   = entry.name;
            if (isTop    && place === 1) return;     //qualifies
            if (isBottom && place  >  1) return;     //eliminated
            if (isTop    && place === 2) { nextRung[name] = 1; return; } //stays in top rung
            if (place === 3)             { nextRung[name] = r + 1; return; } //down a rung
            if (place === 1 && checkLeapfrog(prevWeek, r))     { nextRung[name] = r - 2; return; } //leapfrogging
            if (place === 2 && checkLeapfrog(prevWeek, r + 1)) { nextRung[name] = r;     return; } //leapfrogged
            nextRung[name] = r - 1;
          });
        }

        //place players in correct rungs
        const lineup = {};
        for (let r = 1; r <= thisMatchCount; r++) lineup[r] = [];
        Object.entries(nextRung).forEach(([name, r]) => {
          const clamped = Math.max(1, Math.min(thisMatchCount, r));
          lineup[clamped].push(name);
        });

        //defaults for rungs without enough players
        for (let r = 1; r <= thisMatchCount; r++) {
          while (lineup[r].length < 3) lineup[r].push('—');
        }
        return lineup;
      }

      //number of players a match should have
      function getPlayers(week, rung) {
        if (week === WILDCARD_WEEK) return wildcardParticipants;
        return computeLineup(week)[rung] || ['—', '—', '—'];
      }

      function computeTheoryPlayers(week, rung) {
        if (week === 1) return computeLineup(1)[rung] || ['—', '—', '—'];
        const prevWeek       = week - 1;
        const prevMatchCount = weekMatchCounts[prevWeek - 1];
        const thisMatchCount = weekMatchCounts[week - 1];

        const rungEntries = {};
        for (let r = 1; r <= prevMatchCount; r++) {
          const realResult = RESULTS[`${prevWeek}_${r}`];
          if (realResult) {
            rungEntries[r] = realResult.places.map(e => ({ name: e.name, status: e.status || null }));
          } else {
            const picks = theoryPicks[`${prevWeek}_${r}`];
            if (!picks || picks.every(p => p === null)) continue;
            const players = computeTheoryPlayers(prevWeek, r);
            const placed  = [null, null, null];
            const leftover = [];
            players.forEach((name, i) => {
              const p = picks[i];
              if (p !== null && p !== undefined) placed[p - 1] = name;
              else leftover.push(name);
            });
            let li = 0;
            for (let i = 0; i < 3; i++) { if (placed[i] === null) placed[i] = leftover[li++] || '—'; }
            rungEntries[r] = placed.map(name => ({ name, status: null }));
          }
        }

        const nextRung = {};
        const theoryLeapfrogRungs = new Set();
        for (let r = 1; r <= prevMatchCount; r++) {
          if (!rungEntries[r]) continue;
          const isTop      = r === 1;
          const isBottom   = r === prevMatchCount;
          const matchKey   = `${prevWeek}_${r}`;
          const isRealResult = !!RESULTS[matchKey];
          rungEntries[r].forEach((entry, idx) => {
            const { name, status } = entry;
            const place = idx + 1;
            if (!name || name === '—') return;
            if (isTop    && place === 1) return;                         // qualifies
            if (isBottom && place  >  1) return;                         // eliminated
            if (isTop    && place === 2) { nextRung[name] = 1; return; } // stays top
            if (place === 3)             { nextRung[name] = r + 1; return; } // down
            const realLeaping = isRealResult && place === 1 && checkLeapfrog(prevWeek, r);
            const realLeaped  = isRealResult && place === 2 && checkLeapfrog(prevWeek, r + 1);
            if (realLeaped || status === 'leapfrogged') { nextRung[name] = r; return; } // leapfrogged
            const isTheoryLeap = !isRealResult && place === 1 && r > 2
                                 && theoryLeapfrogs[matchKey] !== undefined;
            if (realLeaping || status === 'leapfrogging' || isTheoryLeap) {
              nextRung[name] = r - 2;
              if (isTheoryLeap) theoryLeapfrogRungs.add(r);
              return;
            }
            nextRung[name] = r - 1;
          });
        }

        theoryLeapfrogRungs.forEach(r => {
          const above       = r - 1;
          const secondPlace = rungEntries[above]?.[1]?.name;
          if (!secondPlace || secondPlace === '—') return;
          nextRung[secondPlace] = above; // leapfrogged
        });

        const lineup = {};
        for (let r = 1; r <= thisMatchCount; r++) lineup[r] = [];
        Object.entries(nextRung).forEach(([name, tRung]) => {
          lineup[Math.max(1, Math.min(thisMatchCount, tRung))].push(name);
        });
        for (let r = 1; r <= thisMatchCount; r++) {
          while (lineup[r].length < 3) lineup[r].push('—');
        }
        return lineup[rung] || ['—', '—', '—'];
      }

      function buildBracket() {
      const container = document.getElementById('bracket-scroll');
      if (!container) return;
      container.innerHTML = '';
      let wildcardEl = null;
      let week7El = null;

      //wildcard standings
      const qualifiedPlayers = new Set();
      const eliminatedPlayers = new Set();
      Object.entries(RESULTS).forEach(([key, result]) => {
        const [wStr, rStr] = key.split('_');
        const w = parseInt(wStr), r = parseInt(rStr);
        if (!(w >= 1 && w < WILDCARD_WEEK)) return; // only weeks 1–7
        const matchCount = weekMatchCounts[w - 1];
        const isTop = r === 1;
        const isBot = r === matchCount;
        (result.places || []).forEach((entry, i) => {
          const place = i + 1;
          if (isTop && place === 1) qualifiedPlayers.add(entry.name);
          if (isBot && place > 1) eliminatedPlayers.add(entry.name);
        });
      });

      //stats for tooltips on standings page
      const playerStats = {};
      Object.entries(RESULTS).forEach(([key, result]) => {
        const [wStr] = key.split('_');
        const w = parseInt(wStr);
        if (!(w >= 1 && w < WILDCARD_WEEK)) return; // only weeks 1–7, no top 8
        (result.places || []).forEach(entry => {
          const secs = parseTime(entry.time);
          if (secs === null || isNaN(secs)) return;
          if (!playerStats[entry.name]) playerStats[entry.name] = { best: secs, times: [secs] };
          else {
            if (secs < playerStats[entry.name].best) playerStats[entry.name].best = secs;
            playerStats[entry.name].times.push(secs);
          }
        });
      });

      //remove ppl in top 8 from wildcard standings
      const playerBest = {}, playerAllTimes = {};
      Object.entries(playerStats).forEach(([name, s]) => {
        if (!qualifiedPlayers.has(name)) {
          playerBest[name] = s.best;
          playerAllTimes[name] = s.times;
        }
      });

      const top10Best = Object.entries(playerBest).sort((a, b) => a[1] - b[1]).slice(0, 10);
      const top10Avg = Object.entries(playerAllTimes)
        .map(([name, times]) => [name, times.reduce((a, b) => a + b, 0) / times.length])
        .sort((a, b) => a[1] - b[1]).slice(0, 10);

      //wildcard matchup prioritizing best time over avg if it's the same person in both
      const wcFastest = top10Best[0] ? top10Best[0][0] : null;
      const wcAvgPlayer = top10Avg.find(([name]) => name !== wcFastest);
      const wcAvg = wcAvgPlayer ? wcAvgPlayer[0] : null;
      wildcardParticipants = [wcFastest || '—', wcAvg || '—'];

      //initial seeding
      const week1Seed = {};
      Object.entries(computeLineup(1)).forEach(([rung, players]) => {
        players.forEach((name, i) => {
          week1Seed[name] = (parseInt(rung) - 1) * 3 + (i + 1);
        });
      });

      //tooltip for clicking on player names in the card
      let bpTooltipEl = document.getElementById('bp-shared-tooltip');
      if (!bpTooltipEl) {
        bpTooltipEl = document.createElement('div');
        bpTooltipEl.id = 'bp-shared-tooltip';
        document.body.appendChild(bpTooltipEl);
        document.addEventListener('click', () => { bpTooltipEl.style.display = 'none'; });
      }

      //tooltip for the icons
      function showIconTip(icon) {
        bpTooltipEl.style.minWidth = '0';
        bpTooltipEl.style.padding = '.25rem .55rem';
        bpTooltipEl.innerHTML = `<div style="font-size:.78rem;color:var(--text);white-space:nowrap">${icon.dataset.tip}</div>`;
        bpTooltipEl.style.display = 'block';
        bpTooltipEl.style.left = '0px';
        bpTooltipEl.style.top = '0px';
        const tipRect  = bpTooltipEl.getBoundingClientRect();
        const iconRect = icon.getBoundingClientRect();
        const top = iconRect.top - tipRect.height - 6 >= 0
          ? iconRect.top - tipRect.height - 6
          : iconRect.bottom + 6;
        let left = iconRect.left + iconRect.width / 2 - tipRect.width / 2;
        left = Math.max(8, Math.min(left, window.innerWidth - tipRect.width - 8));
        bpTooltipEl.style.left = `${left}px`;
        bpTooltipEl.style.top = `${top}px`;
      }
      document.addEventListener('mouseover', e => {
        const icon = e.target.closest('.bp-move[data-tip]');
        if (icon) showIconTip(icon);
      });
      document.addEventListener('mouseout', e => {
        const icon = e.target.closest('.bp-move[data-tip]');
        if (icon && !icon.contains(e.relatedTarget)) bpTooltipEl.style.display = 'none';
      });

      //timer on live boxes
      function tickElapsed() {
        if (!document.getElementById('standings')?.classList.contains('active')) return;
        document.querySelectorAll('.live-elapsed[data-start]').forEach(el => {
          const elapsed = Math.max(0, Math.floor((Date.now() - new Date(el.dataset.start)) / 1000));
          const h = Math.floor(elapsed / 3600);
          const m = Math.floor((elapsed % 3600) / 60);
          const s = elapsed % 60;
          el.textContent = `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
        });
      }
      tickElapsed();
      setInterval(tickElapsed, 1000);

      //creating all the weeks
      for (let w = 1; w <= WEEKS; w++) {
        const matchCount = weekMatchCounts[w - 1];
        const weekEl = document.createElement('div');
        weekEl.className = 'bracket-week';

        const WEEK_DATES = ['May 11–17', 'May 18–24', 'May 25–31', 'June 1–7', 'June 8–14', 'June 15–21', 'June 15–21', 'June 21–22'];
        const dateRange = document.createElement('div');
        dateRange.className = 'bracket-week-dates';
        dateRange.textContent = WEEK_DATES[w - 1] || '';
        weekEl.appendChild(dateRange);

        const label = document.createElement('div');
        label.className = 'bracket-week-label';
        label.textContent = w === WILDCARD_WEEK ? 'Wildcard' : `Week ${w}`;
        weekEl.appendChild(label);

        const matchesWrap = document.createElement('div');
        matchesWrap.className = 'bracket-week-matches';

        for (let r = 1; r <= matchCount; r++) {
          const isWildcard = w === WILDCARD_WEEK;
          const isTop    = r === 1;
          const isBottom = r === matchCount && !isWildcard;
          const players  = getPlayers(w, r);

          const result        = RESULTS[`${w}_${r}`];
          const isDone        = !!result && (result.places || []).length >= players.length;
          const scheduleEntry = !isDone ? (SCHEDULE[`${w}_${r}`] || null) : null;
          const scheduleRaw   = scheduleEntry ? (typeof scheduleEntry === 'string' ? scheduleEntry : scheduleEntry.time || scheduleEntry.start) : null;
          const timerStartRaw = scheduleEntry && typeof scheduleEntry === 'object' ? (scheduleEntry.timerStart || null) : null;
          const isAutoLive    = SEASON3_LIVE_TRACKING_ENABLED && !isDone && scheduleRaw && new Date() >= new Date(scheduleRaw);
          const isManualLive = SEASON3_LIVE_TRACKING_ENABLED && !isDone && LIVE_MATCH && w === LIVE_MATCH.week && r === LIVE_MATCH.rung;
          const isLive      = isAutoLive || isManualLive;
          const scheduleAt  = scheduleRaw && !isLive ? formatSchedule(scheduleRaw) : null;
          let card;
          if (isLive) {
            card = document.createElement('a');
            card.href = 'https://twitch.tv/legospeedruns';
            card.target = '_blank';
            card.rel = 'noopener';
          } else if (isDone) {
            card = document.createElement('a');
            card.href = result.vod;
            card.target = '_blank';
            card.rel = 'noopener';
          } else {
            card = document.createElement('div');
          }
          card.className = 'bracket-match' + (isLive ? ' live' : '') + (isDone ? ' done' : '');
          card.dataset.match = `${w}_${r}`;

          //header for rungs
          const rungRow = document.createElement('div');
          rungRow.className = 'bracket-match-rung';
          const rungLabel = document.createElement('span');
          const rungName = isWildcard ? 'Wildcard' : `Rung ${r}`;
          rungLabel.textContent = rungName;
          if (isTop)    rungLabel.style.color = '#ac8427';
          else if (isBottom)           rungLabel.style.color = '#ff8099';
          rungRow.appendChild(rungLabel);

          if (isLive) {
            const liveInd = document.createElement('span');
            liveInd.className = 'live-indicator';
            const elapsedHtml = timerStartRaw ? `<span class="live-elapsed" data-start="${timerStartRaw}">0:00:00</span>` : '';
            liveInd.innerHTML = elapsedHtml + '<span class="live-dot"></span>LIVE<span class="live-arrow"><svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" fill="currentColor" style="vertical-align:middle"><path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714z"/></svg></span>';
            rungRow.appendChild(liveInd);
          } else if (isDone) {
            const doneInd = document.createElement('span');
            doneInd.className = 'done-indicator';
            doneInd.innerHTML = 'VOD<span class="done-arrow"><svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" fill="currentColor" style="vertical-align:middle"><path d="M23.495 6.205a3.007 3.007 0 0 0-2.088-2.088c-1.87-.501-9.396-.501-9.396-.501s-7.507-.01-9.396.501A3.007 3.007 0 0 0 .527 6.205a31.247 31.247 0 0 0-.522 5.805 31.247 31.247 0 0 0 .522 5.783 3.007 3.007 0 0 0 2.088 2.088c1.868.502 9.396.502 9.396.502s7.506 0 9.396-.502a3.007 3.007 0 0 0 2.088-2.088 31.247 31.247 0 0 0 .5-5.783 31.247 31.247 0 0 0-.5-5.805zM9.609 15.601V8.408l6.264 3.602z"/></svg></span>';
            rungRow.appendChild(doneInd);
          } else if (scheduleAt) {
            const sched = document.createElement('span');
            sched.className = 'scheduled-indicator';
            sched.textContent = scheduleAt;
            rungRow.appendChild(sched);
          } else {
            const tbd = document.createElement('span');
            tbd.className = 'scheduled-indicator';
            tbd.textContent = 'TBD';
            rungRow.appendChild(tbd);
          }
          card.appendChild(rungRow);

          //show players
          const displayPlayers = isDone ? result.places : players;
          displayPlayers.forEach((entry, pi) => {
            const p              = isDone ? entry.name : entry;
            const time           = isDone ? entry.time : null;
            const place          = pi + 1;
            const isTbd          = p === '—';
            const qualifies      = isDone && isTop && place === 1;
            const eliminated     = isDone && (isBottom || isWildcard) && place > 1;
            const dropsDown      = isDone && !isBottom && !isWildcard && place === displayPlayers.length;
            const movesUp        = isDone && !qualifies && !eliminated && !dropsDown;
            const isLeapfrogging = isDone && place === 1 && checkLeapfrog(w, r);
            const isLeapfrogged  = isDone && place === 2 && checkLeapfrog(w, r + 1);

            //show on icons who is leapfrogging who
            let leapfrogPartner = null;
            if (isLeapfrogging) {
              const aboveResult = RESULTS[`${w}_${r - 1}`];
              leapfrogPartner = aboveResult?.places?.[1]?.name ?? null;
            } else if (isLeapfrogged) {
              const belowResult = RESULTS[`${w}_${r + 1}`];
              leapfrogPartner = belowResult?.places?.[0]?.name ?? null;
            }

            let moveArrow = '';
            if (qualifies)           moveArrow = `<span class="bp-move qualified"   data-tip="Qualified for Top 8">★</span>`;
            else if (eliminated)     moveArrow = `<span class="bp-move eliminated"  data-tip="Eliminated">✖</span>`;
            else if (dropsDown)      moveArrow = `<span class="bp-move down"        data-tip="Demoted">↓</span>`;
            else if (isLeapfrogging) moveArrow = `<span class="bp-move leapfrogging" data-tip="Leapfrogging${leapfrogPartner ? ' ' + leapfrogPartner : ''}">⇑</span>`;
            else if (isLeapfrogged)  moveArrow = `<span class="bp-move leapfrogged"  data-tip="Leapfrogged by${leapfrogPartner ? ' ' + leapfrogPartner : ''}">↔</span>`;
            else if (movesUp && isTop) moveArrow = `<span class="bp-move" style="color:var(--dim)" data-tip="Remaining in top rung">–</span>`;
            else if (movesUp)        moveArrow = `<span class="bp-move up"          data-tip="Promoted">↑</span>`;

            const pEl = document.createElement('div');
            pEl.className = 'bracket-player' + (isTbd ? ' tbd' : '') + (dropsDown || eliminated ? ' lost' : '');
            const nameHtml = isTbd ? p : `<span class="bp-name">${p}</span>`;
            const theoryPicksHtml = (!isDone && !isWildcard && !isTbd)
              ? `<span class="theory-picks" data-pi="${pi}">${r > 2 ? '<button class="theory-leap">⇑</button>' : ''}<button class="theory-pick" data-place="1">1</button><button class="theory-pick" data-place="2">2</button><button class="theory-pick" data-place="3">3</button></span>`
              : '';
            pEl.innerHTML = `<span class="bp-num">${isTbd ? '' : place}</span>${nameHtml}`
              + theoryPicksHtml
              + (time ? `<span class="bp-time">${time}</span>` : '')
              + moveArrow;
            if (!isTbd) {
              const tipSeed  = week1Seed[p] != null ? `#${week1Seed[p]}` : '—';
              const tipStats = playerStats[p];
              const tipBest  = tipStats ? fmtTime(tipStats.best) : '—';
              const tipAvg   = tipStats ? fmtTime(tipStats.times.reduce((a, b) => a + b, 0) / tipStats.times.length) : '—';
              pEl.querySelector('.bp-name').addEventListener('click', e => {
                e.preventDefault();
                e.stopPropagation();
                bpTooltipEl.style.minWidth = '190px';
                bpTooltipEl.style.padding = '.7rem .9rem';
                bpTooltipEl.innerHTML = `<div class="elim-tip-name" style="color:var(--text)">${p}</div>`
                  + `<div class="elim-tip-row"><span>Starting Seed</span><span>${tipSeed}</span></div>`
                  + `<div class="elim-tip-row"><span>Ladder PB</span><span>${tipBest}</span></div>`
                  + `<div class="elim-tip-row"><span>Ladder Avg</span><span>${tipAvg}</span></div>`;
                bpTooltipEl.style.display = 'block';
                bpTooltipEl.style.left = '0px';
                bpTooltipEl.style.top = '0px';
                const tipRect  = bpTooltipEl.getBoundingClientRect();
                const nameRect = e.currentTarget.getBoundingClientRect();
                const top = nameRect.top - tipRect.height - 8 >= 0
                  ? nameRect.top - tipRect.height - 8
                  : nameRect.bottom + 8;
                let left = nameRect.left;
                if (left + tipRect.width > window.innerWidth - 8) left = window.innerWidth - tipRect.width - 8;
                bpTooltipEl.style.left = `${left}px`;
                bpTooltipEl.style.top = `${top}px`;
              });
            }
            card.appendChild(pEl);
          });

          matchesWrap.appendChild(card);
        }

        //top 8 qualified slot
        const topRungResult = RESULTS[`${w}_1`];
        const qualName = topRungResult ? (topRungResult.places[0] || {}).name : null;
        const qualSlot = document.createElement('div');
        qualSlot.className = 'week-qualified-slot' + (qualName ? '' : ' empty');
        if (qualName) {
          const seed  = week1Seed[qualName] != null ? `#${week1Seed[qualName]}` : '—';
          const top8seed = `#${w}`;
          const stats = playerStats[qualName];
          const best  = stats ? fmtTime(stats.best) : '—';
          const avg   = stats ? fmtTime(stats.times.reduce((a, b) => a + b, 0) / stats.times.length) : '—';
          qualSlot.innerHTML = `<span class="wqs-icon">★</span><span class="wqs-name">${qualName}</span><span class="wqs-icon">★</span>`
            + `<div class="elim-tooltip wqs-tooltip">`
            +   `<div class="elim-tip-name" style="color:#e3b128">${qualName}</div>`
            +   `<div class="elim-tip-row"><span>Top 8 Seed</span><span>${top8seed}</span></div>`
            +   `<div class="elim-tip-row"><span>Starting Seed</span><span>${seed}</span></div>`
            +   `<div class="elim-tip-row"><span>Ladder PB</span><span>${best}</span></div>`
            +   `<div class="elim-tip-row"><span>Ladder Avg</span><span>${avg}</span></div>`
            + `</div>`;
        } else {
          qualSlot.innerHTML = `<span class="wqs-name">SEED ${w}</span>`;
        }
        weekEl.appendChild(qualSlot);

        weekEl.appendChild(matchesWrap);

        if (w === WILDCARD_WEEK) {
          wildcardEl = weekEl;
        } else if (w === 7) {
          week7El = weekEl;
        } else {
          container.appendChild(weekEl);
        }
      }

      //ui for wildcard standings
      const wcsEl = document.createElement('div');
      wcsEl.className = 'wildcard-standings';
      wcsEl.innerHTML = `<div class="wildcard-standings-label">Wildcard Standings</div>`;

      function wcsSection(title, rows, highlightName) {
        const frag = document.createDocumentFragment();
        const lbl = document.createElement('div');
        lbl.className = 'wcs-section-label';
        lbl.textContent = title;
        frag.appendChild(lbl);
        const extraRowEls = [];
        rows.forEach((entry, i) => {
          const row = document.createElement('div');
          const isLeader = entry && entry[0] === highlightName;
          const isExtra = i >= 3;
          row.className = 'wcs-row' + (entry ? (isLeader ? ' leader' : '') : ' empty') + (isExtra ? ' wcs-extra' : '');
          row.innerHTML = entry
            ? `<span class="wcs-rank">${ordinal(i + 1)}</span><span class="bp-name">${entry[0]}</span><span class="wcs-time">${fmtTime(entry[1])}</span>`
            : `<span class="wcs-rank">${ordinal(i + 1)}</span>—`;
          if (entry) {
            const n = entry[0];
            const tipSeed  = week1Seed[n] != null ? `#${week1Seed[n]}` : '—';
            const tipStats = playerStats[n];
            const tipBest  = tipStats ? fmtTime(tipStats.best) : '—';
            const tipAvg   = tipStats ? fmtTime(tipStats.times.reduce((a, b) => a + b, 0) / tipStats.times.length) : '—';
            row.querySelector('.bp-name').addEventListener('click', e => {
              e.stopPropagation();
              bpTooltipEl.innerHTML = `<div class="elim-tip-name" style="color:var(--text)">${n}</div>`
                + `<div class="elim-tip-row"><span>Starting Seed</span><span>${tipSeed}</span></div>`
                + `<div class="elim-tip-row"><span>Ladder PB</span><span>${tipBest}</span></div>`
                + `<div class="elim-tip-row"><span>Ladder Avg</span><span>${tipAvg}</span></div>`;
              bpTooltipEl.style.display = 'block';
              bpTooltipEl.style.left = '0px';
              bpTooltipEl.style.top = '0px';
              const tipRect  = bpTooltipEl.getBoundingClientRect();
              const nameRect = e.currentTarget.getBoundingClientRect();
              const top = nameRect.top - tipRect.height - 8 >= 0
                ? nameRect.top - tipRect.height - 8
                : nameRect.bottom + 8;
              let left = nameRect.left;
              if (left + tipRect.width > window.innerWidth - 8) left = window.innerWidth - tipRect.width - 8;
              bpTooltipEl.style.left = `${left}px`;
              bpTooltipEl.style.top = `${top}px`;
            });
          }
          if (isExtra) extraRowEls.push(row);
          frag.appendChild(row);
        });
        if (extraRowEls.length > 0) {
          const btn = document.createElement('button');
          btn.className = 'wcs-expand-btn';
          btn.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M7 10l5 5 5-5z"/></svg>`;
          btn.addEventListener('click', () => {
            const isOpen = btn.classList.toggle('open');
            if (isOpen) {
              extraRowEls.forEach((r, i) => {
                r.style.display = 'flex';
                r.style.animation = 'none';
                r.offsetHeight;
                r.style.animation = `wcsRowIn .18s ease ${i * 60}ms both`;
              });
            } else {
              extraRowEls.forEach(r => { r.style.display = 'none'; r.style.animation = ''; });
            }
          });
          frag.appendChild(btn);
        }
        return frag;
      }

      wcsEl.appendChild(wcsSection('Fastest Time', top10Best, wcFastest));
      const div = document.createElement('div'); div.className = 'wcs-divider'; wcsEl.appendChild(div);
      wcsEl.appendChild(wcsSection('Fastest Average', top10Avg, wcAvg));

      //put wildcard standings on the right
      const week7Group = document.createElement('div');
      week7Group.style.cssText = 'display:flex; flex-direction:column; align-items:center; gap:12px; align-self:flex-start; margin-top:0;';
      if (week7El) week7Group.appendChild(week7El);
      wcsEl.style.marginTop = '60px';
      week7Group.appendChild(wcsEl);


      container.appendChild(week7Group);

      //eliminated list
      const elimCol = document.createElement('div');
      elimCol.className = 'bracket-eliminated';
      const elabel = document.createElement('div');
      elabel.className = 'bracket-eliminated-label';
      elabel.textContent = '✕ Eliminated';
      elimCol.appendChild(elabel);

      const bracketWildcardWinner = (RESULTS['8_1']?.places?.[0] || {}).name || null;
      const [wc1, wc2] = wildcardParticipants;
      const week7Done = !!(RESULTS[`${WEEKS - 1}_${weekMatchCounts[WEEKS - 2]}`]?.places?.length);

      function buildElimBase14() {
        const base = [];
        for (let w = WEEKS - 1; w >= 1; w--) {
          const matchCount = weekMatchCounts[w - 1];
          for (let place = 2; place <= 3; place++) {
            const result = RESULTS[`${w}_${matchCount}`];
            const name = result ? (result.places[place - 1] || {}).name || null : null;
            base.push(name);
          }
        }
        return base;
      }

      let elimEntries;
      if (bracketWildcardWinner) {
        const base = buildElimBase14();
        const winnerIdx = base.findIndex(n => n === bracketWildcardWinner);
        const filtered = [...base];
        if (winnerIdx >= 0) filtered.splice(winnerIdx, 1);
        elimEntries = filtered.slice(0, 13);
      } else if (week7Done) {
        const base = buildElimBase14();
        const candidates = new Set([wc1, wc2].filter(p => p && p !== '—'));
        const removed = new Set();
        const filtered = [];
        for (const name of base) {
          if (name && candidates.has(name) && !removed.has(name)) {
            removed.add(name);
          } else {
            filtered.push(name);
          }
        }
        elimEntries = [null, ...filtered.slice(0, 12)];
      } else {
        elimEntries = [null];
        for (let w = WEEKS - 2; w >= 1; w--) {
          const matchCount = weekMatchCounts[w - 1];
          for (let place = 2; place <= 3; place++) {
            const result = RESULTS[`${w}_${matchCount}`];
            const name = result ? (result.places[place - 1] || {}).name || null : null;
            elimEntries.push(name);
          }
        }
      }

      elimEntries.forEach((name, i) => {
        const placement = 9 + i;
        const slotEl = document.createElement('div');
        slotEl.className = 'eliminated-slot' + (name ? '' : ' empty');

        if (name) {
          const seed  = week1Seed[name] != null ? `#${week1Seed[name]}` : '—';
          const stats = playerStats[name];
          const best  = stats ? fmtTime(stats.best) : '—';
          const avg   = stats ? fmtTime(stats.times.reduce((a, b) => a + b, 0) / stats.times.length) : '—';
          slotEl.innerHTML = `<span class="es-ord">${ordinal(placement)}</span>${name}`
            + `<div class="elim-tooltip">`
            +   `<div class="elim-tip-name">${name}</div>`
            +   `<div class="elim-tip-row"><span>Seed</span><span>${seed}</span></div>`
            +   `<div class="elim-tip-row"><span>Ladder PB</span><span>${best}</span></div>`
            +   `<div class="elim-tip-row"><span>Ladder Avg</span><span>${avg}</span></div>`
            + `</div>`;
        } else {
          slotEl.innerHTML = `<span class="es-ord">${ordinal(placement)}</span>—`;
        }

        elimCol.appendChild(slotEl);
      });

      const wildcardGroup = document.createElement('div');
      wildcardGroup.style.cssText = 'display:flex; flex-direction:column; align-items:center; gap:12px; align-self:stretch;';
      if (wildcardEl) wildcardGroup.appendChild(wildcardEl);
      wildcardGroup.appendChild(elimCol);
      container.appendChild(wildcardGroup);

      window._refreshTheoryBracket = function() {
        const scroll = document.getElementById('bracket-scroll');
        if (!scroll) return;
        scroll.querySelectorAll('.bracket-match:not(.done)[data-match]').forEach(card => {
          const parts = card.dataset.match.split('_');
          const w = parseInt(parts[0]), r = parseInt(parts[1]);
          if (w === WILDCARD_WEEK) return;
          const newPlayers = computeTheoryPlayers(w, r);
          const playerEls  = card.querySelectorAll('.bracket-player');
          let changed = false;
          playerEls.forEach((pEl, i) => {
            const cur = pEl.querySelector('.bp-name')?.textContent ?? '—';
            if (cur !== (newPlayers[i] || '—')) changed = true;
          });
          if (!changed) return;
          delete theoryPicks[card.dataset.match];
          delete theoryLeapfrogs[card.dataset.match];
          playerEls.forEach((pEl, i) => {
            const name  = newPlayers[i] || '—';
            const isTbd = name === '—';
            pEl.className = 'bracket-player' + (isTbd ? ' tbd' : '');
            if (isTbd) {
              pEl.innerHTML = '<span class="bp-num"></span>—';
            } else {
              const leapHtml = r > 2 ? '<button class="theory-leap">⇑</button>' : '';
              pEl.innerHTML = `<span class="bp-num"></span><span class="bp-name">${name}</span>`
                + `<span class="theory-picks" data-pi="${i}">${leapHtml}<button class="theory-pick" data-place="1">1</button><button class="theory-pick" data-place="2">2</button><button class="theory-pick" data-place="3">3</button></span>`;
              const tipSeed  = week1Seed[name] != null ? `#${week1Seed[name]}` : '—';
              const tipStats = playerStats[name];
              const tipBest  = tipStats ? fmtTime(tipStats.best) : '—';
              const tipAvg   = tipStats ? fmtTime(tipStats.times.reduce((a, b) => a + b, 0) / tipStats.times.length) : '—';
              pEl.querySelector('.bp-name').addEventListener('click', ev => {
                ev.preventDefault();
                ev.stopPropagation();
                bpTooltipEl.style.minWidth = '190px';
                bpTooltipEl.style.padding = '.7rem .9rem';
                bpTooltipEl.innerHTML = `<div class="elim-tip-name" style="color:var(--text)">${name}</div>`
                  + `<div class="elim-tip-row"><span>Starting Seed</span><span>${tipSeed}</span></div>`
                  + `<div class="elim-tip-row"><span>Ladder PB</span><span>${tipBest}</span></div>`
                  + `<div class="elim-tip-row"><span>Ladder Avg</span><span>${tipAvg}</span></div>`;
                bpTooltipEl.style.display = 'block';
                bpTooltipEl.style.left = '0px';
                bpTooltipEl.style.top = '0px';
                const tipRect  = bpTooltipEl.getBoundingClientRect();
                const nameRect = ev.currentTarget.getBoundingClientRect();
                const top = nameRect.top - tipRect.height - 8 >= 0
                  ? nameRect.top - tipRect.height - 8
                  : nameRect.bottom + 8;
                let left = nameRect.left;
                if (left + tipRect.width > window.innerWidth - 8) left = window.innerWidth - tipRect.width - 8;
                bpTooltipEl.style.left = `${left}px`;
                bpTooltipEl.style.top  = `${top}px`;
              });
            }
          });
        });
      };
      }

      function scheduleAutoLive() {
        const now = Date.now();
        Object.values(SCHEDULE).forEach(entry => {
          const isoStr = typeof entry === 'string' ? entry : entry?.time;
          if (!isoStr) return;
          const ms = new Date(isoStr).getTime() - now;
          if (ms > 0) setTimeout(buildBracket, ms);
        });
      }

      async function loadResults() {
        const res = await fetch('/data/results.json', { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      }

      function applyResults(data) {
        RESULTS = data;
        LCQ_RESULTS = { lcq_1: data.lcq_1, lcq_2: data.lcq_2 };
      }

      async function init() {
        try {
          applyResults(await loadResults());
        } catch (e) {
          console.error('Could not load results.json', e);
        }
        buildBracket();
        window._ladderOnlyWildcardLeft = checkOnlyWildcardLeft();
        updateTheoryToggleVisibility();
        scheduleAutoLive();
        setInterval(async () => {
          try {
            const data = await loadResults();
            if (JSON.stringify(data) !== JSON.stringify(RESULTS)) {
              applyResults(data);
              buildBracket();
              window._ladderOnlyWildcardLeft = checkOnlyWildcardLeft();
              updateTheoryToggleVisibility();
            }
          } catch (e) { /*probably network error so retry*/}
        }, 30_000);
        document.addEventListener('amUpdate', async () => {
          try {
            const [sd, data] = await Promise.all([
              fetch('/data/schedule.json', { cache: 'no-store' }).then(r => r.json()),
              loadResults(),
            ]);
            const liveChanged = (sd.liveMatch || null) !== LIVE_MATCH;
            LIVE_MATCH  = sd.liveMatch  || null;
            SCHEDULE    = sd.ladder     || {};
            if (liveChanged || JSON.stringify(data) !== JSON.stringify(RESULTS)) {
              applyResults(data);
              buildBracket();
            }
          } catch (e) {}
        });
      }

      Promise.all([schedulePromise, participantsPromise]).then(([sd, allParticipants]) => {
        SCHEDULE      = sd.ladder    || {};
        LIVE_MATCH    = sd.liveMatch || null;
        SEASON_START  = sd.countdown ? new Date(sd.countdown) : null;
        LADDER_START  = sd.lcqEnd    ? new Date(sd.lcqEnd)    : null;
        SEASON3_SEEDED = (allParticipants.season3 || [])
          .filter(p => p.seed <= 15)
          .sort((a, b) => a.seed - b.seed)
          .slice(0, 15);
        window._runWhenIdle ? window._runWhenIdle(init) : init();
      });

      function checkOnlyWildcardLeft() {
        for (let w = 1; w < WILDCARD_WEEK; w++) {
          const count = weekMatchCounts[w - 1];
          for (let r = 1; r <= count; r++) {
            if (!RESULTS[`${w}_${r}`]) return false;
          }
        }
        return !RESULTS[`${WILDCARD_WEEK}_1`];
      }

      window._buildBracket = function() {
        buildBracket();
        window._ladderOnlyWildcardLeft = checkOnlyWildcardLeft();
        updateTheoryToggleVisibility();
      };

    })();

    //TOP 8
    (function() {

      let TOP8_RESULTS = {};
      let TOP8_SEEDS = Array(8).fill(null);
      let TOP8_SCHEDULE = {}; //obsolete

      const ROUNDS_CONFIG = [
        { id: 'qf', name: 'Quarterfinals', matches: 4 },
        { id: 'sf', name: 'Semifinals', matches: 2 },
        { id: 'gf', name: 'Finals', matchName: 'Grand Finals', matches: 1 },
      ];

      const ROUND_LABEL_PREFIX = {
        qf: 'Quarterfinal',
        sf: 'Semifinal',
        gf: 'Grand Finals',
      };

      function seedOf(name) {
        const i = TOP8_SEEDS.indexOf(name);
        return i >= 0 ? i + 1 : null;
      }

      function winnerOf(key) {
        return TOP8_RESULTS[key]?.places?.[0]?.name || null;
      }

      function loserOf(key) {
        return TOP8_RESULTS[key]?.places?.[1]?.name || null;
      }

      function getTop8Players(roundId, matchNum) {
        const tbd = { name: '—', seed: null };
        const player = name => name ? { name, seed: seedOf(name) } : tbd;

        if (roundId === 'qf') {
          //top 8 seeding (so like 1v8 2v7 etc)
          const pairings = [[0,7],[3,4],[1,6],[2,5]];
          const [i, j] = pairings[matchNum - 1];
          return [
            { name: TOP8_SEEDS[i] || '—', seed: i + 1 },
            { name: TOP8_SEEDS[j] || '—', seed: j + 1 },
          ];
        }
        if (roundId === 'sf') {
          const base = (matchNum - 1) * 2 + 1;
          return [player(winnerOf(`qf_${base}`)), player(winnerOf(`qf_${base + 1}`))];
        }
        if (roundId === 'gf') {
          return [player(winnerOf('sf_1')), player(winnerOf('sf_2'))];
        }
        if (roundId === 'tp') {
          return [player(loserOf('sf_1')), player(loserOf('sf_2'))];
        }
        //default if we don't have anything yet
        return [tbd, tbd];
      }

      function parseTime(t) {
        if (!t) return null;
        const [h, m, s] = t.split(':').map(Number);
        return h * 3600 + m * 60 + s;
      }

      function formatSchedule(isoStr) {
        const d = new Date(isoStr);
        if (isNaN(d.getTime())) return null;
        const date = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
        return `${date} · ${time}`;
      }

      function buildTop8Bracket() {
        const container = document.getElementById('bracket-scroll-top8');
        if (!container) return;
        container.innerHTML = '';

        ROUNDS_CONFIG.forEach((roundConfig, roundIndex) => {
          const roundEl = document.createElement('div');
          roundEl.className = 'bracket-round';

          const label = document.createElement('div');
          label.className = 'bracket-round-label';
          label.textContent = roundConfig.name;
          roundEl.appendChild(label);

          const matchesWrap = document.createElement('div');
          matchesWrap.className = 'bracket-round-matches';

          for (let m = 1; m <= roundConfig.matches; m++) {
            const players = getTop8Players(roundConfig.id, m);
            const result = TOP8_RESULTS[`${roundConfig.id}_${m}`];
            const isDone = !!result;
            const scheduleEntry = !isDone ? (TOP8_SCHEDULE[`${roundConfig.id}_${m}`] || null) : null;
            const scheduleRaw = scheduleEntry ? (typeof scheduleEntry === 'string' ? scheduleEntry : scheduleEntry.time || scheduleEntry.start || null) : null;
            const isAutoLive = SEASON3_LIVE_TRACKING_ENABLED && !isDone && scheduleRaw && new Date() >= new Date(scheduleRaw);
            const isLive = isAutoLive;
            const scheduleAt = scheduleRaw && !isLive ? formatSchedule(scheduleRaw) : null;

            let card;
            if (isLive) {
              card = document.createElement('a');
              card.href = 'https://twitch.tv/legospeedruns';
              card.target = '_blank';
              card.rel = 'noopener';
            } else if (isDone) {
              card = document.createElement('a');
              card.href = result.vod || '#';
              card.target = '_blank';
              card.rel = 'noopener';
            } else {
              card = document.createElement('div');
            }
            card.className = 'top8-match' + (isLive ? ' live' : '') + (isDone ? ' done' : '');
            card.id = `top8-card-${roundConfig.id}-${m}`;

            //header for match
            const matchRow = document.createElement('div');
            matchRow.className = 'top8-match-rung';
            const matchLabel = document.createElement('span');
            const roundLabel = ROUND_LABEL_PREFIX[roundConfig.id] || 'Match';
            matchLabel.textContent = roundConfig.matches === 1 ? (roundConfig.matchName || roundConfig.name) : `${roundLabel} ${m}`;
            matchRow.appendChild(matchLabel);

            if (isLive) {
              const liveInd = document.createElement('span');
              liveInd.className = 'top8-live-indicator';
              liveInd.innerHTML = '<span class="top8-live-dot"></span>LIVE<span class="top8-live-arrow"><svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" fill="currentColor" style="vertical-align:middle"><path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714z"/></svg></span>';
              matchRow.appendChild(liveInd);
            } else if (isDone) {
              const doneInd = document.createElement('span');
              doneInd.className = 'top8-done-indicator';
              doneInd.innerHTML = 'VOD<span class="top8-done-arrow"><svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" fill="currentColor" style="vertical-align:middle"><path d="M23.495 6.205a3.007 3.007 0 0 0-2.088-2.088c-1.87-.501-9.396-.501-9.396-.501s-7.507-.01-9.396.501A3.007 3.007 0 0 0 .527 6.205a31.247 31.247 0 0 0-.522 5.805 31.247 31.247 0 0 0 .522 5.783 3.007 3.007 0 0 0 2.088 2.088c1.868.502 9.396.502 9.396.502s7.506 0 9.396-.502a3.007 3.007 0 0 0 2.088-2.088 31.247 31.247 0 0 0 .5-5.783 31.247 31.247 0 0 0-.5-5.805zM9.609 15.601V8.408l6.264 3.602z"/></svg></span>';
              matchRow.appendChild(doneInd);
            } else if (scheduleAt) {
              const sched = document.createElement('span');
              sched.className = 'top8-scheduled-indicator';
              sched.textContent = scheduleAt;
              matchRow.appendChild(sched);
            } else {
              const tbd = document.createElement('span');
              tbd.className = 'top8-scheduled-indicator';
              tbd.textContent = 'TBD';
              matchRow.appendChild(tbd);
            }
            card.appendChild(matchRow);

            const winner = isDone ? result.places[0]?.name : null;
            players.forEach((entry) => {
              const p     = entry.name;
              const isTbd = p === '—';
              const seed  = entry.seed;
              const resultEntry = isDone && !isTbd ? result.places.find(r => r.name === p) : null;
              const time  = resultEntry?.time || null;

              const pEl = document.createElement('div');
              const isGF = roundConfig.id === 'gf';
              const winClass  = isGF ? ' champion' : ' won';
              const lossClass = isGF ? ' runner-up' : ' lost';
              const resultClass = isDone && !isTbd ? (p === winner ? winClass : lossClass) : '';
              pEl.className = 'top8-bracket-player' + (isTbd ? ' tbd' : '') + resultClass;
              pEl.innerHTML = `<span class="bp-num">${seed || ''}</span>${p}`
                + (time ? `<span class="bp-time">${time}</span>` : '');
              card.appendChild(pEl);
            });

            matchesWrap.appendChild(card);
          }

          //third place match in grands column
          if (roundConfig.id === 'gf') {
            const tpPlayers = getTop8Players('tp', 1);
            const tpResult = TOP8_RESULTS['tp_1'];
            const tpIsDone = !!tpResult;
            const tpScheduleEntry = !tpIsDone ? (TOP8_SCHEDULE['tp_1'] || null) : null;
            const tpScheduleRaw = tpScheduleEntry ? (typeof tpScheduleEntry === 'string' ? tpScheduleEntry : tpScheduleEntry.time || tpScheduleEntry.start || null) : null;
            const tpIsLive = SEASON3_LIVE_TRACKING_ENABLED && !tpIsDone && tpScheduleRaw && new Date() >= new Date(tpScheduleRaw);
            const tpScheduleAt = tpScheduleRaw && !tpIsLive ? formatSchedule(tpScheduleRaw) : null;
            let tpCard;
            if (tpIsLive) {
              tpCard = document.createElement('a');
              tpCard.href = 'https://twitch.tv/legospeedruns';
              tpCard.target = '_blank';
              tpCard.rel = 'noopener';
            } else if (tpIsDone) {
              tpCard = document.createElement('a');
              tpCard.href = tpResult.vod || '#';
              tpCard.target = '_blank';
              tpCard.rel = 'noopener';
            } else {
              tpCard = document.createElement('div');
            }
            tpCard.className = 'top8-match' + (tpIsLive ? ' live' : '') + (tpIsDone ? ' done' : '');
            tpCard.id = 'top8-card-tp-1';
            const tpMatchRow = document.createElement('div');
            tpMatchRow.className = 'top8-match-rung';
            const tpMatchLabel = document.createElement('span');
            tpMatchLabel.textContent = '3rd Place Match';
            tpMatchRow.appendChild(tpMatchLabel);
            if (tpIsLive) {
              const liveInd = document.createElement('span');
              liveInd.className = 'top8-live-indicator';
              liveInd.innerHTML = '<span class="top8-live-dot"></span>LIVE<span class="top8-live-arrow"><svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" fill="currentColor" style="vertical-align:middle"><path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714z"/></svg></span>';
              tpMatchRow.appendChild(liveInd);
            } else if (tpIsDone) {
              const doneInd = document.createElement('span');
              doneInd.className = 'top8-done-indicator';
              doneInd.innerHTML = 'VOD<span class="top8-done-arrow"><svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" fill="currentColor" style="vertical-align:middle"><path d="M23.495 6.205a3.007 3.007 0 0 0-2.088-2.088c-1.87-.501-9.396-.501-9.396-.501s-7.507-.01-9.396.501A3.007 3.007 0 0 0 .527 6.205a31.247 31.247 0 0 0-.522 5.805 31.247 31.247 0 0 0 .522 5.783 3.007 3.007 0 0 0 2.088 2.088c1.868.502 9.396.502 9.396.502s7.506 0 9.396-.502a3.007 3.007 0 0 0 2.088-2.088 31.247 31.247 0 0 0 .5-5.783 31.247 31.247 0 0 0-.5-5.805zM9.609 15.601V8.408l6.264 3.602z"/></svg></span>';
              tpMatchRow.appendChild(doneInd);
            } else if (tpScheduleAt) {
              const sched = document.createElement('span');
              sched.className = 'top8-scheduled-indicator';
              sched.textContent = tpScheduleAt;
              tpMatchRow.appendChild(sched);
            } else {
              const tbd2 = document.createElement('span');
              tbd2.className = 'top8-scheduled-indicator';
              tbd2.textContent = 'TBD';
              tpMatchRow.appendChild(tbd2);
            }
            tpCard.appendChild(tpMatchRow);
            const tpWinner = tpIsDone ? tpResult.places[0]?.name : null;
            tpPlayers.forEach(entry => {
              const p = entry.name;
              const isTbd = p === '—';
              const resultEntry = tpIsDone && !isTbd ? tpResult.places.find(r => r.name === p) : null;
              const time = resultEntry?.time || null;
              const pEl = document.createElement('div');
              const resultClass = tpIsDone && !isTbd ? (p === tpWinner ? ' won' : ' lost') : '';
              pEl.className = 'top8-bracket-player' + (isTbd ? ' tbd' : '') + resultClass;
              pEl.innerHTML = `<span class="bp-num">${entry.seed || ''}</span>${p}` + (time ? `<span class="bp-time">${time}</span>` : '');
              tpCard.appendChild(pEl);
            });
            roundEl.style.position = 'relative';
            const tpWrapper = document.createElement('div');
            tpWrapper.id = 'tp-match-wrapper';
            tpWrapper.style.cssText = 'position:absolute;left:0;width:100%;display:flex;justify-content:center;transform:scale(0.92);transform-origin:center;';
            tpWrapper.appendChild(tpCard);
            roundEl.appendChild(tpWrapper);
          }

          roundEl.appendChild(matchesWrap);
          container.appendChild(roundEl);
        });

        //results section on right
        const resultsCol = document.createElement('div');
        resultsCol.className = 'bracket-round bracket-round-results';
        const resultsLabel = document.createElement('div');
        resultsLabel.className = 'bracket-round-label';
        resultsLabel.textContent = 'Results';
        resultsCol.appendChild(resultsLabel);
        const resultsStack = document.createElement('div');
        resultsStack.className = 'top8-results-stack';
        const champBoxEl = document.createElement('div');
        champBoxEl.id = 'top8-champion-box';
        champBoxEl.className = 'top8-champion-box';
        champBoxEl.innerHTML = '<div class="top8-champion-label">★ Champion ★</div><div class="top8-champion-name" id="top8-champion-name"></div>';
        resultsStack.appendChild(champBoxEl);
        const ruBoxEl = document.createElement('div');
        ruBoxEl.id = 'top8-runnerup-box';
        ruBoxEl.className = 'top8-runnerup-box';
        ruBoxEl.innerHTML = '<div class="top8-runnerup-label">Runner-Up</div><div class="top8-runnerup-name" id="top8-runnerup-name"></div>';
        resultsStack.appendChild(ruBoxEl);
        const bronzeBoxEl = document.createElement('div');
        bronzeBoxEl.id = 'top8-bronze-box';
        bronzeBoxEl.className = 'top8-bronze-box';
        bronzeBoxEl.innerHTML = '<div class="top8-bronze-label">3rd Place</div><div class="top8-bronze-name" id="top8-bronze-name"></div>';
        resultsStack.appendChild(bronzeBoxEl);
        const restBoxEl = document.createElement('div');
        restBoxEl.id = 'top8-rest-box';
        restBoxEl.className = 'top8-rest-box';
        restBoxEl.innerHTML = '<div id="top8-rest-list"></div>';
        resultsStack.appendChild(restBoxEl);
        resultsCol.appendChild(resultsStack);
        container.appendChild(resultsCol);

        //main 3 boxes
        const champion   = TOP8_RESULTS['gf_1']?.places?.[0]?.name || null;
        const runnerUp   = TOP8_RESULTS['gf_1']?.places?.[1]?.name || null;
        const thirdPlace = TOP8_RESULTS['tp_1']?.places?.[0]?.name || null;
        const champBox  = document.getElementById('top8-champion-box');
        const champName = document.getElementById('top8-champion-name');
        if (champBox && champName) {
          champName.textContent = champion || '';
          champBox.classList.toggle('visible', !!champion);
        }
        const ruBox  = document.getElementById('top8-runnerup-box');
        const ruName = document.getElementById('top8-runnerup-name');
        if (ruBox && ruName) {
          ruName.textContent = runnerUp || '';
          ruBox.classList.toggle('visible', !!runnerUp);
        }
        const bronzeBox  = document.getElementById('top8-bronze-box');
        const bronzeName = document.getElementById('top8-bronze-name');
        if (bronzeBox && bronzeName) {
          bronzeName.textContent = thirdPlace || '';
          bronzeBox.classList.toggle('visible', !!thirdPlace);
        }
        //4th+ boxes
        function parseTime(t) {
          if (!t) return Infinity;
          const parts = t.split(':').map(Number);
          return parts[0] * 3600 + parts[1] * 60 + (parts[2] || 0);
        }
        const qfLosers = ['qf_1','qf_2','qf_3','qf_4']
          .map(key => {
            const loser = TOP8_RESULTS[key]?.places?.[1];
            return loser ? { name: loser.name, time: loser.time } : null;
          })
          .filter(Boolean)
          .sort((a, b) => parseTime(a.time) - parseTime(b.time));
        const restPlaces = [
          { place: '4th', name: TOP8_RESULTS['tp_1']?.places?.[1]?.name || null },
          ...qfLosers.map((p, i) => ({ place: `${5 + i}th`, name: p.name })),
          ...(qfLosers.length < 4
            ? Array.from({ length: 4 - qfLosers.length }, (_, i) => ({ place: `${5 + qfLosers.length + i}th`, name: null }))
            : []),
        ];
        const restBox  = document.getElementById('top8-rest-box');
        const restList = document.getElementById('top8-rest-list');
        if (restBox && restList) {
          const anyKnown = restPlaces.some(p => p.name);
          restList.innerHTML = restPlaces.map(p =>
            `<div class="top8-rest-row">
               <span class="top8-rest-place">${p.place}</span>
               <span class="top8-rest-name">${p.name || '—'}</span>
             </div>`
          ).join('');
          restBox.classList.toggle('visible', anyKnown);
        }

        requestAnimationFrame(() => { positionThirdPlaceMatch(); drawTop8Connectors(); });
      }

      function positionThirdPlaceMatch() {
        const sf2 = document.getElementById('top8-card-sf-2');
        const tpWrapper = document.getElementById('tp-match-wrapper');
        if (!sf2 || !tpWrapper) return;
        const roundEl = tpWrapper.parentElement;
        const sf2Rect = sf2.getBoundingClientRect();
        const roundRect = roundEl.getBoundingClientRect();
        const tpH = tpWrapper.getBoundingClientRect().height;
        const sf2CenterY = (sf2Rect.top + sf2Rect.bottom) / 2;
        tpWrapper.style.top = `${sf2CenterY - roundRect.top - tpH / 2}px`;
      }

      function drawTop8Connectors() {
        const container = document.getElementById('bracket-scroll-top8');
        if (!container) return;

        const old = container.querySelector('.top8-connectors-svg');
        if (old) old.remove();

        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.classList.add('top8-connectors-svg');
        svg.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none;z-index:0;overflow:visible;';
        svg.setAttribute('width', container.scrollWidth);
        svg.setAttribute('height', container.scrollHeight);

        const cr = container.getBoundingClientRect();

        const groups = [
          [['top8-card-qf-1', 'top8-card-qf-2'], 'top8-card-sf-1'],
          [['top8-card-qf-3', 'top8-card-qf-4'], 'top8-card-sf-2'],
          [['top8-card-sf-1', 'top8-card-sf-2'], 'top8-card-gf-1'],
        ];

        groups.forEach(([[id1, id2], tgtId]) => {
          const el1 = document.getElementById(id1);
          const el2 = document.getElementById(id2);
          const elT = document.getElementById(tgtId);
          if (!el1 || !el2 || !elT) return;

          const r1 = el1.getBoundingClientRect();
          const r2 = el2.getBoundingClientRect();
          const rt = elT.getBoundingClientRect();

          const y1   = (r1.top + r1.bottom) / 2 - cr.top;
          const y2   = (r2.top + r2.bottom) / 2 - cr.top;
          const yt   = (rt.top + rt.bottom) / 2 - cr.top;
          const xSrc = r1.right - cr.left;
          const xTgt = rt.left  - cr.left;
          const midX = (xSrc + xTgt) / 2;

          const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          path.setAttribute('d',
            `M${xSrc},${y1} H${midX} V${y2} M${xSrc},${y2} H${midX} M${midX},${yt} H${xTgt}`
          );
          path.setAttribute('stroke', 'rgba(255,255,255,0.13)');
          path.setAttribute('stroke-width', '1.5');
          path.setAttribute('fill', 'none');
          svg.appendChild(path);
        });

        container.insertBefore(svg, container.firstChild);
      }

      async function loadTop8Results() {
        try {
          const res = await fetch('/data/results.json', { cache: 'no-store' });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = await res.json();

          TOP8_SEEDS = Array.from({ length: 8 }, (_, i) => {
            const week = i + 1;
            return data[`${week}_1`]?.places?.[0]?.name || null;
          });

          return Object.keys(data).reduce((acc, key) => {
            if (key.match(/^(qf|sf|gf|tp)_\d+$/)) {
              acc[key] = data[key];
            }
            return acc;
          }, {});
        } catch (e) {
          console.error('Failed to load top 8 results:', e);
          return {};
        }
      }

      function scheduleTop8AutoLive() {
        const now = Date.now();
        Object.values(TOP8_SCHEDULE).forEach(entry => {
          const isoStr = typeof entry === 'string' ? entry : entry?.time;
          if (!isoStr) return;
          const ms = new Date(isoStr).getTime() - now;
          if (ms > 0) setTimeout(buildTop8Bracket, ms);
        });
      }

      async function initTop8() {
        try {
          TOP8_RESULTS = await loadTop8Results();
        } catch (e) {
          console.error('Failed to initialize top 8:', e);
        }
        buildTop8Bracket();
        scheduleTop8AutoLive();
        const container = document.getElementById('bracket-scroll-top8');
        if (container && window.ResizeObserver) {
          new ResizeObserver(() => { positionThirdPlaceMatch(); drawTop8Connectors(); }).observe(container);
        }
        window.addEventListener('resize', () => { positionThirdPlaceMatch(); drawTop8Connectors(); });
        setInterval(async () => {
          try {
            const data = await loadTop8Results();
            if (JSON.stringify(data) !== JSON.stringify(TOP8_RESULTS)) {
              TOP8_RESULTS = data;
              buildTop8Bracket();
            }
          } catch (e) { /*network error same thing*/ }
        }, 30_000);
        document.addEventListener('amUpdate', async () => {
          try {
            const data = await loadTop8Results();
            if (JSON.stringify(data) !== JSON.stringify(TOP8_RESULTS)) {
              TOP8_RESULTS = data;
              buildTop8Bracket();
            }
          } catch (e) {}
        });
      }

      schedulePromise.then(sd => {
        TOP8_SCHEDULE = sd.top8 || {};
        initTop8();
      });

    })();

    //LCQ section
    (function() {

      let LCQ_SCHEDULE = {};

      //another manual override don't need this
      let LCQ_LIVE_MATCH = null;

      let LCQ_PLAYERS = [];
      let SEASON_START = null;
      let LCQ_PARTICIPANT_MAP = {};
      let LCQ_RESULT_STATS = {};

      //default when we haven't filled in the lcqs yet
      const LCQ_PLAYERS_PER_MATCH = 9;
      const LCQ_WINNERS = 3;
      const LIVE_STREAM = 'https://twitch.tv/legospeedruns';

      const LIVE_SVG = '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" fill="currentColor" style="vertical-align:middle"><path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714z"/></svg>';
      const VOD_SVG  = '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" fill="currentColor" style="vertical-align:middle"><path d="M23.495 6.205a3.007 3.007 0 0 0-2.088-2.088c-1.87-.501-9.396-.501-9.396-.501s-7.507-.01-9.396.501A3.007 3.007 0 0 0 .527 6.205a31.247 31.247 0 0 0-.522 5.805 31.247 31.247 0 0 0 .522 5.783 3.007 3.007 0 0 0 2.088 2.088c1.868.502 9.396.502 9.396.502s7.506 0 9.396-.502a3.007 3.007 0 0 0 2.088-2.088 31.247 31.247 0 0 0 .5-5.783 31.247 31.247 0 0 0-.5-5.805zM9.609 15.601V8.408l6.264 3.602z"/></svg>';

      function fmtSchedule(isoStr) {
        const d = new Date(isoStr);
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
          + ' · ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
      }

      function lcqParseTime(t) {
        if (!t) return null;
        const [h, m, s] = t.split(':').map(Number);
        return h * 3600 + m * 60 + s;
      }
      function lcqFmtTime(secs) {
        const h = Math.floor(secs / 3600);
        const m = Math.floor((secs % 3600) / 60);
        const s = Math.floor(secs % 60);
        return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
      }

      function buildLCQ() {
        const container = document.getElementById('lcq-scroll');
        if (!container) return;
        container.innerHTML = '';

        const lcqContainer = document.createElement('div');
        lcqContainer.className = 'lcq-container';

        for (let m = 1; m <= 2; m++) {
          const key           = `lcq_${m}`;
          const result        = LCQ_RESULTS[key] || null;
          const isDone        = !!result;
          const scheduleEntry   = !isDone ? (LCQ_SCHEDULE[key] || null) : null;
          const scheduleRaw     = scheduleEntry ? (typeof scheduleEntry === 'string' ? scheduleEntry : scheduleEntry.start) : null;
          const timerStartRaw   = scheduleEntry && typeof scheduleEntry === 'object' ? (scheduleEntry.timerStart || null) : null;
          const schedulePlayers = scheduleEntry && typeof scheduleEntry === 'object' ? (scheduleEntry.players || null) : null;
          const isLive   = SEASON3_LIVE_TRACKING_ENABLED && (
                            (!isDone && scheduleRaw && new Date() >= new Date(scheduleRaw))
                            || (!isDone && LCQ_LIVE_MATCH === m)
                          );
          const scheduleAt = scheduleRaw && !isLive ? fmtSchedule(scheduleRaw) : null;

          const weekEl = document.createElement('div');
          weekEl.className = 'lcq-week';

          const label = document.createElement('div');
          label.className = 'lcq-week-label';
          label.textContent = `LCQ ${m}`;
          weekEl.appendChild(label);

          let card;
          if (isLive) {
            card = document.createElement('a');
            card.href = LIVE_STREAM; card.target = '_blank'; card.rel = 'noopener';
          } else if (isDone) {
            card = document.createElement('a');
            card.href = result.vod; card.target = '_blank'; card.rel = 'noopener';
          } else {
            card = document.createElement('div');
          }
          card.className = 'bracket-match' + (isLive ? ' live' : '') + (isDone ? ' done' : '');
          card.dataset.match = key;

          const rungRow = document.createElement('div');
          rungRow.className = 'bracket-match-rung';
          const matchLabel = document.createElement('span');
          matchLabel.textContent = `LCQ ${m}`;
          rungRow.appendChild(matchLabel);

          if (isLive) {
            const ind = document.createElement('span');
            ind.className = 'live-indicator';
            const elapsedHtml = timerStartRaw ? `<span class="live-elapsed" data-start="${timerStartRaw}">0:00:00</span>` : '';
            ind.innerHTML = elapsedHtml + `<span class="live-dot"></span>LIVE<span class="live-arrow">${LIVE_SVG}</span>`;
            rungRow.appendChild(ind);
          } else if (isDone) {
            const ind = document.createElement('span');
            ind.className = 'done-indicator';
            ind.innerHTML = `VOD<span class="done-arrow">${VOD_SVG}</span>`;
            rungRow.appendChild(ind);
          } else if (scheduleAt) {
            const ind = document.createElement('span');
            ind.className = 'scheduled-indicator';
            ind.textContent = scheduleAt;
            rungRow.appendChild(ind);
          } else {
            const ind = document.createElement('span');
            ind.className = 'scheduled-indicator';
            ind.textContent = 'TBD';
            rungRow.appendChild(ind);
          }
          card.appendChild(rungRow);

          //players
          let players;
          if (isDone) {
            players = result.places;
          } else if (schedulePlayers) {
            const beforeSeason = SEASON_START && new Date() < SEASON_START;
            players = beforeSeason
              ? Array(schedulePlayers.length).fill(null)
              : schedulePlayers.map(n => ({ name: n }));
          } else if (m === 1) {
            //LCQ 1 everyone not in the ladder already
            const beforeSeason = SEASON_START && new Date() < SEASON_START;
            players = beforeSeason || !LCQ_PLAYERS.length
              ? Array(LCQ_PLAYERS_PER_MATCH).fill(null)
              : LCQ_PLAYERS.map(n => ({ name: n }));
          } else {
            //LCQ 2 everyone who did not make it out of lcq 1
            const lcq1 = LCQ_RESULTS['lcq_1'];
            if (lcq1 && lcq1.places) {
              players = lcq1.places.slice(LCQ_WINNERS).map(e => ({ name: e.name }));
            } else {
              const blanks = Math.max(0, LCQ_PLAYERS.length - LCQ_WINNERS);
              players = Array(blanks).fill(null);
            }
          }
          if (!isDone) {
            players.sort((a, b) => {
              if (!a || !b) return 0;
              const seedA = (LCQ_PARTICIPANT_MAP[a.name] || {}).seed ?? Infinity;
              const seedB = (LCQ_PARTICIPANT_MAP[b.name] || {}).seed ?? Infinity;
              return seedA - seedB;
            });
          }

          let lcqTipEl = document.getElementById('bp-shared-tooltip');
          if (!lcqTipEl) {
            lcqTipEl = document.createElement('div');
            lcqTipEl.id = 'bp-shared-tooltip';
            document.body.appendChild(lcqTipEl);
            document.addEventListener('click', () => { lcqTipEl.style.display = 'none'; });
          }

          players.forEach((entry, pi) => {
            const place    = pi + 1;
            const name     = entry ? entry.name : '—';
            const time     = entry ? (entry.time || null) : null;
            const isTbd    = !entry;
            const isWinner = place <= LCQ_WINNERS;

            let moveArrow = '';
            if (isDone) {
              if (isWinner)     moveArrow = `<span class="bp-move qualified" data-tip="Qualified to Rung ${m === 1 ? 6 : 7}">★</span>`;
              else if (m === 2) moveArrow = `<span class="bp-move eliminated" data-tip="Eliminated">✖</span>`;
              else              moveArrow = `<span class="bp-move" style="color:var(--dim)">–</span>`;
            }

            const nameHtml = isTbd ? name : `<span class="bp-name">${name}</span>`;
            const pEl = document.createElement('div');
            pEl.className = 'bracket-player' + (isTbd ? ' tbd' : '') + (!isWinner && isDone ? ' lost' : '');
            pEl.innerHTML = `<span class="bp-num">${isTbd ? '' : place}</span>${nameHtml}`
              + (time ? `<span class="bp-time">${time}</span>` : '')
              + moveArrow;

            if (!isTbd) {
              const pInfo   = LCQ_PARTICIPANT_MAP[name] || {};
              const tipSeed = pInfo.seed != null ? `#${pInfo.seed}` : '—';
              const srUser  = (pInfo.username || name).toLowerCase();
              pEl.querySelector('.bp-name').addEventListener('click', e => {
                e.preventDefault();
                e.stopPropagation();
                const srcEntry = window.srcPBMap ? window.srcPBMap[srUser] : null;
                const tipPB    = srcEntry ? lcqFmtTime(srcEntry.t) : '—';
                lcqTipEl.style.minWidth = '190px';
                lcqTipEl.style.padding = '.7rem .9rem';
                lcqTipEl.innerHTML = `<div class="elim-tip-name" style="color:var(--text)">${name}</div>`
                  + `<div class="elim-tip-row"><span>Seed</span><span>${tipSeed}</span></div>`
                  + `<div class="elim-tip-row"><span>PB</span><span>${tipPB}</span></div>`;
                lcqTipEl.style.display = 'block';
                lcqTipEl.style.left = '0px';
                lcqTipEl.style.top = '0px';
                const tipRect  = lcqTipEl.getBoundingClientRect();
                const nameRect = e.currentTarget.getBoundingClientRect();
                const top = nameRect.top - tipRect.height - 8 >= 0
                  ? nameRect.top - tipRect.height - 8
                  : nameRect.bottom + 8;
                let left = nameRect.left;
                if (left + tipRect.width > window.innerWidth - 8) left = window.innerWidth - tipRect.width - 8;
                lcqTipEl.style.left = `${left}px`;
                lcqTipEl.style.top = `${top}px`;
              });
            }

            card.appendChild(pEl);
          });

          weekEl.appendChild(card);
          lcqContainer.appendChild(weekEl);
        }

        container.appendChild(lcqContainer);

        const ladderBtn = document.createElement('div');
        ladderBtn.className = 'lcq-ladder-btn';
        ladderBtn.textContent = 'See Ladder Standings →';
        ladderBtn.addEventListener('click', () => {
          document.querySelectorAll('#standings-s3-tabs .standings-tab').forEach(t => t.classList.remove('active'));
          document.querySelectorAll('#standings-s3 .standings-tab-panel').forEach(p => p.classList.remove('active'));
          document.querySelector('#standings-s3-tabs .standings-tab[data-tab="ladder"]').classList.add('active');
          document.getElementById('standings-tab-ladder').classList.add('active');
        });
        container.appendChild(ladderBtn);
      }

      async function loadLCQData() {
        const [pRes, rRes] = await Promise.all([
          fetch('/data/participants.json', { cache: 'no-store' }),
          fetch('/data/results.json',      { cache: 'no-store' }),
        ]);
        if (pRes.ok) {
          const data = await pRes.json();
          const season3 = data.season3 || [];
          LCQ_PLAYERS = season3.filter(p => p.seed > 15).map(p => p.name);
          season3.forEach(p => {
            LCQ_PARTICIPANT_MAP[p.name] = { seed: p.seed, seededPB: p.seededPB || null, username: p.username || null };
          });
        }
        if (rRes.ok) {
          const data = await rRes.json();
          LCQ_RESULTS = { lcq_1: data.lcq_1, lcq_2: data.lcq_2 };
          ['lcq_1', 'lcq_2'].forEach(key => {
            const result = data[key];
            if (!result || !result.places) return;
            result.places.forEach(entry => {
              const secs = lcqParseTime(entry.time);
              if (secs === null) return;
              if (LCQ_RESULT_STATS[entry.name] == null || secs < LCQ_RESULT_STATS[entry.name]) {
                LCQ_RESULT_STATS[entry.name] = secs;
              }
            });
          });
        }
      }

      schedulePromise.then(sd => {
        LCQ_SCHEDULE   = sd.lcq         || {};
        LCQ_LIVE_MATCH = sd.lcqLiveMatch || null;
        SEASON_START   = sd.countdown ? new Date(sd.countdown) : null;
        (async () => {
          try {
            await loadLCQData();
          } catch (e) {
            console.error('Could not load LCQ data', e);
          }
          buildLCQ();
          const _lcqRebuild = async () => {
            try {
              const res = await fetch('/data/results.json', { cache: 'no-store' });
              if (!res.ok) return;
              const data = await res.json();
              const fresh = { lcq_1: data.lcq_1, lcq_2: data.lcq_2 };
              if (JSON.stringify(fresh) !== JSON.stringify(LCQ_RESULTS)) {
                LCQ_RESULTS = fresh;
                buildLCQ();
              }
            } catch (e) {}
          };
          setInterval(_lcqRebuild, 30_000);
          document.addEventListener('amUpdate', _lcqRebuild);
        })();
      });

    })();

    //prev season standings pages
    (function() {
      const s3El   = document.getElementById('standings-s3');
      const pastEl = document.getElementById('standings-past');

      const VOD_SVG = '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" fill="currentColor" style="vertical-align:middle"><path d="M23.495 6.205a3.007 3.007 0 0 0-2.088-2.088c-1.87-.501-9.396-.501-9.396-.501s-7.507-.01-9.396.501A3.007 3.007 0 0 0 .527 6.205a31.247 31.247 0 0 0-.522 5.805 31.247 31.247 0 0 0 .522 5.783 3.007 3.007 0 0 0 2.088 2.088c1.868.502 9.396.502 9.396.502s7.506 0 9.396-.502a3.007 3.007 0 0 0 2.088-2.088 31.247 31.247 0 0 0 .5-5.783 31.247 31.247 0 0 0-.5-5.805zM9.609 15.601V8.408l6.264 3.602z"/></svg>';

      //s1/2/3 dropdown on left
      const s3TabsEl   = document.getElementById('standings-s3-tabs');
      const pastTabsEl = document.getElementById('standings-past-tabs');
      const seasonDropdown = document.getElementById('standings-season-dropdown');
      const seasonDropBtn  = seasonDropdown.querySelector('.season-dropdown-btn');
      const seasonLabel    = document.getElementById('standings-season-label');
      let currentSeason = 3;

      function setStandingsSeason(season, switchContent = true) {
        currentSeason = season;
        seasonLabel.textContent = `Season ${season}`;
        seasonDropdown.querySelectorAll('.season-dropdown-item').forEach(el => {
          el.classList.toggle('active', parseInt(el.dataset.sseason) === season);
        });
        seasonDropBtn.setAttribute('aria-expanded', 'false');
        seasonDropdown.classList.remove('open');
        if (!switchContent) return;
        if (season === 3) {
          s3El.style.display = '';
          pastEl.style.display = 'none';
          if (s3TabsEl)   s3TabsEl.style.display = '';
          if (pastTabsEl) pastTabsEl.style.display = 'none';
          document.querySelectorAll('#standings-s3-tabs .standings-tab').forEach(t => t.classList.remove('active'));
          document.querySelectorAll('#standings-s3 .standings-tab-panel').forEach(p => p.classList.remove('active'));
          document.querySelector(`#standings-s3-tabs .standings-tab[data-tab="${s3DefaultTab}"]`).classList.add('active');
          document.getElementById(`standings-tab-${s3DefaultTab}`).classList.add('active');
        } else {
          s3El.style.display = 'none';
          pastEl.style.display = '';
          if (s3TabsEl)   s3TabsEl.style.display = 'none';
          if (pastTabsEl) pastTabsEl.style.display = '';
          document.querySelectorAll('#standings-past-tabs .standings-tab').forEach(t => t.classList.remove('active'));
          document.querySelector('#standings-past-tabs .standings-tab[data-ptab="top8"]').classList.add('active');
          document.querySelectorAll('#standings-past .standings-tab-panel').forEach(p => p.classList.remove('active'));
          document.getElementById('standings-past-top8').classList.add('active');
          loadAndRenderPastSeason(season);
        }
        updateTheoryToggleVisibility();
      }

      seasonDropBtn.addEventListener('click', e => {
        e.stopPropagation();
        const isOpen = seasonDropdown.classList.toggle('open');
        seasonDropBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      });
      seasonDropdown.querySelectorAll('.season-dropdown-item').forEach(item => {
        item.addEventListener('click', () => setStandingsSeason(parseInt(item.dataset.sseason)));
      });
      document.addEventListener('click', () => {
        if (seasonDropdown.classList.contains('open')) {
          seasonDropdown.classList.remove('open');
          seasonDropBtn.setAttribute('aria-expanded', 'false');
        }
      });

      //tabs within seasons
      document.querySelectorAll('#standings-past-tabs .standings-tab').forEach(tab => {
        tab.addEventListener('click', () => {
          document.querySelectorAll('#standings-past-tabs .standings-tab').forEach(t => t.classList.remove('active'));
          tab.classList.add('active');
          const ptab = tab.dataset.ptab;
          document.querySelectorAll('#standings-past .standings-tab-panel').forEach(p => p.classList.remove('active'));
          document.getElementById(`standings-past-${ptab}`).classList.add('active');
        });
      });

      let pastSeasonCache = null;

      async function loadAndRenderPastSeason(season) {
        if (!pastSeasonCache) {
          try {
            const res = await fetch('/data/past_seasons.json', { cache: 'no-store' });
            pastSeasonCache = await res.json();
          } catch (e) {
            console.error('Could not load past_seasons.json', e);
            return;
          }
        }
        const data = pastSeasonCache[`season${season}`];
        if (!data) return;
        buildPastPlayins(data, season);
        buildPastBracket(data, season);
        buildPastTop8(data, season);
      }

      function emptyMsg(text) {
        return `<div style="text-align:center;padding:4rem 2rem;color:var(--dim);font-family:'Montserrat',sans-serif;font-size:.8rem;letter-spacing:3px;text-transform:uppercase">${text}</div>`;
      }

      function buildPastPlayins(data, season) {
        const container = document.getElementById('past-playins-scroll');
        if (!container) return;
        container.innerHTML = '';
        const matches = data.playins || [];
        if (!matches.length) { container.innerHTML = emptyMsg('No Play-Ins This Season'); return; }

        const wrap = document.createElement('div');
        wrap.className = 'lcq-container';

        matches.forEach((match, i) => {
          const matchEl = document.createElement('div');
          matchEl.className = 'lcq-week';

          const label = document.createElement('div');
          label.className = 'lcq-week-label';
          label.textContent = match.label;
          matchEl.appendChild(label);

          let card;
          if (match.vod) {
            card = document.createElement('a'); card.href = match.vod; card.target = '_blank'; card.rel = 'noopener';
            card.dataset.match = `s${season}_playin_${i + 1}`;
          }
          else { card = document.createElement('div'); }
          card.className = 'bracket-match done';

          const rungRow = document.createElement('div');
          rungRow.className = 'bracket-match-rung';
          const rungLabel = document.createElement('span');
          rungLabel.textContent = match.label;
          rungRow.appendChild(rungLabel);
          const ind = document.createElement('span');
          ind.className = 'done-indicator';
          ind.innerHTML = match.vod ? `VOD<span class="done-arrow">${VOD_SVG}</span>` : 'Done';
          rungRow.appendChild(ind);
          card.appendChild(rungRow);

          match.places.forEach((p, i) => {
            const eliminated = p.outcome === 'eliminated';
            const moveArrow = eliminated
              ? `<span class="bp-move eliminated" data-tip="${p.note || 'Eliminated'}">✖</span>`
              : `<span class="bp-move qualified" data-tip="${p.note || 'Advances'}">★</span>`;
            const pEl = document.createElement('div');
            pEl.className = 'bracket-player' + (eliminated ? ' lost' : '');
            pEl.innerHTML = `<span class="bp-num">${i + 1}</span><span class="bp-name">${p.name}</span><span class="bp-time">${p.time}</span>${moveArrow}`;
            card.appendChild(pEl);
          });

          matchEl.appendChild(card);
          wrap.appendChild(matchEl);
        });

        container.appendChild(wrap);

        const ladderBtn = document.createElement('div');
        ladderBtn.className = 'lcq-ladder-btn';
        ladderBtn.textContent = 'See Ladder Standings →';
        ladderBtn.addEventListener('click', () => {
          document.querySelectorAll('#standings-past-tabs .standings-tab').forEach(t => t.classList.remove('active'));
          document.querySelectorAll('#standings-past .standings-tab-panel').forEach(p => p.classList.remove('active'));
          document.querySelector('#standings-past-tabs .standings-tab[data-ptab="ladder"]').classList.add('active');
          document.getElementById('standings-past-ladder').classList.add('active');
        });
        container.appendChild(ladderBtn);
      }

      function buildPastBracket(data, season) {
        const container = document.getElementById('past-bracket-scroll');
        if (!container) return;
        container.innerHTML = '';
        const { weekMatchCounts = [], wildcardWeek = null, weekDates = [], results = {} } = data;
        if (!weekMatchCounts.length) { container.innerHTML = emptyMsg('Results Coming Soon'); return; }

        const isAutoWildcardSeason = 'wildcardAutoQualifier' in data;

        function pastSecsFmt(s) {
          const h = Math.floor(s/3600), m = Math.floor((s%3600)/60), sec = s%60;
          return `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
        }

        //s2 wildcard system
        let fastestTimes = [];
        if (isAutoWildcardSeason) {
          const qualifiedSet = new Set();
          const playerBestSecs = {};
          Object.entries(results).forEach(([key, result]) => {
            const [wStr, rStr] = key.split('_');
            const w = parseInt(wStr), r = parseInt(rStr);
            if (wildcardWeek && w >= wildcardWeek) return;
            if (r === 1 && result.places?.[0]?.name) qualifiedSet.add(result.places[0].name);
            (result.places || []).forEach(entry => {
              if (!entry.name || !entry.time || entry.time === 'DNF') return;
              const p = entry.time.split(':').map(Number);
              const secs = p.length === 3 ? p[0]*3600+p[1]*60+p[2] : null;
              if (secs === null) return;
              if (!playerBestSecs[entry.name] || secs < playerBestSecs[entry.name]) playerBestSecs[entry.name] = secs;
            });
          });
          fastestTimes = Object.entries(playerBestSecs)
            .filter(([name]) => !qualifiedSet.has(name))
            .sort((a, b) => a[1] - b[1])
            .slice(0, 3);
        }

        let lastRegWeekEl = null, pastWcEl = null;

        for (let w = 1; w <= weekMatchCounts.length; w++) {
          const matchCount = weekMatchCounts[w - 1];
          const isWildcard = w === wildcardWeek;
          const weekEl = document.createElement('div');
          weekEl.className = 'bracket-week';

          if (weekDates[w - 1]) {
            const d = document.createElement('div');
            d.className = 'bracket-week-dates';
            d.textContent = weekDates[w - 1];
            weekEl.appendChild(d);
          }

          if (!(isWildcard && isAutoWildcardSeason)) {
            const labelEl = document.createElement('div');
            labelEl.className = 'bracket-week-label';
            labelEl.textContent = isWildcard ? 'Wildcard' : `Week ${w}`;
            weekEl.appendChild(labelEl);
          }

          if (isWildcard && isAutoWildcardSeason) {
            const autoQual = data.wildcardAutoQualifier;
            const qualSlot = document.createElement('div');
            qualSlot.className = 'week-qualified-slot' + (autoQual ? '' : ' empty');
            qualSlot.innerHTML = autoQual
              ? `<span class="wqs-icon">★</span><span class="wqs-name">${autoQual.name}</span><span class="wqs-icon">★</span>`
              : `<span class="wqs-name">SEED ${w}</span>`;
            weekEl.appendChild(qualSlot);
            pastWcEl = weekEl;
            continue;
          }

          if (!isWildcard) {
            const topRungResult = results[`${w}_1`];
            const qualName = topRungResult?.places?.[0]?.name || null;
            const qualSlot = document.createElement('div');
            qualSlot.className = 'week-qualified-slot' + (qualName ? '' : ' empty');
            qualSlot.innerHTML = qualName
              ? `<span class="wqs-icon">★</span><span class="wqs-name">${qualName}</span><span class="wqs-icon">★</span>`
              : `<span class="wqs-name">SEED ${w}</span>`;
            weekEl.appendChild(qualSlot);
          }

          const matchesWrap = document.createElement('div');
          matchesWrap.className = 'bracket-week-matches';

          for (let r = 1; r <= matchCount; r++) {
            const result = results[`${w}_${r}`];
            const isDone = !!result;
            const isTop  = r === 1;
            const isBot  = r === matchCount && !isWildcard;

            let card;
            if (isDone && result.vod) {
              card = document.createElement('a');
              card.href = result.vod; card.target = '_blank'; card.rel = 'noopener';
              card.dataset.match = `s${season}_${w}_${r}`;
            } else { card = document.createElement('div'); }
            card.className = 'bracket-match' + (isDone ? ' done' : '');

            const rungRow = document.createElement('div');
            rungRow.className = 'bracket-match-rung';
            const rungLabel = document.createElement('span');
            rungLabel.textContent = isWildcard ? 'Wildcard' : `Rung ${r}`;
            if (isTop) rungLabel.style.color = '#ac8427';
            else if (isBot) rungLabel.style.color = '#ff8099';
            rungRow.appendChild(rungLabel);

            if (isDone) {
              const ind = document.createElement('span');
              ind.className = 'done-indicator';
              if (result.vod) { ind.innerHTML = `VOD<span class="done-arrow">${VOD_SVG}</span>`; rungRow.appendChild(ind); }
              else { ind.textContent = 'Done'; rungRow.appendChild(ind); }
            } else {
              const tbd = document.createElement('span');
              tbd.className = 'scheduled-indicator'; tbd.textContent = 'TBD';
              rungRow.appendChild(tbd);
            }
            card.appendChild(rungRow);

            const displayPlayers = isDone ? result.places : Array(3).fill({ name: '—' });
            displayPlayers.forEach((entry, pi) => {
              const p      = typeof entry === 'string' ? entry : (entry.name || '—');
              const time   = typeof entry === 'object' ? (entry.time   || null) : null;
              const status = typeof entry === 'object' ? (entry.status || null) : null;
              const place = pi + 1;
              const isTbd = p === '—';
              const qualifies      = isDone && isTop && place === 1;
              const eliminated     = isDone && (isBot || isWildcard) && place > 1;
              const dropsDown      = isDone && !isBot && !isWildcard && place === displayPlayers.length;
              const movesUp        = isDone && !qualifies && !eliminated && !dropsDown;
              const isLeapfrogging = status === 'leapfrogging';
              const isLeapfrogged  = status === 'leapfrogged';

              let leapfrogPartner = null;
              if (isLeapfrogging) {
                const aboveResult = results[`${w}_${r - 1}`];
                leapfrogPartner = aboveResult?.places?.[1]?.name ?? null;
              } else if (isLeapfrogged) {
                const belowResult = results[`${w}_${r + 1}`];
                leapfrogPartner = belowResult?.places?.find(e => e.status === 'leapfrogging')?.name ?? null;
              }

              //s2 leapfrog
              let moveArrow = '';
              if      (qualifies)          moveArrow = `<span class="bp-move qualified"    data-tip="Qualified for Top 8">★</span>`;
              else if (eliminated)         moveArrow = `<span class="bp-move eliminated"   data-tip="Eliminated">✖</span>`;
              else if (dropsDown)          moveArrow = `<span class="bp-move down"          data-tip="Demoted">↓</span>`;
              else if (isLeapfrogging)     moveArrow = `<span class="bp-move leapfrogging"  data-tip="Leapfrogging${leapfrogPartner ? ' ' + leapfrogPartner : ''}">⇑</span>`;
              else if (isLeapfrogged)      moveArrow = `<span class="bp-move leapfrogged"   data-tip="Leapfrogged by${leapfrogPartner ? ' ' + leapfrogPartner : ''}">↔</span>`;
              else if (movesUp && isTop)   moveArrow = `<span class="bp-move" style="color:var(--dim)" data-tip="Staying in top rung">–</span>`;
              else if (movesUp)            moveArrow = `<span class="bp-move up"            data-tip="Promoted">↑</span>`;

              const pEl = document.createElement('div');
              pEl.className = 'bracket-player' + (isTbd ? ' tbd' : '') + (dropsDown || eliminated ? ' lost' : '');
              pEl.innerHTML = `<span class="bp-num">${isTbd ? '' : place}</span>`
                + (isTbd ? p : `<span class="bp-name">${p}</span>`)
                + (time ? `<span class="bp-time">${time}</span>` : '')
                + moveArrow;
              card.appendChild(pEl);
            });

            matchesWrap.appendChild(card);
          }
          weekEl.appendChild(matchesWrap);
          if (isAutoWildcardSeason && wildcardWeek && w === wildcardWeek - 1) {
            lastRegWeekEl = weekEl;
          } else {
            container.appendChild(weekEl);
          }
        }

        //visual wildcard standings for s2
        if (isAutoWildcardSeason && lastRegWeekEl && pastWcEl) {
          const wcsEl = document.createElement('div');
          wcsEl.className = 'wildcard-standings';
          wcsEl.innerHTML = '<div class="wildcard-standings-label">Wildcard Standings</div>';
          const secLbl = document.createElement('div');
          secLbl.className = 'wcs-section-label';
          secLbl.textContent = 'Fastest Time';
          wcsEl.appendChild(secLbl);
          const ords = ['1st', '2nd', '3rd'];
          const autoQualName = data.wildcardAutoQualifier?.name || null;
          for (let i = 0; i < 3; i++) {
            const entry = fastestTimes[i];
            const isLeader = entry && entry[0] === autoQualName;
            const row = document.createElement('div');
            row.className = 'wcs-row' + (entry ? (isLeader ? ' leader' : '') : ' empty');
            row.innerHTML = entry
              ? `<span class="wcs-rank">${ords[i]}</span><span class="bp-name">${entry[0]}</span><span class="wcs-time">${pastSecsFmt(entry[1])}</span>`
              : `<span class="wcs-rank">${ords[i]}</span>—`;
            wcsEl.appendChild(row);
          }
          const lastRegGroup = document.createElement('div');
          lastRegGroup.style.cssText = 'display:flex; flex-direction:column; align-items:center; gap:12px; align-self:flex-start; margin-top:0;';
          lastRegGroup.appendChild(lastRegWeekEl);
          lastRegGroup.appendChild(pastWcEl);
          lastRegGroup.appendChild(wcsEl);
          container.appendChild(lastRegGroup);
        }
      }

      function buildPastTop8(data, season) {
        const container = document.getElementById('past-top8-scroll');
        if (!container) return;
        container.innerHTML = '';
        const top8 = data.top8 || {};
        if (!Object.keys(top8).length) { container.innerHTML = emptyMsg('Results Coming Soon'); return; }

        const noThirdPlace = !!data.noThirdPlace;

        //top 8 seeds for prev seasons
        const parseT = t => { if (!t) return Infinity; const [h,m,s] = t.split(':').map(Number); return h*3600+m*60+s; };
        const { weekMatchCounts = [], wildcardWeek = null, results = {} } = data;
        const pastTop8Seeds = {};
        let seedNum = 1;
        for (let w = 1; w <= weekMatchCounts.length; w++) {
          if (wildcardWeek && w === wildcardWeek) {
            const aq = data.wildcardAutoQualifier;
            if (aq?.name) pastTop8Seeds[aq.name] = seedNum++;
            continue;
          }
          const r1 = results[`${w}_1`];
          const winner = (r1?.places || []).filter(p => p.time && p.time !== 'DNF')
            .reduce((best, p) => !best || parseT(p.time) < parseT(best.time) ? p : best, null);
          if (winner?.name) pastTop8Seeds[winner.name] = seedNum++;
        }

        const ROUNDS = [
          { id: 'qf', name: 'Quarterfinals', label: 'Quarterfinal', matches: 4 },
          { id: 'sf', name: 'Semifinals',    label: 'Semifinal',    matches: 2 },
          { id: 'gf', name: 'Finals',        label: null,           matchName: 'Grand Finals', matches: 1 },
        ];

        const winnerOf = key => top8[key]?.places?.[0]?.name || null;
        const loserOf  = key => top8[key]?.places?.[1]?.name || null;

        function getPlayers(roundId, matchNum) {
          const result = top8[`${roundId}_${matchNum}`];
          if (result?.places?.length >= 2) return result.places.slice(0, 2).map(p => p.name);
          if (roundId === 'sf') { const b = (matchNum - 1) * 2 + 1; return [winnerOf(`qf_${b}`) || '—', winnerOf(`qf_${b + 1}`) || '—']; }
          if (roundId === 'gf') return [winnerOf('sf_1') || '—', winnerOf('sf_2') || '—'];
          if (roundId === 'tp') return [loserOf('sf_1')  || '—', loserOf('sf_2')  || '—'];
          return ['—', '—'];
        }

        ROUNDS.forEach(round => {
          const roundEl = document.createElement('div');
          roundEl.className = 'bracket-round';
          const roundLabelEl = document.createElement('div');
          roundLabelEl.className = 'bracket-round-label';
          roundLabelEl.textContent = round.name;
          roundEl.appendChild(roundLabelEl);
          const matchesWrap = document.createElement('div');
          matchesWrap.className = 'bracket-round-matches';
          for (let m = 1; m <= round.matches; m++) matchesWrap.appendChild(buildPastTop8Match(round, m, getPlayers(round.id, m), top8, pastTop8Seeds, season));
          if (round.id === 'gf' && !noThirdPlace) matchesWrap.appendChild(buildPastTop8Match({ id:'tp', name:'3rd Place Match', label:null }, 1, getPlayers('tp', 1), top8, pastTop8Seeds, season));
          roundEl.appendChild(matchesWrap);
          container.appendChild(roundEl);
        });

        //results section
        const fastestWinner = places => places?.reduce((best, p) => (!p.time || (best && parseT(best.time) <= parseT(p.time))) ? best : p, null);
        const fastestLoser  = places => { const w = fastestWinner(places); return w ? (places?.find(p => p.name !== w.name) || null) : null; };

        const gf = top8['gf_1'];
        const champion  = gf ? fastestWinner(gf.places)?.name : null;
        const runnerUp  = gf ? fastestLoser(gf.places)?.name  : null;

        const resultsCol = document.createElement('div');
        resultsCol.className = 'bracket-round bracket-round-results';
        const resultsLabel = document.createElement('div');
        resultsLabel.className = 'bracket-round-label';
        resultsLabel.textContent = 'Results';
        resultsCol.appendChild(resultsLabel);
        const resultsStack = document.createElement('div');
        resultsStack.className = 'top8-results-stack';

        const champBoxEl = document.createElement('div');
        champBoxEl.className = 'top8-champion-box' + (champion ? ' visible' : '');
        champBoxEl.innerHTML = `<div class="top8-champion-label">★ Champion ★</div><div class="top8-champion-name">${champion || ''}</div>`;
        resultsStack.appendChild(champBoxEl);

        const ruBoxEl = document.createElement('div');
        ruBoxEl.className = 'top8-runnerup-box' + (runnerUp ? ' visible' : '');
        ruBoxEl.innerHTML = `<div class="top8-runnerup-label">Runner-Up</div><div class="top8-runnerup-name">${runnerUp || ''}</div>`;
        resultsStack.appendChild(ruBoxEl);

        //semifinals placements
        const sfLosers = ['sf_1','sf_2']
          .map(key => { const p = fastestLoser(top8[key]?.places); return p ? { name: p.name, time: p.time } : null; })
          .filter(Boolean)
          .sort((a, b) => parseT(a.time) - parseT(b.time));
        const thirdPlace = sfLosers[0]?.name || null;

        const bronzeBoxEl = document.createElement('div');
        bronzeBoxEl.className = 'top8-bronze-box' + (thirdPlace ? ' visible' : '');
        bronzeBoxEl.innerHTML = `<div class="top8-bronze-label">3rd Place</div><div class="top8-bronze-name">${thirdPlace || ''}</div>`;
        resultsStack.appendChild(bronzeBoxEl);

        //everyone else placements
        const qfLosers = ['qf_1','qf_2','qf_3','qf_4']
          .map(key => { const p = fastestLoser(top8[key]?.places); return p ? { name: p.name, time: p.time } : null; })
          .filter(Boolean)
          .sort((a, b) => parseT(a.time) - parseT(b.time));
        const restPlaces = [
          { place: '4th', name: sfLosers[1]?.name || null },
          ...qfLosers.map((p, i) => ({ place: `${5 + i}th`, name: p.name })),
          ...Array.from({ length: 4 - qfLosers.length }, (_, i) => ({ place: `${5 + qfLosers.length + i}th`, name: null })),
        ];
        const restBoxEl = document.createElement('div');
        restBoxEl.className = 'top8-rest-box' + (restPlaces.some(p => p.name) ? ' visible' : '');
        restBoxEl.innerHTML = restPlaces.map(p =>
          `<div class="top8-rest-row"><span class="top8-rest-place">${p.place}</span><span class="top8-rest-name">${p.name || '—'}</span></div>`
        ).join('');
        resultsStack.appendChild(restBoxEl);

        resultsCol.appendChild(resultsStack);
        container.appendChild(resultsCol);

        requestAnimationFrame(() => drawPastTop8Connectors());
      }

      function drawPastTop8Connectors() {
        const container = document.getElementById('past-top8-scroll');
        if (!container) return;

        const old = container.querySelector('.past-top8-connectors-svg');
        if (old) old.remove();

        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.classList.add('past-top8-connectors-svg');
        svg.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none;z-index:0;overflow:visible;';
        svg.setAttribute('width', container.scrollWidth);
        svg.setAttribute('height', container.scrollHeight);

        const cr = container.getBoundingClientRect();

        const groups = [
          [['past-top8-card-qf-1', 'past-top8-card-qf-2'], 'past-top8-card-sf-1'],
          [['past-top8-card-qf-3', 'past-top8-card-qf-4'], 'past-top8-card-sf-2'],
          [['past-top8-card-sf-1', 'past-top8-card-sf-2'], 'past-top8-card-gf-1'],
        ];

        groups.forEach(([[id1, id2], tgtId]) => {
          const el1 = document.getElementById(id1);
          const el2 = document.getElementById(id2);
          const elT = document.getElementById(tgtId);
          if (!el1 || !el2 || !elT) return;

          const r1 = el1.getBoundingClientRect();
          const r2 = el2.getBoundingClientRect();
          const rt = elT.getBoundingClientRect();

          const y1   = (r1.top + r1.bottom) / 2 - cr.top;
          const y2   = (r2.top + r2.bottom) / 2 - cr.top;
          const yt   = (rt.top + rt.bottom) / 2 - cr.top;
          const xSrc = r1.right - cr.left;
          const xTgt = rt.left  - cr.left;
          const midX = (xSrc + xTgt) / 2;

          const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          path.setAttribute('d',
            `M${xSrc},${y1} H${midX} V${y2} M${xSrc},${y2} H${midX} M${midX},${yt} H${xTgt}`
          );
          path.setAttribute('stroke', 'rgba(255,255,255,0.13)');
          path.setAttribute('stroke-width', '1.5');
          path.setAttribute('fill', 'none');
          svg.appendChild(path);
        });

        container.insertBefore(svg, container.firstChild);
      }

      function buildPastTop8Match(round, matchNum, players, top8, seedLookup, season) {
        const key    = `${round.id}_${matchNum}`;
        const result = top8[key] || null;
        const isDone = !!result;
        const isGF   = round.id === 'gf';

        let card;
        if (isDone && result.vod) { card = document.createElement('a'); card.href = result.vod; card.target = '_blank'; card.rel = 'noopener'; }
        else { card = document.createElement('div'); }
        card.className = 'top8-match' + (isDone ? ' done' : '');
        card.id = `past-top8-card-${round.id}-${matchNum}`;
        if (isDone && result.vod) card.dataset.match = `s${season}_${key}`;

        const matchRow = document.createElement('div');
        matchRow.className = 'top8-match-rung';
        const matchLabelEl = document.createElement('span');
        matchLabelEl.textContent = round.label
          ? (round.matches > 1 ? `${round.label} ${matchNum}` : round.name)
          : (round.matchName || round.name);
        matchRow.appendChild(matchLabelEl);

        if (isDone) {
          const ind = document.createElement('span');
          ind.className = 'top8-done-indicator';
          if (result.vod) { ind.innerHTML = `VOD<span class="top8-done-arrow">${VOD_SVG}</span>`; matchRow.appendChild(ind); }
          else { ind.textContent = 'Done'; matchRow.appendChild(ind); }
        } else {
          const tbd = document.createElement('span');
          tbd.className = 'top8-scheduled-indicator'; tbd.textContent = 'TBD';
          matchRow.appendChild(tbd);
        }
        card.appendChild(matchRow);

        const toSecs = t => { const [h,m,s] = t.split(':').map(Number); return h*3600+m*60+s; };
        const winner = isDone ? result.places.reduce((best, p) =>
          (!p.time || (best && toSecs(best.time) <= toSecs(p.time))) ? best : p
        , null)?.name : null;
        players.forEach(name => {
          const isTbd = !name || name === '—';
          const resultEntry = isDone && !isTbd ? result.places.find(p => p.name === name) : null;
          const time = resultEntry?.time || null;
          const resultClass = isDone && !isTbd ? (name === winner ? (isGF ? ' champion' : ' won') : (isGF ? ' runner-up' : ' lost')) : '';
          const pEl = document.createElement('div');
          const seed = (!isTbd && seedLookup?.[name]) ? `${seedLookup[name]}` : '';
          pEl.className = 'top8-bracket-player' + (isTbd ? ' tbd' : '') + resultClass;
          pEl.innerHTML = `<span class="bp-num">${seed}</span>${isTbd ? '—' : name}` + (time ? `<span class="bp-time">${time}</span>` : '');
          card.appendChild(pEl);
        });

        return card;
      }

      window.addEventListener('resize', () => { drawPastTop8Connectors(); });

    })();


