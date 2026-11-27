(() => {
  const key = 'kasukabe:season';
  const root = document.documentElement;

  function savedSeason() {
    try { return localStorage.getItem(key); }
    catch { return root.dataset.season; }
  }

  function showSeason(value) {
    const season = value === 'snow' ? 'snow' : 'sun';
    root.dataset.season = season;
    document.querySelector('meta[name="theme-color"]').content = season === 'snow' ? '#edf4fa' : '#f7f5ec';
    for (const control of document.querySelectorAll('season-switch')) {
      const radio = control.querySelector('input[value="' + season + '"]');
      if (radio) radio.checked = true;
    }
  }

  // Apply the preference before the browser paints either the blog or the studio.
  showSeason(savedSeason());

  class SeasonSwitch extends HTMLElement {
    connectedCallback() {
      if (this.firstElementChild) return;
      const choices = document.createElement('fieldset');
      choices.className = 'season-options';
      choices.setAttribute('aria-label', '页面天气风格');
      for (const [value, caption] of [['sun', '晴天'], ['snow', '雪天']]) {
        const label = document.createElement('label');
        label.className = 'season-choice';
        label.title = '切换到' + caption + '风格';
        const radio = document.createElement('input');
        radio.type = 'radio';
        radio.name = 'page-season';
        radio.value = value;
        radio.checked = root.dataset.season === value;
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('class', 'season-symbol');
        svg.setAttribute('aria-hidden', 'true');
        const use = document.createElementNS(svg.namespaceURI, 'use');
        use.setAttribute('href', '/icons.svg#season-' + value);
        svg.append(use);
        label.append(radio, svg, caption);
        choices.append(label);
      }
      choices.addEventListener('change', event => {
        const value = event.target.value;
        showSeason(value);
        try { localStorage.setItem(key, value); }
        catch { /* The choice still applies to this page when storage is disabled. */ }
      });
      this.append(choices);
    }
  }
  customElements.define('season-switch', SeasonSwitch);
  window.addEventListener('storage', event => {
    if (event.key === key || event.key === null) showSeason(savedSeason());
  });
  window.addEventListener('pageshow', event => {
    if (event.persisted) showSeason(savedSeason());
  });
})();
