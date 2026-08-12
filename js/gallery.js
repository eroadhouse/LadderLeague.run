(function initGallery() {
  const container = document.getElementById('gallery-sections');
  if (!container) return;

  function render(sections) {
    const allPhotos = sections.flatMap(s => s.photos);
    let offset = 0;

    container.innerHTML = sections.map(section => {
      const startIndex = offset;
      offset += section.photos.length;
      return `
        <div class="gallery-section">
          <div class="gallery-section-label reveal">${section.label}</div>
          <div class="gallery-grid">
            ${section.photos.map((src, i) => `
              <div class="gallery-item reveal" data-index="${startIndex + i}">
                <img src="${encodeURI(src)}" loading="lazy" alt="" onerror="this.closest('.gallery-item').style.display='none'">
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }).join('');

    container.querySelectorAll('.gallery-item').forEach(item => {
      item.addEventListener('click', () => {
        if (window._openLightbox) window._openLightbox(allPhotos, Number(item.dataset.index));
      });
    });
    if (typeof observeAll === 'function') observeAll();
  }

  fetch('/data/gallery.json', { cache: 'no-store' })
    .then(r => r.json())
    .then(sections => window._runWhenIdle(() => render(sections)))
    .catch(() => {});
})();
