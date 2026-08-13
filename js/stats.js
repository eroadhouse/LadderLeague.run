    //Stats
    (function initStats() {
      const fmtMs = ms => {
        const t = ms / 1000;
        const h = Math.floor(t / 3600);
        const m = Math.floor((t % 3600) / 60);
        const s = (t % 60).toFixed(2).padStart(5, '0');
        if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${s}`;
        return `${m}:${s}`;
      };

      const spToMs = sp => sp == null ? null : (typeof sp === 'number' ? sp : (sp.time_ms ?? sp.realtime_ms ?? sp.time ?? null));

      const SPLIT_NAMES = [
        'Negotiations','Invasion','Escape','Podrace','Theed','Maul','BHP',
        'Kamino','Droid Factory','Jedi Battle','Gunship','Dooku',
        'Secret Plans','Jundland','Spaceport','Princess','DSE','Rebel Attack',
        "Jabba's",'Carkoon','Speeder','Endor','Destiny','ITDS',
        'Coruscant','Chancellor','Grievous','Kashyyyk','Ruin','Vader',
        'Hoth','Echo Base','Falcon Flight','Dagobah','CCT','Bespin'
      ];

      const EP_ENDS  = [5, 11, 17, 23, 29, 35];
      const EP_NUMS  = [1,  2,  4,  6,  3,  5];
      const EP_ORDER = [1,  2,  4,  6,  3,  5];

      function getRunnerStyle(name) {
        const c = window._nameColorMap?.[name.toLowerCase()];
        if (!c) return '';
        if (c.colorFrom && c.colorTo)
          return `background:linear-gradient(90deg,${c.colorFrom},${c.colorTo});-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;`;
        if (c.colorSolid) return `color:${c.colorSolid};`;
        return '';
      }

      function getSplits(rs) {
        const st = rs.result?.SplitTimes;
        if (!st) return null;
        return st.splits ?? st.score?.splits ?? null;
      }

      const PAST_TOP8_FILES = { 1: '/data/lls1top8.csv', 2: '/data/lls2top8.csv' };
      const PAST_LADDER_FILES = {
        1: [1, 2, 3, 4, 5, 6, 8].map(week => ({ week, url: `/data/lls1w${week}.csv` })),
        2: [1, 2, 3, 4, 5, 6, 7].map(week => ({ week, url: `/data/lls2w${week}.csv` })),
      };
      const pastSeasonCache = {};

      function parseCumTimeToMs(str) {
        if (!str || !str.trim()) return null;
        const parts = str.trim().split(':').map(Number);
        if (parts.some(isNaN)) return null;
        let h = 0, m, s;
        if (parts.length === 3) [h, m, s] = parts;
        else if (parts.length === 2) [m, s] = parts;
        else return null;
        return Math.round((h * 3600 + m * 60 + s) * 1000);
      }

      function canonicalName(n, nameMap) {
        if (!nameMap) return n;
        const lower = n.toLowerCase();
        const exact = nameMap.get(lower);
        if (exact) return exact;
        const matches = [...nameMap.values()].filter(full => full.toLowerCase().includes(lower));
        return matches.length === 1 ? matches[0] : n;
      }

      function parseTop8Csv(text, nameMap) {
        const lines = text.split(/\r?\n/).filter(l => l.trim().length);
        const header = lines[0].split(',');
        const groupStarts = [];
        for (let c = 1; c < header.length; c++) {
          if (header[c] && header[c].trim()) groupStarts.push({ col: c, label: header[c].trim() });
        }
        const nameRow = lines[2].split(',');
        const dataLines = lines.slice(3);

        const events = [];
        const people = {};
        groupStarts.forEach(({ col, label }) => {
          const name1 = canonicalName((nameRow[col] || '').trim(), nameMap);
          const name2 = canonicalName((nameRow[col + 1] || '').trim(), nameMap);
          if (!name1 || !name2) return;
          people[name1] = { name: name1 };
          people[name2] = { name: name2 };
          const splits1 = [], splits2 = [];
          dataLines.forEach(line => {
            const cols = line.split(',');
            splits1.push(parseCumTimeToMs(cols[col]));
            splits2.push(parseCumTimeToMs(cols[col + 1]));
          });
          events.push({
            name: label.toUpperCase(),
            runner_state: {
              [name1]: { result: { SplitTimes: { splits: splits1 } } },
              [name2]: { result: { SplitTimes: { splits: splits2 } } },
            },
          });
        });
        return { events, people };
      }

      function parseLadderWeekCsv(text, weekNum, nameMap) {
        const nameRow = text.split(/\r?\n/).filter(l => l.trim().length)[2].split(',');
        const dataLines = text.split(/\r?\n/).filter(l => l.trim().length).slice(3);

        const groupStarts = [];
        for (let c = 1; c < nameRow.length;) {
          if (nameRow[c] && nameRow[c].trim()) { groupStarts.push(c); c += 4; }
          else c++;
        }

        const events = [];
        const people = {};
        groupStarts.forEach((col, idx) => {
          const names = [0, 1, 2].map(off => canonicalName((nameRow[col + off] || '').trim(), nameMap));
          if (names.some(n => !n)) return;
          const splits = names.map(() => []);
          dataLines.forEach(line => {
            const cols = line.split(',');
            names.forEach((_, off) => splits[off].push(parseCumTimeToMs(cols[col + off])));
          });
          const runner_state = {};
          names.forEach((name, off) => {
            people[name] = { name };
            runner_state[name] = { result: { SplitTimes: { splits: splits[off] } } };
          });
          events.push({ name: `WEEK ${weekNum} RUNG ${idx + 1}`, runner_state });
        });
        return { events, people };
      }

      function getPastSeasonState(season) {
        if (pastSeasonCache[season]) return pastSeasonCache[season];
        const top8Url = PAST_TOP8_FILES[season];
        const ladderFiles = PAST_LADDER_FILES[season] || [];
        if (!top8Url && !ladderFiles.length) return Promise.resolve(null);

        const promise = (async () => {
          const participants = await participantsPromise;
          const nameMap = new Map((participants[`season${season}`] || []).map(p => [p.name.toLowerCase(), p.name]));

          const events = [];
          const people = {};
          const merge = parsed => {
            events.push(...parsed.events);
            Object.assign(people, parsed.people);
          };

          const fetches = [];
          if (top8Url) fetches.push(fetch(top8Url, { cache: 'no-store' }).then(r => r.text()).then(text => merge(parseTop8Csv(text, nameMap))));
          for (const { week, url } of ladderFiles) {
            fetches.push(fetch(url, { cache: 'no-store' }).then(r => r.text()).then(text => merge(parseLadderWeekCsv(text, week, nameMap))));
          }
          await Promise.all(fetches);
          return { events, people };
        })().catch(e => {
          console.error('Could not load past season splits', e);
          pastSeasonCache[season] = null;
          return null;
        });

        pastSeasonCache[season] = promise;
        return promise;
      }

      window._runWhenIdle(() => {
        Object.keys(PAST_TOP8_FILES).forEach(s => getPastSeasonState(parseInt(s)));
      });

      let statsSectionMode = null;
      let statsSeason = 3;

      async function renderStats() {
        const el = document.getElementById('stats-content');
        if (!el) return;

        const state = statsSeason === 3 ? window._amRawState : await getPastSeasonState(statsSeason);
        if (!state) {
          el.innerHTML = '<p style="color:var(--dim)">No data yet.</p>';
          return;
        }

        const isLadderEventName = ev => /^WEEK \d+ RUNG \d+$/i.test(ev.name?.trim() || '') || ev.name?.trim().toUpperCase() === 'WILDCARD MATCH';
        const top8Stage = name => {
          const n = (name || '').trim().toUpperCase();
          if (/^QUARTERFINAL/.test(n)) return 'QF';
          if (/^SEMIFINAL/.test(n))    return 'SF';
          if (n === 'GRAND FINALS' || n === '3RD PLACE MATCH') return 'GF';
          return null;
        };

        const ladderEvents = (state.events || []).filter(isLadderEventName);
        const top8Events = (state.events || []).filter(ev => top8Stage(ev.name)).map(ev => ({ ...ev, stage: top8Stage(ev.name) }));
        const hasLadderSection = ladderEvents.length > 0;
        const hasTop8Section   = top8Events.length > 0;
        if (statsSectionMode === null) statsSectionMode = hasLadderSection ? 'ladder' : 'top8';
        if (statsSectionMode === 'ladder' && !hasLadderSection) statsSectionMode = 'top8';
        if (statsSectionMode === 'top8' && !hasTop8Section) statsSectionMode = 'ladder';
        const matchEvents = statsSectionMode === 'ladder' ? ladderEvents : top8Events;
        const sectionWord = statsSectionMode === 'ladder' ? 'Ladder' : 'Playoff';

        const fastest = [];
        const fastestEp = {};

        for (const ev of matchEvents) {
          for (const [id, rs] of Object.entries(ev.runner_state || {})) {
            const splits = getSplits(rs);
            if (!Array.isArray(splits)) continue;
            const runnerName = (state.people?.[id]?.name) || id;

            const finalResult = rs.result?.SplitTimes?.final_result_precise ?? rs.result?.SplitTimes?.final_result;
            const finalMs = (finalResult && finalResult !== 'DNF')
              ? (() => { const [fh, fm, fs] = finalResult.split(':').map(Number); return (fh * 3600 + fm * 60 + fs) * 1000; })()
              : null;

            const cumAt = i => {
              const ms = spToMs(splits[i]);
              if (ms != null) return ms;
              if (i === 35 && finalMs != null) return finalMs;
              return null;
            };

            // fastest splits (segment times)
            splits.forEach((sp, i) => {
              const cumMs = cumAt(i);
              if (cumMs == null || cumMs <= 0) return;
              const prevMs = cumAt(i - 1) ?? 0;
              const segMs = cumMs - prevMs;
              if (segMs <= 0) return;
              if (!fastest[i] || segMs < fastest[i].ms) fastest[i] = { ms: segMs, runnerName, eventName: ev.name || '—' };
            });
            // final_result fallback for split 35
            if (spToMs(splits[35]) == null && finalMs != null) {
              const prevMs = cumAt(34) ?? 0;
              const segMs = finalMs - prevMs;
              if (segMs > 0 && (!fastest[35] || segMs < fastest[35].ms))
                fastest[35] = { ms: segMs, runnerName, eventName: ev.name || '—' };
            }

            // fastest episodes
            EP_ENDS.forEach((endIdx, epIdx) => {
              const epNum = EP_NUMS[epIdx];
              const endMs = cumAt(endIdx);
              if (endMs == null) return;
              const startMs = epIdx > 0 ? cumAt(EP_ENDS[epIdx - 1]) : 0;
              if (epIdx > 0 && startMs == null) return;
              const epMs = endMs - startMs;
              if (epMs <= 0) return;
              if (!fastestEp[epNum] || epMs < fastestEp[epNum].ms)
                fastestEp[epNum] = { ms: epMs, runnerName, eventName: ev.name || '—' };
            });
          }
        }

        if (!fastest.some(Boolean)) {
          el.innerHTML = '<p style="color:var(--dim)">No split data found across any events.</p>';
          return;
        }

        const thStyle = `text-align:center;padding:.4rem 1rem .4rem 0;color:var(--dim);font-size:.83rem;font-weight:600;letter-spacing:.1em;border-bottom:1px solid var(--border);white-space:nowrap`;
        const td = `padding:.2rem 1rem .2rem 0;font-size:.94rem;text-align:center`;
        const thMatch = `text-align:center;padding:.4rem 0 .4rem 2.5rem;color:var(--dim);font-size:.83rem;font-weight:600;letter-spacing:.1em;border-bottom:1px solid var(--border);white-space:nowrap;min-width:13rem`;
        const tdMatch = `padding:.2rem 0 .2rem 2.5rem;font-size:.94rem;text-align:center;white-space:nowrap;min-width:13rem`;

        const runnerTd = (name) => `<td style="${td};font-weight:700;${getRunnerStyle(name) || 'color:var(--accent2);'}">${name}</td>`;

        //Splits table
        const sob = fastest.reduce((sum, e) => sum + (e ? e.ms : 0), 0);
        let html = `<div class="stats-layout" style="display:flex;flex-wrap:wrap;gap:3rem;align-items:flex-start;justify-content:center;"><div class="stats-tables-col" style="display:flex;flex-direction:column;gap:2rem"><div><div style="color:var(--accent);font-weight:700;font-size:1.1rem;letter-spacing:.15em;margin-bottom:1rem">BEST ${sectionWord.toUpperCase()} SPLITS</div><div class="stats-table-scroll"><table style="border-collapse:collapse">
          <thead><tr>
            <th style="${thStyle}">SPLIT</th>
            <th style="${thStyle}">RUNNER</th>
            <th style="${thStyle}">TIME</th>
            <th style="${thMatch}">MATCH</th>
          </tr></thead><tbody>`;

        fastest.forEach((entry, i) => {
          if (!entry) return;
          html += `<tr>
            <td style="${td};color:var(--dim);white-space:nowrap">${SPLIT_NAMES[i] ?? `Split ${i + 1}`}</td>
            ${runnerTd(entry.runnerName)}
            <td style="${td};color:var(--text);font-variant-numeric:tabular-nums;font-weight:700">${fmtMs(entry.ms)}</td>
            <td style="${tdMatch};color:var(--dim)">${entry.eventName}</td>
          </tr>`;
        });

        html += `</tbody><tfoot><tr>
          <td style="${td};color:var(--accent);font-weight:700;font-size:1.1rem;padding-top:.6rem">${sectionWord} SOB</td>
          <td style="${td};padding-top:.6rem"></td>
          <td style="${td};color:var(--text);font-weight:700;font-size:1.1rem;font-variant-numeric:tabular-nums;padding-top:.6rem">${fmtMs(sob)}</td>
          <td style="${tdMatch};padding-top:.6rem"></td>
        </tr></tfoot></table></div></div>`;

        //Episodes table
        const epSob = EP_ORDER.reduce((sum, n) => sum + (fastestEp[n] ? fastestEp[n].ms : 0), 0);
        html += `<div><div style="color:var(--accent);font-weight:700;font-size:1.1rem;letter-spacing:.15em;margin-bottom:1rem">BEST ${sectionWord.toUpperCase()} EPISODES</div><div class="stats-table-scroll"><table style="border-collapse:collapse">
          <thead><tr>
            <th style="${thStyle}">EPISODE</th>
            <th style="${thStyle}">RUNNER</th>
            <th style="${thStyle}">TIME</th>
            <th style="${thMatch}">MATCH</th>
          </tr></thead><tbody>`;

        EP_ORDER.forEach(epNum => {
          const entry = fastestEp[epNum];
          if (!entry) return;
          html += `<tr>
            <td style="${td};color:var(--dim);white-space:nowrap">Episode ${epNum}</td>
            ${runnerTd(entry.runnerName)}
            <td style="${td};color:var(--text);font-variant-numeric:tabular-nums;font-weight:700">${fmtMs(entry.ms)}</td>
            <td style="${tdMatch};color:var(--dim)">${entry.eventName}</td>
          </tr>`;
        });

        html += `</tbody><tfoot><tr>
          <td style="${td};color:var(--accent);font-weight:700;font-size:1.1rem;padding-top:.6rem">Episode SOB</td>
          <td style="${td};padding-top:.6rem"></td>
          <td style="${td};color:var(--text);font-weight:700;font-size:1.1rem;font-variant-numeric:tabular-nums;padding-top:.6rem">${fmtMs(epSob)}</td>
          <td style="${tdMatch};padding-top:.6rem"></td>
        </tr></tfoot></table></div></div></div>`;

        const groupingKind = statsSectionMode;
        const groupMap = new Map();
        let groupOrder, groupTabLabel, overviewTitle, tabsCaption;

        if (groupingKind === 'ladder') {
          const wildcardKeys = new Set();
          for (const ev of matchEvents) {
            const name = ev.name?.trim().toUpperCase();
            const m = name?.match(/^WEEK (\d+) RUNG (\d+)$/);
            if (m) {
              const w = parseInt(m[1]), r = parseInt(m[2]);
              if (!groupMap.has(w)) groupMap.set(w, []);
              groupMap.get(w).push({ label: `RUNG ${r}`, order: r, ev });
            } else if (name === 'WILDCARD MATCH') {
              if (!groupMap.has(8)) groupMap.set(8, []);
              wildcardKeys.add(8);
              groupMap.get(8).push({ label: 'WILDCARD', order: 1, ev });
            }
          }
          const maxLadderWeek = statsSeason === 2 ? 7 : 8;
          groupOrder = Array.from({ length: maxLadderWeek }, (_, i) => i + 1);
          groupTabLabel = k => wildcardKeys.has(k) ? 'WC' : String(k);
          overviewTitle = 'LADDER RACE OVERVIEWS';
          tabsCaption = 'WEEK';
        } else {
          const STAGE_LABEL = { QF: 'QF', SF: 'SF', GF: 'GF' };
          for (const ev of matchEvents) {
            const stage = ev.stage || 'GF';
            if (!groupMap.has(stage)) groupMap.set(stage, []);
            groupMap.get(stage).push({ label: (ev.name || stage).toUpperCase(), order: groupMap.get(stage).length, ev });
          }
          groupOrder = ['QF', 'SF', 'GF'].filter(s => groupMap.has(s));
          groupTabLabel = k => STAGE_LABEL[k] || k;
          overviewTitle = 'PLAYOFF RACE OVERVIEWS';
          tabsCaption = 'ROUND';
        }

        const hasGroups = groupMap.size > 0;

        const groupsWithData = new Set(groupOrder.filter(k =>
          (groupMap.get(k) || []).some(({ ev }) => {
            const runnersWithSplits = Object.values(ev.runner_state || {}).filter(rs => {
              const sp = getSplits(rs);
              return Array.isArray(sp) && sp.some(s => { const ms = spToMs(s); return ms != null && ms > 0; });
            });
            return runnersWithSplits.length >= 2;
          })
        ));

        const showSectionModeToggle = hasLadderSection && hasTop8Section;

        if (hasGroups) {
          html += `<div class="stats-overview-col">
            <div style="color:var(--accent);font-weight:700;font-size:1.1rem;letter-spacing:.15em;margin-bottom:1.25rem">${overviewTitle}</div>
            ${showSectionModeToggle ? `<div id="stats-section-mode" style="display:flex;align-items:center;justify-content:center;gap:.4rem;margin-bottom:1rem">
              <button data-mode="ladder" style="background:transparent;border:1px solid var(--border);color:${statsSectionMode === 'ladder' ? 'var(--accent)' : 'var(--dim)'};border-color:${statsSectionMode === 'ladder' ? 'var(--accent)' : 'var(--border)'};font-family:'Montserrat',sans-serif;font-size:.72rem;font-weight:700;letter-spacing:.08em;padding:.3rem .8rem;cursor:pointer">LADDER</button>
              <button data-mode="top8" style="background:transparent;border:1px solid var(--border);color:${statsSectionMode === 'top8' ? 'var(--accent)' : 'var(--dim)'};border-color:${statsSectionMode === 'top8' ? 'var(--accent)' : 'var(--border)'};font-family:'Montserrat',sans-serif;font-size:.72rem;font-weight:700;letter-spacing:.08em;padding:.3rem .8rem;cursor:pointer">PLAYOFFS</button>
            </div>` : ''}
            <div style="display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:.75rem;margin-bottom:1.5rem">
              <span style="color:var(--dim);font-size:.8rem;font-weight:600;letter-spacing:.1em">${tabsCaption}</span>
              <div id="stats-week-tabs" style="display:flex;flex-wrap:wrap;justify-content:center;gap:.4rem">
                ${groupOrder.map(k => {
                  const has = groupsWithData.has(k);
                  return `<button data-group="${k}" ${has ? '' : 'disabled'} style="background:transparent;border:1px solid var(--border);color:var(--dim);font-family:'Montserrat',sans-serif;font-size:.85rem;font-weight:700;letter-spacing:.08em;padding:.35rem .7rem;min-width:2.2rem;transition:color .15s,border-color .15s;${has ? 'cursor:pointer' : 'cursor:default;opacity:.3'}">${groupTabLabel(k)}</button>`;
                }).join('')}
              </div>
            </div>
            <div id="stats-race-graphs" style="display:flex;flex-wrap:wrap;justify-content:center;gap:1.25rem"></div>
          </div>`;
        }

        html += `</div>`;
        el.innerHTML = html;

        if (showSectionModeToggle) {
          document.querySelectorAll('#stats-section-mode button').forEach(btn =>
            btn.addEventListener('click', () => {
              if (btn.dataset.mode === statsSectionMode) return;
              statsSectionMode = btn.dataset.mode;
              renderStats();
            })
          );
        }

        if (hasGroups) {
          const GW = 400, GH = 150, ML = 8, MR = 8, MT = 8, MB = 24;
          const fmtSplit = ms => {
            const t = Math.round(ms / 1000);
            const h = Math.floor(t / 3600);
            const m = Math.floor((t % 3600) / 60);
            const s = String(t % 60).padStart(2, '0');
            return h ? `${h}:${String(m).padStart(2,'0')}:${s}` : `${m}:${s}`;
          };

          function getColor(name) {
            const c = window._nameColorMap?.[name.toLowerCase()];
            return c?.colorSolid || c?.colorFrom || '#888888';
          }
          function getColorTo(name) {
            const c = window._nameColorMap?.[name.toLowerCase()];
            return (!c?.colorSolid && c?.colorFrom && c?.colorTo) ? c.colorTo : null;
          }
          let _gradCounter = 0;

          function buildRaceGraph(ev) {
            const candidates = [];
            let incompleteCount = 0;
            for (const [id, rs] of Object.entries(ev.runner_state || {})) {
              const name = state.people?.[id]?.name || id;
              const splits = getSplits(rs);
              if (!Array.isArray(splits)) { incompleteCount++; continue; }
              const finalResult = rs.result?.SplitTimes?.final_result_precise
                ?? rs.result?.SplitTimes?.final_result
                ?? rs.result?.SingleScore?.score?.final_result;
              const finalMs = (finalResult && finalResult !== 'DNF')
                ? (() => { const [h, m, s] = finalResult.split(':').map(Number); return (h * 3600 + m * 60 + s) * 1000; })()
                : null;
              const cumulativeSplits = Array.from({ length: 36 }, (_, i) => {
                const ms = spToMs(splits[i]);
                if (ms != null && ms > 0) return ms;
                if (i === 35 && finalMs != null) return finalMs;
                return null;
              });
              const missingSplits = cumulativeSplits.filter(t => t == null).length;
              if (missingSplits > 10) incompleteCount++;
              candidates.push({ name, cumulativeSplits, missingSplits });
            }
            if (incompleteCount > 1) return null;
            const runners = candidates.filter(r => r.missingSplits <= 10);
            if (!runners.length) return null;

            for (const runner of runners) {
              runner.color = getColor(runner.name);
              runner.colorTo = getColorTo(runner.name);
              runner._gradId = runner.colorTo ? _gradCounter++ : null;
            }

            const avgAtSplit = Array.from({ length: 36 }, (_, i) => {
              const times = runners.map(r => r.cumulativeSplits[i]);
              const valid = times.filter(t => t != null);
              if (valid.length < 2) return null;
              return valid.reduce((a, b) => a + b, 0) / valid.length;
            });
            for (const runner of runners) runner.origCumulativeSplits = [...runner.cumulativeSplits];
            for (const runner of runners) {
              runner.cumulativeSplits = runner.cumulativeSplits.map((t, i) =>
                t != null && avgAtSplit[i] != null ? t - avgAtSplit[i] : null
              );
            }

            const allMs = runners.flatMap(r => r.cumulativeSplits.filter(t => t != null));
            if (!allMs.length) return null;

            const absMax = Math.max(Math.abs(Math.min(...allMs)), Math.abs(Math.max(...allMs))) * 1.1;
            const yMin = -absMax, yMax = absMax;

            const xOf = i => (i / 35) * GW;
            const yOf = t => ((t - yMin) / (yMax - yMin)) * GH;

            let inner = '';

            //episode lines
            EP_ENDS.slice(0, -1).forEach(endIdx => {
              const x = xOf(endIdx + 0.5).toFixed(1);
              inner += `<line x1="${x}" y1="0" x2="${x}" y2="${GH}" stroke="var(--border)" stroke-width="1" opacity="0.7"/>`;
            });

            //episode labels along bottom
            const epMids = [2.5, 8.5, 14.5, 20.5, 26.5, 32.5];
            EP_NUMS.forEach((epNum, i) => {
              const x = xOf(epMids[i]).toFixed(1);
              inner += `<text x="${x}" y="${GH + 17}" text-anchor="middle" fill="var(--dim)" font-size="9" font-family="Montserrat,sans-serif" font-weight="600" letter-spacing="0.05em">EP${epNum}</text>`;
            });

            //avg line
            const y0 = yOf(0).toFixed(1);
            inner += `<line x1="0" y1="${y0}" x2="${GW}" y2="${y0}" stroke="var(--dim)" stroke-width="1" opacity="0.4" stroke-dasharray="4,4"/>`;
            inner += `<line x1="0" y1="${y0}" x2="${GW}" y2="${y0}" stroke="transparent" stroke-width="10" data-avg="1" style="cursor:help"/>`;

            inner += `<line x1="0" y1="${GH}" x2="${GW}" y2="${GH}" stroke="var(--border)" stroke-width="1" opacity="0.5"/>`;

            let defs = '';
            for (const runner of runners) {
              const color = runner.color;
              const stroke = runner.colorTo ? `url(#sg${runner._gradId})` : color;
              if (runner.colorTo)
                defs += `<linearGradient id="sg${runner._gradId}" x1="0" y1="0" x2="${GW}" y2="0" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="${runner.color}"/><stop offset="100%" stop-color="${runner.colorTo}"/></linearGradient>`;
              let d = ''; let started = false;
              runner.cumulativeSplits.forEach((t, i) => {
                if (t == null) return;
                const x = xOf(i).toFixed(1), y = yOf(t).toFixed(1);
                d += !started ? `M${x} ${y} ` : `L${x} ${y} `;
                started = true;
              });
              if (d.trim()) {
                inner += `<path d="${d.trim()}" stroke="${stroke}" stroke-width="2.5" fill="none" stroke-linejoin="round" stroke-linecap="round" data-runner="${runner.name}" style="transition:opacity .15s"/>`;
                inner += `<path d="${d.trim()}" stroke="transparent" stroke-width="12" fill="none" data-runner="${runner.name}" style="cursor:crosshair"/>`;
              }
              runner.cumulativeSplits.forEach((t, i) => {
                if (t == null || runner.origCumulativeSplits[i] == null) return;
                const x = xOf(i).toFixed(1), y = yOf(t).toFixed(1);
                const splitName = SPLIT_NAMES[i] ?? `Split ${i + 1}`;
                inner += `<circle cx="${x}" cy="${y}" r="8" fill="transparent" data-tip="${runner.name}|${fmtSplit(runner.origCumulativeSplits[i])}|${splitName}" data-color="${color}" data-runner="${runner.name}" style="cursor:crosshair"/>`;
              });
            }
            if (defs) inner = `<defs>${defs}</defs>` + inner;

            const svgW = GW + ML + MR, svgH = GH + MT + MB;
            return {
              svg: `<svg viewBox="0 0 ${svgW} ${svgH}" width="${svgW}" height="${svgH}" style="display:block;max-width:100%;height:auto"><g transform="translate(${ML},${MT})">${inner}</g></svg>`,
              runners
            };
          }

          function buildLeadGraph(ev) {
            const entries = Object.entries(ev.runner_state || {});
            if (entries.length !== 2) return null;

            const runners = entries.map(([id, rs]) => {
              const name = state.people?.[id]?.name || id;
              const splits = getSplits(rs);
              const finalResult = rs.result?.SplitTimes?.final_result_precise
                ?? rs.result?.SplitTimes?.final_result
                ?? rs.result?.SingleScore?.score?.final_result;
              const finalMs = (finalResult && finalResult !== 'DNF')
                ? (() => { const [h, m, s] = finalResult.split(':').map(Number); return (h * 3600 + m * 60 + s) * 1000; })()
                : null;
              const cumulativeSplits = Array.from({ length: 36 }, (_, i) => {
                const ms = Array.isArray(splits) ? spToMs(splits[i]) : null;
                if (ms != null && ms > 0) return ms;
                if (i === 35 && finalMs != null) return finalMs;
                return null;
              });
              const missingSplits = cumulativeSplits.filter(t => t == null).length;
              return { name, cumulativeSplits, missingSplits };
            });
            if (runners.some(r => r.missingSplits === 36)) return null;
            if (runners.filter(r => r.missingSplits > 10).length > 1) return null;

            for (const runner of runners) {
              runner.color = getColor(runner.name);
              runner.colorTo = getColorTo(runner.name);
              runner._gradId = runner.colorTo ? _gradCounter++ : null;
            }
            const [r1, r2] = runners;

            const lead = Array.from({ length: 36 }, (_, i) => {
              const a = r1.cumulativeSplits[i], b = r2.cumulativeSplits[i];
              return (a == null || b == null) ? null : a - b;
            });

            const maxLead = Math.max(0, ...lead.filter(v => v != null).map(Math.abs));
            const yMax = maxLead > 0 ? maxLead : 1;
            const yMin = -yMax;

            const barSlot = GW / 36;
            const barW = barSlot * 0.62;
            const xOf = i => barSlot * i + barSlot / 2;
            const yOf = v => ((v - yMin) / (yMax - yMin)) * GH;
            const yCenter = yOf(0);

            let inner = '';

            //episode lines
            EP_ENDS.slice(0, -1).forEach(endIdx => {
              const x = (barSlot * (endIdx + 1)).toFixed(1);
              inner += `<line x1="${x}" y1="0" x2="${x}" y2="${GH}" stroke="var(--border)" stroke-width="1" opacity="0.7"/>`;
            });

            //episode labels along bottom
            const epMids = [2.5, 8.5, 14.5, 20.5, 26.5, 32.5];
            EP_NUMS.forEach((epNum, i) => {
              const x = xOf(epMids[i]).toFixed(1);
              inner += `<text x="${x}" y="${GH + 17}" text-anchor="middle" fill="var(--dim)" font-size="9" font-family="Montserrat,sans-serif" font-weight="600" letter-spacing="0.05em">EP${epNum}</text>`;
            });

            //tied line
            inner += `<line x1="0" y1="${yCenter.toFixed(1)}" x2="${GW}" y2="${yCenter.toFixed(1)}" stroke="var(--dim)" stroke-width="1" opacity="0.4" stroke-dasharray="4,4"/>`;
            inner += `<line x1="0" y1="${GH}" x2="${GW}" y2="${GH}" stroke="var(--border)" stroke-width="1" opacity="0.5"/>`;

            let defs = '';
            [r1, r2].forEach(r => {
              if (r.colorTo)
                defs += `<linearGradient id="sg${r._gradId}" x1="0" y1="0" x2="0" y2="${GH}" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="${r.color}"/><stop offset="100%" stop-color="${r.colorTo}"/></linearGradient>`;
            });

            lead.forEach((v, i) => {
              if (!v) return;
              const ahead = v < 0 ? r1 : r2;
              const yTop = v < 0 ? yOf(v) : yCenter;
              const yBottom = v < 0 ? yCenter : yOf(v);
              const barH = Math.max(1, yBottom - yTop);
              const x = (xOf(i) - barW / 2).toFixed(1);
              const fill = ahead.colorTo ? `url(#sg${ahead._gradId})` : ahead.color;
              const splitName = SPLIT_NAMES[i] ?? `Split ${i + 1}`;
              const tipAttrs = `data-tip="lead" data-split="${splitName}" data-n1="${r1.name}" data-t1="${fmtSplit(r1.cumulativeSplits[i])}" data-c1="${r1.color}" data-n2="${r2.name}" data-t2="${fmtSplit(r2.cumulativeSplits[i])}" data-c2="${r2.color}" data-ahead="${v < 0 ? 1 : 2}"`;
              const hitX = (xOf(i) - barSlot / 2).toFixed(1);
              inner += `<rect x="${hitX}" y="0" width="${barSlot.toFixed(1)}" height="${GH}" fill="transparent" data-runner="${ahead.name}" ${tipAttrs} style="cursor:crosshair"/>`;
              inner += `<rect x="${x}" y="${yTop.toFixed(1)}" width="${barW.toFixed(1)}" height="${barH.toFixed(1)}" rx="1.5" fill="${fill}" data-runner="${ahead.name}" ${tipAttrs} style="cursor:crosshair;transition:opacity .15s"/>`;
            });

            if (defs) inner = `<defs>${defs}</defs>` + inner;

            const svgW = GW + ML + MR, svgH = GH + MT + MB;
            return {
              svg: `<svg viewBox="0 0 ${svgW} ${svgH}" width="${svgW}" height="${svgH}" style="display:block;max-width:100%;height:auto"><g transform="translate(${ML},${MT})">${inner}</g></svg>`,
              runners
            };
          }

          function renderGroup(key) {
            const racesEl = document.getElementById('stats-race-graphs');
            if (!racesEl) return;
            const items = (groupMap.get(key) || []).slice().sort((a, b) => a.order - b.order);
            racesEl.innerHTML = items.map(({ label, ev }) => {
              const isHeadToHead = Object.keys(ev.runner_state || {}).length === 2;
              const result = isHeadToHead ? buildLeadGraph(ev) : buildRaceGraph(ev);
              if (!result) return '';
              const { svg, runners } = result;
              const legend = runners.map(r => {
                const lineEl = r.colorTo
                  ? `<span style="flex-shrink:0;width:14px;height:2.5px;border-radius:2px;background:linear-gradient(to right,${r.color},${r.colorTo})"></span>`
                  : `<svg width="14" height="3" style="flex-shrink:0;overflow:visible"><line x1="0" y1="1.5" x2="14" y2="1.5" stroke="${r.color}" stroke-width="2.5"/></svg>`;
                const nameEl = r.colorTo
                  ? `<span style="font-weight:600;font-size:.78rem;letter-spacing:.03em;background:linear-gradient(to right,${r.color},${r.colorTo});-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text">${r.name}</span>`
                  : `<span style="color:${r.color};font-weight:600;font-size:.78rem;letter-spacing:.03em">${r.name}</span>`;
                return `<span data-runner="${r.name}" style="display:inline-flex;align-items:center;gap:.3rem;margin-right:.6rem;cursor:pointer;transition:opacity .15s">${lineEl}${nameEl}</span>`;
              }).join('');
              return `<div class="graph-anim" style="border:1px solid var(--border);padding:1rem 1.25rem;flex:0 0 auto;max-width:100%;box-sizing:border-box">
                <div style="color:var(--text);font-size:.75rem;letter-spacing:.12em;font-weight:600;margin-bottom:.5rem">${label}</div>
                <div style="margin-bottom:.6rem;display:flex;flex-wrap:wrap;align-items:center;justify-content:center">${legend}</div>
                <div>${svg}</div>
              </div>`;
            }).join('');

            //box animation
            requestAnimationFrame(() => {
              const boxes = [...racesEl.querySelectorAll(':scope > div.graph-anim')];
              const rowMap = new Map();
              boxes.forEach(box => {
                const top = box.offsetTop;
                if (!rowMap.has(top)) rowMap.set(top, []);
                rowMap.get(top).push(box);
              });
              [...rowMap.values()].forEach((rowBoxes, rowIdx) => {
                rowBoxes.forEach(box => { box.style.transitionDelay = `${rowIdx * 130}ms`; });
              });
              setTimeout(() => {
                boxes.forEach(box => box.classList.add('visible'));
              }, 20);
            });
          }

          function selectGroup(key) {
            document.querySelectorAll('#stats-week-tabs button:not([disabled])').forEach(btn => {
              const active = btn.dataset.group === String(key);
              btn.style.color = active ? 'var(--accent)' : 'var(--dim)';
              btn.style.borderColor = active ? 'var(--accent)' : 'var(--border)';
            });
            renderGroup(key);
          }
          document.querySelectorAll('#stats-week-tabs button:not([disabled])').forEach(btn =>
            btn.addEventListener('click', () => selectGroup(groupingKind === 'ladder' ? parseInt(btn.dataset.group) : btn.dataset.group))
          );
          const firstGroupWithData = groupOrder.find(k => groupsWithData.has(k));
          if (firstGroupWithData !== undefined) selectGroup(firstGroupWithData);

          let tip = document.getElementById('stats-tooltip');
          if (!tip) {
            tip = document.createElement('div');
            tip.id = 'stats-tooltip';
            tip.style.cssText = 'position:fixed;pointer-events:none;display:none;background:var(--bg);border:1px solid var(--border);padding:.35rem .65rem;font-size:.82rem;font-family:Montserrat,sans-serif;z-index:9999;white-space:nowrap;letter-spacing:.02em';
            document.body.appendChild(tip);
          }
          const racesDiv = document.getElementById('stats-race-graphs');
          racesDiv.addEventListener('mousemove', e => {
            const c = e.target.closest('[data-tip]');
            const avgLine = e.target.closest('line[data-avg]');
            if (c && c.dataset.tip === 'lead') {
              const row = (name, time, color, isAhead) => `<div style="display:flex;align-items:center;gap:.6rem"><span style="color:${color};font-weight:700">${name}</span><span style="color:var(--text);font-variant-numeric:tabular-nums;margin-left:auto;font-weight:${isAhead ? '700' : '400'}">${time}</span></div>`;
              tip.innerHTML = `<div style="color:var(--dim);font-size:.72rem;letter-spacing:.05em;margin-bottom:.3rem">${c.dataset.split}</div>`
                + row(c.dataset.n1, c.dataset.t1, c.dataset.c1, c.dataset.ahead === '1')
                + row(c.dataset.n2, c.dataset.t2, c.dataset.c2, c.dataset.ahead === '2');
              tip.style.display = 'block';
              tip.style.left = (e.clientX + 14) + 'px';
              tip.style.top = (e.clientY - 32) + 'px';
            } else if (c) {
              const [name, time, split] = c.dataset.tip.split('|');
              tip.innerHTML = `<span style="color:${c.dataset.color};font-weight:700;margin-right:.5rem">${name}</span><span style="color:var(--dim);margin-right:.5rem;font-size:.75rem">${split}</span><span style="color:var(--text);font-variant-numeric:tabular-nums">${time}</span>`;
              tip.style.display = 'block';
              tip.style.left = (e.clientX + 14) + 'px';
              tip.style.top = (e.clientY - 32) + 'px';
            } else if (avgLine) {
              tip.innerHTML = `<span style="color:var(--dim);font-size:.75rem;letter-spacing:.05em">AVERAGE SPLIT TIME</span>`;
              tip.style.display = 'block';
              tip.style.left = (e.clientX + 14) + 'px';
              tip.style.top = (e.clientY - 32) + 'px';
            } else {
              tip.style.display = 'none';
            }
          });
          function applyHighlight(container, name, exactEl) {
            racesDiv.querySelectorAll('path[data-runner], rect[data-runner]').forEach(el => { el.style.opacity = ''; });
            racesDiv.querySelectorAll('span[data-runner]').forEach(el => { el.style.opacity = ''; });
            if (!container || !name) return;
            if (exactEl) {
              container.querySelectorAll('rect[data-runner]').forEach(el => {
                el.style.opacity = el.dataset.split === exactEl.dataset.split ? '' : '0.15';
              });
            } else {
              //line graphs
              container.querySelectorAll('path[data-runner]').forEach(el => {
                el.style.opacity = el.dataset.runner !== name ? '0.15' : '';
              });
            }
            container.querySelectorAll('span[data-runner]').forEach(el => {
              el.style.opacity = el.dataset.runner !== name ? '0.25' : '';
            });
          }
          racesDiv.addEventListener('mouseover', e => {
            const el = e.target.closest('[data-runner]');
            const container = e.target.closest('.graph-anim');
            const isBar = el && el.tagName.toLowerCase() === 'rect';
            applyHighlight(container, el ? el.dataset.runner : null, isBar ? el : null);
          });
          racesDiv.addEventListener('mouseleave', () => {
            tip.style.display = 'none';
            applyHighlight(null, null);
          });
        }
      }

      const statsSeasonDropdown = document.getElementById('stats-season-dropdown');
      if (statsSeasonDropdown) {
        const seasonDropBtn = statsSeasonDropdown.querySelector('.season-dropdown-btn');
        const seasonLabel   = document.getElementById('stats-season-label');
        seasonDropBtn.addEventListener('click', e => {
          e.stopPropagation();
          const isOpen = statsSeasonDropdown.classList.toggle('open');
          seasonDropBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
        });
        statsSeasonDropdown.querySelectorAll('.season-dropdown-item').forEach(item => {
          item.addEventListener('click', () => {
            const season = parseInt(item.dataset.sseason);
            statsSeasonDropdown.classList.remove('open');
            seasonDropBtn.setAttribute('aria-expanded', 'false');
            if (season === statsSeason) return;
            statsSeason = season;
            statsSectionMode = null;
            seasonLabel.textContent = `Season ${season}`;
            statsSeasonDropdown.querySelectorAll('.season-dropdown-item').forEach(el => el.classList.toggle('active', el === item));
            const contentEl = document.getElementById('stats-content');
            const loadingTimer = setTimeout(() => {
              if (contentEl) contentEl.innerHTML = '<p style="color:var(--dim)">Loading...</p>';
            }, 150);
            renderStats().then(() => clearTimeout(loadingTimer));
          });
        });
        document.addEventListener('click', () => {
          if (statsSeasonDropdown.classList.contains('open')) {
            statsSeasonDropdown.classList.remove('open');
            seasonDropBtn.setAttribute('aria-expanded', 'false');
          }
        });
      }

      window._statsRender = renderStats;
      document.addEventListener('amUpdate', () => renderStats());
      document.addEventListener('nameColorMapReady', renderStats);
      renderStats();
    })();


