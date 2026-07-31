    //countdown
    const SEASON_HOME_COUNTDOWN_ENABLED = false;
    let season3CountdownActive = false;

    schedulePromise.then(sd => {
      function updateUnit(el, value, singular, plural, pad, hideIfZero = true) {
        if (!el) return;
        const item = el.parentElement;
        if (value === 0 && hideIfZero) {
          if (item) item.style.display = 'none';
          return;
        }
        if (item) item.style.display = '';
        el.textContent = pad ? String(value).padStart(2, '0') : value;
        const label = el.nextElementSibling;
        if (label) label.textContent = value === 1 ? singular : plural;
      }

      //countdown on home page (goes to season start instead)
      const homeTarget = (SEASON_HOME_COUNTDOWN_ENABLED && sd.seasonStart) ? new Date(sd.seasonStart) : null;
      if (homeTarget) {
        const elDays    = document.getElementById('cd-days');
        const elHours   = document.getElementById('cd-hours');
        const elMinutes = document.getElementById('cd-minutes');
        const elSeconds = document.getElementById('cd-seconds');
        const cdContainer = document.getElementById('countdown-container');

        let homeInterval;

        function homeGoLive() {
          clearInterval(homeInterval);
          if (cdContainer) cdContainer.style.display = 'none';
          const eyebrow = document.getElementById('hero-status-eyebrow');
          if (eyebrow) eyebrow.textContent = 'Season 03 · Live';
          const footerStatus = document.getElementById('footer-status-text');
          if (footerStatus) footerStatus.textContent = 'Live';
          const footerStatusItem = document.getElementById('footer-status-item');
          if (footerStatusItem) footerStatusItem.style.color = '#4caf50';
          const footerStatusDot = document.getElementById('footer-status-dot');
          if (footerStatusDot) { footerStatusDot.style.background = '#4caf50'; footerStatusDot.classList.add('live'); }
          const predictionsLink = document.getElementById('predictions-nav-link');
          if (predictionsLink) {
            predictionsLink.classList.remove('nav-link-disabled');
            predictionsLink.href = predictionsLink.dataset.href;
          }
        }

        function updateHomeCountdown() {
          const diff = Math.max(0, homeTarget.getTime() - Date.now());
          if (diff === 0) { homeGoLive(); return; }
          const totalSec = Math.floor(diff / 1000);
          const days    = Math.floor(totalSec / 86400);
          const hours   = Math.floor((totalSec % 86400) / 3600);
          const minutes = Math.floor((totalSec % 3600) / 60);
          const seconds = totalSec % 60;
          updateUnit(elDays,    days,    'Day',    'Days',    false);
          updateUnit(elHours,   hours,   'Hour',   'Hours',   true);
          updateUnit(elMinutes, minutes, 'Minute', 'Minutes', true);
          updateUnit(elSeconds, seconds, 'Second', 'Seconds', true, false);
        }

        if (new Date() >= homeTarget) {
          homeGoLive();
        } else {
          updateHomeCountdown();
          homeInterval = setInterval(updateHomeCountdown, 1000);
        }
      }

      (function() {
        const top8Start   = new Date('2026-07-10T09:30:00-04:00');
        const wildcardEntry   = sd.ladder && sd.ladder['8_1'];
        const wildcardTimeStr = wildcardEntry ? (typeof wildcardEntry === 'string' ? wildcardEntry : wildcardEntry.time || wildcardEntry.start || null) : null;
        const ladderEnd = wildcardTimeStr
          ? new Date(new Date(wildcardTimeStr).getTime() + 3 * 60 * 60 * 1000)
          : sd.ladderEnd ? new Date(sd.ladderEnd) : new Date('2026-06-22T00:00:00Z');
        const t8Container = document.getElementById('top8-countdown-container');
        if (!t8Container) return;
        const now = new Date();
        if (now < ladderEnd || now >= top8Start) return;

        t8Container.style.display = '';
        const t8Days    = document.getElementById('t8-cd-days');
        const t8Hours   = document.getElementById('t8-cd-hours');
        const t8Minutes = document.getElementById('t8-cd-minutes');
        const t8Seconds = document.getElementById('t8-cd-seconds');

        let t8Interval;
        function updateTop8Countdown() {
          const diff = Math.max(0, top8Start.getTime() - Date.now());
          if (diff === 0) {
            clearInterval(t8Interval);
            t8Container.style.display = 'none';
            return;
          }
          const totalSec = Math.floor(diff / 1000);
          updateUnit(t8Days,    Math.floor(totalSec / 86400),                  'Day',    'Days',    false);
          updateUnit(t8Hours,   Math.floor((totalSec % 86400) / 3600),         'Hour',   'Hours',   true);
          updateUnit(t8Minutes, Math.floor((totalSec % 3600) / 60),            'Minute', 'Minutes', true);
          updateUnit(t8Seconds, totalSec % 60,                                 'Second', 'Seconds', true, false);
        }
        updateTop8Countdown();
        t8Interval = setInterval(updateTop8Countdown, 1000);
      })();

      //participants/standings countdown (goes to countdown rather than seasonStart)
      const target = sd.countdown ? new Date(sd.countdown) : null;
      if (!target) return;

      let countdownInterval;

      function goLive() {
        clearInterval(countdownInterval);
        season3CountdownActive = false;
        const pCd = document.getElementById('participants-countdown');
        if (pCd) pCd.style.display = 'none';
        const pGrid = document.getElementById('p-grid');
        if (pGrid) pGrid.style.display = '';
      }

      if (new Date() >= target) {
        goLive();
        return;
      }

      //don't show the participants before the countdown is done (for s3 only)
      season3CountdownActive = true;
      const pCd = document.getElementById('participants-countdown');
      if (pCd) pCd.style.display = 'block';
      const pGrid = document.getElementById('p-grid');
      if (pGrid) pGrid.style.display = 'none';

      const pElDays    = document.getElementById('p-cd-days');
      const pElHours   = document.getElementById('p-cd-hours');
      const pElMinutes = document.getElementById('p-cd-minutes');
      const pElSeconds = document.getElementById('p-cd-seconds');

      function updateCountdown() {
        const diff = Math.max(0, target.getTime() - Date.now());
        if (diff === 0) { goLive(); return; }
        const totalSec = Math.floor(diff / 1000);
        const days    = Math.floor(totalSec / 86400);
        const hours   = Math.floor((totalSec % 86400) / 3600);
        const minutes = Math.floor((totalSec % 3600) / 60);
        const seconds = totalSec % 60;
        updateUnit(pElDays,    days,    'Day',    'Days',    false);
        updateUnit(pElHours,   hours,   'Hour',   'Hours',   true);
        updateUnit(pElMinutes, minutes, 'Minute', 'Minutes', true);
        updateUnit(pElSeconds, seconds, 'Second', 'Seconds', true, false);
      }

      updateCountdown();
      countdownInterval = setInterval(updateCountdown, 1000);
    });

    //lazy loading stuff in upcoming matches so autoscroll works
    var upcomingLoaded = false;
    var upcomingAllMatches = [], upcomingOffset = 0;

    function renderUpcomingPage(direction) {
      const list = document.getElementById('upcoming-list');
      const prevBtn = document.getElementById('upcoming-prev');
      const nextBtn = document.getElementById('upcoming-next');
      if (!list) return;
      const sectionLabel = { lcq: 'LCQ', ladder: 'Ladder', top8: 'Top 8' };
      const page = upcomingAllMatches.slice(upcomingOffset, upcomingOffset + 4);
      list.innerHTML = page.map(m => {
        const dateStr  = m.dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const timeStr  = m.fromSchedule ? m.dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : null;
        const playersHtml = m.players
          ? m.players.map(p => `<span class="uc-player">${p}</span>`).join('')
          : '<span class="uc-tbd">TBD</span>';
        return `
          <div class="upcoming-card${direction === 'init' ? ' reveal' : ' visible'}" onclick="goToStandings('${m.section}')">
            <span class="uc-cat uc-cat--${m.section}">${sectionLabel[m.section]}</span>
            <div class="uc-name">${m.name}</div>
            ${m.fromSchedule ? `<div class="uc-time">${dateStr}${timeStr ? ` · ${timeStr}` : ''}</div>` : ''}
            ${m.section !== 'lcq' ? `<div class="uc-players">${playersHtml}</div>` : ''}
          </div>
        `;
      }).join('');
      if (direction === 'init') {
        document.querySelectorAll('#upcoming-list .reveal').forEach(el => observer.observe(el));
      } else {
        list.classList.remove('anim-next', 'anim-prev');
        void list.offsetWidth;
        list.classList.add(direction === 'next' ? 'anim-next' : 'anim-prev');
      }
      if (prevBtn) prevBtn.disabled = upcomingOffset === 0;
      if (nextBtn) nextBtn.disabled = upcomingOffset + 4 >= upcomingAllMatches.length;
    }

    function loadUpcomingContent() {
      if (upcomingLoaded) return;
      upcomingLoaded = true;
      const upcomingList = document.getElementById('upcoming-list');
      if (!upcomingList) return;

      Promise.all([schedulePromise, resultsPromise]).then(([sd, allResults]) => {
        const now = new Date();

        const TOP8_KEYS = ['qf_1', 'qf_2', 'qf_3', 'qf_4', 'sf_1', 'sf_2', 'tp_1', 'gf_1'];
        const TOP8_NAMES = { qf_1:'Quarterfinal 1', qf_2:'Quarterfinal 2', qf_3:'Quarterfinal 3', qf_4:'Quarterfinal 4', sf_1:'Semifinal 1', sf_2:'Semifinal 2', tp_1:'Third Place', gf_1:'Grand Finals' };
        const WEEK_ENDS         = ['2026-05-17','2026-05-24','2026-05-31','2026-06-07','2026-06-14','2026-06-21','2026-06-21','2026-06-22'];
        const WEEK_MATCH_COUNTS = [7, 6, 5, 4, 3, 2, 1, 1];

        function entryTime(v)    { return typeof v === 'string' ? v : (v && (v.time || v.start)) || null; }
        function entryPlayers(v) { return typeof v === 'object' && v && Array.isArray(v.players) ? v.players : null; }

        const top8Seeds = Array.from({ length: 8 }, (_, i) => allResults?.[`${i + 1}_1`]?.places?.[0]?.name || null);
        const top8Winner = key => allResults?.[key]?.places?.[0]?.name || null;
        const top8Loser  = key => allResults?.[key]?.places?.[1]?.name || null;

        function top8Players(key) {
          const pairings = { qf_1:[0,7], qf_2:[3,4], qf_3:[1,6], qf_4:[2,5] };
          if (pairings[key]) {
            const [i, j] = pairings[key];
            const a = top8Seeds[i], b = top8Seeds[j];
            if (a || b) return [a || 'TBD', b || 'TBD'];
          }
          if (key === 'sf_1') { const a = top8Winner('qf_1'), b = top8Winner('qf_2'); if (a || b) return [a || 'TBD', b || 'TBD']; }
          if (key === 'sf_2') { const a = top8Winner('qf_3'), b = top8Winner('qf_4'); if (a || b) return [a || 'TBD', b || 'TBD']; }
          if (key === 'tp_1') { const a = top8Loser('sf_1'),  b = top8Loser('sf_2');  if (a || b) return [a || 'TBD', b || 'TBD']; }
          if (key === 'gf_1') { const a = top8Winner('sf_1'), b = top8Winner('sf_2'); if (a || b) return [a || 'TBD', b || 'TBD']; }
          return null;
        }

        function matchName(section, key) {
          if (section === 'lcq')    return `LCQ ${key.replace('lcq_', '')}`;
          if (section === 'top8')   return TOP8_NAMES[key] || key;
          if (section === 'ladder') {
            const [w, r] = key.split('_');
            return +w === 8 ? 'Wildcard' : `Week ${w} Rung ${r}`;
          }
          return key;
        }

        function derivedDate(section, key) {
          if (section === 'ladder') {
            const [w, r] = key.split('_').map(Number);
            const idx = w - 1;
            if (idx < 0 || idx >= WEEK_ENDS.length) return null;
            const d = new Date(WEEK_ENDS[idx]);
            d.setUTCHours(23, 59, 59 - (WEEK_MATCH_COUNTS[idx] - r));
            return d;
          }
          if (section === 'lcq') {
            const n = parseInt(key.replace('lcq_', '')) || 1;
            return new Date(n === 1 ? '2026-04-08' : '2026-05-10');
          }
          const top8Fallback = { qf_1:'2026-07-10T14:00:00Z', qf_2:'2026-07-10T23:00:00Z', qf_3:'2026-07-10T20:00:00Z', qf_4:'2026-07-10T17:00:00Z', sf_1:'2026-07-11T16:30:00Z', sf_2:'2026-07-11T20:00:00Z', tp_1:'2026-07-12T16:30:00Z', gf_1:'2026-07-12T20:00:00Z' };
          return new Date(top8Fallback[key] || '2026-07-10');
        }

        const sectionLabel = { lcq: 'LCQ', ladder: 'Ladder', top8: 'Top 8' };

        //all matches
        const allSlots = [];
        allSlots.push({ section: 'lcq', key: 'lcq_1' }, { section: 'lcq', key: 'lcq_2' });
        WEEK_MATCH_COUNTS.forEach((count, idx) => {
          for (let r = 1; r <= count; r++) allSlots.push({ section: 'ladder', key: `${idx + 1}_${r}` });
        });
        TOP8_KEYS.forEach(key => allSlots.push({ section: 'top8', key }));

        const matches = [];
        allSlots.forEach(({ section, key }) => {
          const result = allResults && allResults[key];
          if (result && result.places && result.places.length > 0) return;

          const schedEntry = (sd[section] || {})[key];
          const timeStr    = schedEntry ? entryTime(schedEntry) : null;
          const dt         = timeStr ? new Date(timeStr) : derivedDate(section, key);
          if (!dt || dt <= now) return;

          const players = (schedEntry ? entryPlayers(schedEntry) : null) || (section === 'top8' ? top8Players(key) : null);
          matches.push({ dt, section, key, name: matchName(section, key), players, fromSchedule: !!timeStr });
        });

        matches.sort((a, b) => a.dt - b.dt);

        if (matches.length === 0) {
          upcomingList.innerHTML = '<div class="uc-empty">No Matches Scheduled</div>';
          const p = document.getElementById('upcoming-prev'), n = document.getElementById('upcoming-next');
          if (p) p.disabled = true; if (n) n.disabled = true;
          return;
        }

        upcomingAllMatches = matches;
        upcomingOffset = 0;
        renderUpcomingPage('init');

        const prevBtn = document.getElementById('upcoming-prev');
        const nextBtn = document.getElementById('upcoming-next');
        if (prevBtn) prevBtn.onclick = () => { upcomingOffset = Math.max(0, upcomingOffset - 1); renderUpcomingPage('prev'); };
        if (nextBtn) nextBtn.onclick = () => { upcomingOffset = Math.min(upcomingAllMatches.length - 4, upcomingOffset + 1); renderUpcomingPage('next'); };
      });
    }

    var resultsLoaded = false;
    var resultsAllEntries = [], resultsOffset = 0;

    function renderResultsPage(direction) {
      const list = document.getElementById('results-list');
      const prevBtn = document.getElementById('results-prev');
      const nextBtn = document.getElementById('results-next');
      if (!list) return;
      const sectionLabel = { lcq: 'LCQ', ladder: 'Ladder', top8: 'Top 8' };
      const page = resultsAllEntries.slice(resultsOffset, resultsOffset + 4);
      list.innerHTML = page.map(e => {
        const places  = e.result.places;
        const dateStr = e.hasScheduleDate ? e.dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
        const vodHtml = e.result.vod
          ? `<a class="uc-vod" href="${e.result.vod}" target="_blank" rel="noopener" onclick="event.stopPropagation()">VOD <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" fill="currentColor" style="vertical-align:middle"><path d="M23.495 6.205a3.007 3.007 0 0 0-2.088-2.088c-1.87-.501-9.396-.501-9.396-.501s-7.507-.01-9.396.501A3.007 3.007 0 0 0 .527 6.205a31.247 31.247 0 0 0-.522 5.805 31.247 31.247 0 0 0 .522 5.783 3.007 3.007 0 0 0 2.088 2.088c1.868.502 9.396.502 9.396.502s7.506 0 9.396-.502a3.007 3.007 0 0 0 2.088-2.088 31.247 31.247 0 0 0 .5-5.783 31.247 31.247 0 0 0-.5-5.805zM9.609 15.601V8.408l6.264 3.602z"/></svg></a>`
          : '';
        let placesHtml;
        if (e.section === 'lcq') {
          const w = places[0];
          placesHtml = `<div class="uc-result-row uc-result-gold">★ ${w.name}<span class="uc-result-time">${w.time}</span></div>`;
        } else if (places.length === 2) {
          const isGF = e.key === 'gf_1';
          placesHtml = places.map((p, i) => {
            const cls  = isGF ? (i === 0 ? 'uc-result-gf-champion' : 'uc-result-gf-runnerup') : (i === 0 ? 'uc-result-won' : 'uc-result-lost');
            const name = (isGF && i === 0) ? `★ ${p.name} ★` : p.name;
            return `<div class="uc-result-row ${cls}">${name}<span class="uc-result-time">${p.time}</span></div>`;
          }).join('');
        } else {
          const cls = ['uc-result-1st', 'uc-result-2nd', 'uc-result-3rd'];
          placesHtml = places.map((p, i) => `<div class="uc-result-row ${cls[i] || 'uc-result-3rd'}">${p.name}<span class="uc-result-time">${p.time}</span></div>`).join('');
        }
        const rowCount = e.section === 'lcq' ? 1 : places.length;
        const spoilerHtml = Array.from({length: rowCount}, () =>
          `<div class="uc-spoiler-row"><span class="uc-spoiler-bar" style="width:80px"></span><span class="uc-spoiler-bar" style="width:44px"></span></div>`
        ).join('');
        return `
          <div class="upcoming-card${direction === 'init' ? ' reveal' : ' visible'}" onclick="goToStandings('${e.section}')">
            <span class="uc-cat uc-cat--${e.section}">${sectionLabel[e.section]}</span>
            <div class="uc-name">${e.name}</div>
            ${dateStr ? `<div class="uc-time">${dateStr}</div>` : ''}
            <div class="uc-places"><div class="uc-real">${placesHtml}</div><div class="uc-spoiler">${spoilerHtml}</div></div>
            <div class="uc-show-results">SHOW RESULTS</div>
            ${vodHtml}
          </div>
        `;
      }).join('');
      if (direction === 'init') {
        document.querySelectorAll('#results-list .reveal').forEach(el => observer.observe(el));
      } else {
        list.classList.remove('anim-next', 'anim-prev');
        void list.offsetWidth;
        list.classList.add(direction === 'next' ? 'anim-next' : 'anim-prev');
      }
      if (prevBtn) prevBtn.disabled = resultsOffset === 0;
      if (nextBtn) nextBtn.disabled = resultsOffset + 4 >= resultsAllEntries.length;
      applySpoilerState();
    }

    function applySpoilerState() {
      const hidden = localStorage.getItem('ll_hide_results') !== '0';
      document.querySelectorAll('#results-list .uc-places').forEach(el => {
        if (hidden && !el.dataset.revealed) el.classList.add('spoiler');
        else el.classList.remove('spoiler');
      });
      const toggle = document.getElementById('spoiler-toggle');
      if (toggle) toggle.checked = hidden;
    }

    function loadRecentResultsContent() {
      if (resultsLoaded) return;
      resultsLoaded = true;
      const resultsList = document.getElementById('results-list');
      if (!resultsList) return;

      Promise.all([schedulePromise, resultsPromise]).then(([sd, allResults]) => {
        const TOP8_NAMES = {
          qf_1: 'Quarterfinal 1', qf_2: 'Quarterfinal 2',
          qf_3: 'Quarterfinal 3', qf_4: 'Quarterfinal 4',
          sf_1: 'Semifinal 1',    sf_2: 'Semifinal 2',
          tp_1: 'Third Place',    gf_1: 'Grand Finals',
        };

        function matchSection(key) {
          if (key.startsWith('lcq_')) return 'lcq';
          if (/^\d+_\d+$/.test(key)) return 'ladder';
          return 'top8';
        }

        function matchName(section, key) {
          if (section === 'lcq')    return `LCQ ${key.replace('lcq_', '')}`;
          if (section === 'top8')   return TOP8_NAMES[key] || key;
          if (section === 'ladder') {
            const [w, r] = key.split('_');
            return +w === 8 ? 'Wildcard' : `Week ${w} Rung ${r}`;
          }
          return key;
        }

        //hardcoded end dates for the weeks + match counts per week don't change any of this
        const WEEK_ENDS        = ['2026-05-17','2026-05-24','2026-05-31','2026-06-07','2026-06-14','2026-06-21','2026-06-21','2026-06-22'];
        const WEEK_MATCH_COUNTS = [7, 6, 5, 4, 3, 2, 1, 1];

        function scheduleTime(section, key) {
          const bucket = (sd[section] || {})[key];
          if (!bucket) return null;
          const t = typeof bucket === 'string' ? bucket : (bucket.time || bucket.start || null);
          return t ? new Date(t) : null;
        }

        //default dates for matches so lowest rung is last day of week and goes backwards
        function matchDate(section, key) {
          const fromSchedule = scheduleTime(section, key);
          if (fromSchedule) return fromSchedule;

          if (section === 'ladder') {
            const [w, r] = key.split('_').map(Number);
            const idx = w - 1;
            if (idx < 0 || idx >= WEEK_ENDS.length) return new Date(0);
            const d = new Date(WEEK_ENDS[idx]);
            d.setUTCHours(23, 59, 59 - (WEEK_MATCH_COUNTS[idx] - r));
            return d;
          }
          if (section === 'lcq') {
            const n = parseInt(key.replace('lcq_', '')) || 1;
            return new Date(n === 1 ? '2026-04-08' : '2026-05-10');
          }
          //top8 default case should not ever be hit
          const top8Fallback = { qf_1:'2026-07-10T14:00:00Z', qf_2:'2026-07-10T23:00:00Z', qf_3:'2026-07-10T20:00:00Z', qf_4:'2026-07-10T17:00:00Z', sf_1:'2026-07-11T16:30:00Z', sf_2:'2026-07-11T20:00:00Z', tp_1:'2026-07-12T16:30:00Z', gf_1:'2026-07-12T20:00:00Z' };
          return new Date(top8Fallback[key] || '2026-07-10');
        }

        const sectionLabel = { lcq: 'LCQ', ladder: 'Ladder', top8: 'Top 8' };

        const entries = Object.entries(allResults || {})
          .filter(([key, r]) => {
            if (!r || !r.places || r.places.length === 0) return false;
            const section = matchSection(key);
            if (section === 'lcq') return true;
            if (section === 'top8') return r.places.length >= 2;
            const w = parseInt(key.split('_')[0]);
            return r.places.length >= (w === 8 ? 2 : 3);
          })
          .map(([key, result]) => {
            const section = matchSection(key);
            const fromSchedule = scheduleTime(section, key);
            return { key, section, result, dt: matchDate(section, key), hasScheduleDate: !!fromSchedule, name: matchName(section, key) };
          })
          .sort((a, b) => b.dt - a.dt);

        if (entries.length === 0) {
          resultsList.innerHTML = '<div class="uc-empty">No Recent Matches</div>';
          const p = document.getElementById('results-prev'), n = document.getElementById('results-next');
          if (p) p.disabled = true; if (n) n.disabled = true;
          return;
        }

        resultsAllEntries = entries;
        resultsOffset = 0;
        renderResultsPage('init');

        const prevBtn = document.getElementById('results-prev');
        const nextBtn = document.getElementById('results-next');
        if (prevBtn) prevBtn.onclick = () => { resultsOffset = Math.max(0, resultsOffset - 1); renderResultsPage('prev'); };
        if (nextBtn) nextBtn.onclick = () => { resultsOffset = Math.min(resultsAllEntries.length - 4, resultsOffset + 1); renderResultsPage('next'); };
      });
    }

    function scrollToUpcoming() {
      loadUpcomingContent();
      loadRecentResultsContent();
      const upcomingSection = document.getElementById('upcoming-section');
      if (!upcomingSection) return;
      upcomingSection.classList.add('visible');
      setTimeout(() => upcomingSection.scrollIntoView({ behavior: 'smooth' }), 100);
    }

    (function() {
      const toggle = document.getElementById('spoiler-toggle');
      if (toggle) {
        toggle.checked = localStorage.getItem('ll_hide_results') !== '0';
        toggle.addEventListener('change', () => {
          localStorage.setItem('ll_hide_results', toggle.checked ? '1' : '0');
          applySpoilerState();
        });
      }
      const resultsList = document.getElementById('results-list');
      if (resultsList) {
        resultsList.addEventListener('click', e => {
          const places = e.target.closest('.uc-places.spoiler');
          const showBtn = e.target.closest('.uc-show-results');
          const target = places || (showBtn && showBtn.closest('.upcoming-card')?.querySelector('.uc-places.spoiler'));
          if (target) {
            e.stopPropagation();
            target.dataset.revealed = '1';
            target.classList.remove('spoiler');
          }
        }, true);
      }
    })();

    (function() {
      const upcomingSection = document.getElementById('upcoming-section');
      if (!upcomingSection) return;
      const upObs = new IntersectionObserver((entries, obs) => {
        entries.forEach(entry => {
          if (!entry.isIntersecting) return;
          loadUpcomingContent();
          loadRecentResultsContent();
          obs.unobserve(entry.target);
        });
      }, { threshold: 0.12 });
      upObs.observe(upcomingSection);
    })();
    //home page twitch EMBED
    (async function initTwitchEmbed() {
      //only show if a match is live according to schedule
      async function anyMatchLive() {
        try {
          const sched = await fetch('/data/schedule.json').then(r => r.json());
          if (sched.liveMatch) return true;
          if (sched.lcqLiveMatch) return true;
        } catch (e) { /* network error */ }
        return false;
      }

      const hero = document.querySelector('#home .hero');
      const embedContainer = document.getElementById('twitch-embed');

      function setLive(live) {
        hero.classList.toggle('live', live);
        if (live && !embedContainer.hasChildNodes()) {
          const hostname = window.location.hostname || 'localhost';
          const w = embedContainer.offsetWidth || 640;
          const h = Math.round(w * 9 / 16);
          //need to set height for twitch to allow autoplay for whatever reason
          embedContainer.style.height = h + 'px';
          const iframe = document.createElement('iframe');
          iframe.src = `https://player.twitch.tv/?channel=legospeedruns&parent=${hostname}&autoplay=true&muted=true&volume=0`;
          iframe.width  = w;
          iframe.height = h;
          iframe.setAttribute('allowfullscreen', '');
          iframe.setAttribute('allow', 'autoplay; fullscreen; encrypted-media; picture-in-picture');
          iframe.style.cssText = 'width:100%;height:100%;display:block;border:0;';
          embedContainer.appendChild(iframe);
        }
      }

      //checking for live state once a minute
      setLive(await anyMatchLive());
      setInterval(async () => setLive(await anyMatchLive()), 60_000);
    })();

