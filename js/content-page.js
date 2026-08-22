    (function initContent() {
      const sectionsEl = document.getElementById('content-sections');
      if (!sectionsEl) return;

      const PLAY_ICON = '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M8 5v14l11-7z"/></svg>';

      const panel = document.createElement('div');
      panel.className = 'content-expand-panel';
      panel.id = 'content-expand-panel';
      panel.innerHTML = `
        <div class="content-expand-caret"></div>
        <button class="content-expand-close" aria-label="Close video">&times;</button>
        <div class="content-expand-player"></div>
      `;
      const caret = panel.querySelector('.content-expand-caret');
      const player = panel.querySelector('.content-expand-player');
      const closeBtn = panel.querySelector('.content-expand-close');
      let activeCard = null, openToken = 0;

      let contentSeason = 3;

      function positionCaret() {
        if (!activeCard) return;
        const cardRect = activeCard.getBoundingClientRect();
        const gridRect = activeCard.parentNode.getBoundingClientRect();
        caret.style.left = (cardRect.left + cardRect.width / 2 - gridRect.left) + 'px';
      }
      function closePanel() {
        openToken++;
        panel.classList.remove('open');
        player.innerHTML = '';
        if (activeCard) activeCard.classList.remove('active-source');
        activeCard = null;
        if (window.__resumeStarfield) window.__resumeStarfield();
      }
      function openPanel(card) {
        if (activeCard) activeCard.classList.remove('active-source');
        activeCard = card;
        card.classList.add('active-source');
        const myToken = ++openToken;
        const videoId = card.dataset.id;
        player.innerHTML = '';
        const target = document.createElement('div');
        player.appendChild(target);
        card.parentNode.insertBefore(panel, card.nextSibling);
        panel.classList.add('open');
        positionCaret();
        panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        if (window.__pauseStarfield) window.__pauseStarfield();
        loadYouTubeIframeAPI().then(YT => {
          if (myToken !== openToken) return;
          new YT.Player(target, {
            videoId,
            playerVars: { autoplay: 1, rel: 0, cc_load_policy: 0, origin: window.location.origin },
            events: {
              onReady: disableCaptions,
              onError: (e) => {
                console.error('[vod panel] YouTube player error, code:', e.data, 'videoId:', videoId);
                if (myToken === openToken) player.innerHTML = youtubeErrorHtml(`https://youtu.be/${videoId}`);
              },
            },
          });
        });
      }

      closeBtn.addEventListener('click', closePanel);
      window.addEventListener('resize', () => { if (activeCard) positionCaret(); });
      document.addEventListener('keydown', e => { if (e.key === 'Escape' && activeCard) closePanel(); });
      document.querySelectorAll('[data-page]').forEach(link => {
        link.addEventListener('click', () => { if (link.dataset.page !== 'content' && activeCard) closePanel(); });
      });

      function cardsHtml(videos) {
        return videos.map(v => `
          <div class="content-card reveal" data-id="${v.id}">
            <div class="content-card-thumb" style="background-image:url('https://i.ytimg.com/vi/${v.id}/hqdefault.jpg')">
              <div class="content-play-icon">${PLAY_ICON}</div>
              <div class="content-card-duration">${v.duration}</div>
            </div>
            <div class="content-card-title">${v.title}</div>
            ${v.featuring ? `<div class="content-card-featuring">${v.featuring}</div>` : ''}
          </div>
        `).join('');
      }

      const contentSeasonDropdown = document.getElementById('content-season-dropdown');
      if (contentSeasonDropdown) {
        const seasonDropBtn = contentSeasonDropdown.querySelector('.season-dropdown-btn');
        const seasonLabel   = document.getElementById('content-season-label');
        seasonDropBtn.addEventListener('click', e => {
          e.stopPropagation();
          const isOpen = contentSeasonDropdown.classList.toggle('open');
          seasonDropBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
        });
        contentSeasonDropdown.querySelectorAll('.season-dropdown-item').forEach(item => {
          item.addEventListener('click', () => {
            const season = parseInt(item.dataset.sseason);
            contentSeasonDropdown.classList.remove('open');
            seasonDropBtn.setAttribute('aria-expanded', 'false');
            if (season === contentSeason) return;
            contentSeason = season;
            seasonLabel.textContent = `Season ${season}`;
            contentSeasonDropdown.querySelectorAll('.season-dropdown-item').forEach(el => el.classList.toggle('active', el === item));
            renderContent()
          });
        });
        document.addEventListener('click', () => {
          if (contentSeasonDropdown.classList.contains('open')) {
            contentSeasonDropdown.classList.remove('open');
            seasonDropBtn.setAttribute('aria-expanded', 'false');
          }
        });
      }

      async function renderContent() {
        fetch('/data/content.json')
          .then(r => r.json())
          .then(data => {
            const sections = data.sections || [];
            const unsectioned = data.unsectioned || [];
            let html = sections.filter(sec => parseInt(sec.season) == contentSeason).map(sec => `
              <div class="content-section">
                <div class="content-section-title">${sec.name}</div>
                <div class="content-grid">${cardsHtml(sec.videos)}</div>
              </div>
            `).join('');
            if (unsectioned.length) {
              html += `<div class="content-section"><div class="content-grid">${cardsHtml(unsectioned)}</div></div>`;
            }
            sectionsEl.innerHTML = html;
            sectionsEl.appendChild(panel);
            sectionsEl.querySelectorAll('.content-card').forEach(card => {
              card.addEventListener('click', () => {
                card === activeCard ? closePanel() : openPanel(card);
              });
            });
            if (typeof observeAll === 'function') observeAll();
          })
          .catch(err => console.error('Failed to load content.json', err));
      }
      
      renderContent();
    })();

