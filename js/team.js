(function initTeam() {
  const nameEls = document.querySelectorAll('#team .team-name');
  if (!nameEls.length) return;

  const SRC_USERNAME = {
    p53: 'P54',
    javster: 'Javster101',
    zacmuffin: 'Zacc',
    saber: 'Saberr',
    anonymous: 'AnAnonymousSource',
    leveye: 'PattonBurns',
  };

  function fetchUserColor(username) {
    return fetch(`https://www.speedrun.com/api/v1/users/${encodeURIComponent(username)}`)
      .then(r => r.ok ? r.json() : null)
      .then(json => {
        const style = json?.data?.['name-style'];
        if (!style) return null;
        const colorFrom  = style['color-from']?.dark || null;
        const colorTo    = style['color-to']?.dark   || null;
        const colorSolid = style['color']?.dark       || null;
        return (colorFrom && colorTo) || colorSolid ? { colorFrom, colorTo, colorSolid } : null;
      })
      .catch(() => null);
  }

  function applyGradientText(el, from, to) {
    el.style.background = `linear-gradient(90deg, ${from}, ${to})`;
    el.style.webkitBackgroundClip = 'text';
    el.style.backgroundClip = 'text';
    el.style.webkitTextFillColor = 'transparent';
  }

  function applyNameColor(el, c) {
    if (!c) return;
    if (c.colorFrom && c.colorTo) applyGradientText(el, c.colorFrom, c.colorTo);
    else if (c.colorSolid) el.style.color = c.colorSolid;
  }

  function edgeColor(c, edge) {
    if (!c) return '#ffffff';
    if (c.colorFrom && c.colorTo) return edge === 'start' ? c.colorFrom : c.colorTo;
    return c.colorSolid || '#ffffff';
  }

  const uniqueNames = [...new Set([...nameEls].map(el => el.dataset.name))];
  window._runWhenIdle(() => {
    Promise.all(uniqueNames.map(name => {
      const username = SRC_USERNAME[name.toLowerCase()] || name;
      return fetchUserColor(username).then(c => [name, c]);
    })).then(results => {
      const colorMap = new Map(results);
      nameEls.forEach(el => applyNameColor(el, colorMap.get(el.dataset.name)));
      document.querySelectorAll('#team .team-sep').forEach(sep => {
        const left  = sep.previousElementSibling;
        const right = sep.nextElementSibling;
        if (!left || !right) return;
        const fromColor = edgeColor(colorMap.get(left.dataset.name), 'end');
        const toColor   = edgeColor(colorMap.get(right.dataset.name), 'start');
        applyGradientText(sep, fromColor, toColor);
      });
    });
  });
})();
