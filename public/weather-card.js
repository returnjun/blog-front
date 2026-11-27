import { getLocalWeather, weatherRefreshInterval } from './weather-source.js';

// WMO interpretation codes used by Open-Meteo's current.weather_code.
const conditions = {
  0: ['晴', 'clear'], 1: ['少云', 'partly'], 2: ['多云', 'partly'], 3: ['阴', 'cloud'],
  45: ['雾', 'fog'], 48: ['雾凇', 'fog'],
  51: ['轻微毛毛雨', 'rain'], 53: ['毛毛雨', 'rain'], 55: ['浓密毛毛雨', 'rain'],
  56: ['轻微冻毛毛雨', 'rain'], 57: ['浓密冻毛毛雨', 'rain'],
  61: ['小雨', 'rain'], 63: ['中雨', 'rain'], 65: ['大雨', 'rain'],
  66: ['轻微冻雨', 'rain'], 67: ['强冻雨', 'rain'],
  71: ['小雪', 'snow'], 73: ['中雪', 'snow'], 75: ['大雪', 'snow'], 77: ['米雪', 'snow'],
  80: ['小阵雨', 'rain'], 81: ['中阵雨', 'rain'], 82: ['强阵雨', 'rain'],
  85: ['小阵雪', 'snow'], 86: ['强阵雪', 'snow'],
  95: ['雷暴', 'storm'], 96: ['雷暴伴小冰雹', 'storm'], 97: ['强雷暴', 'storm'], 99: ['雷暴伴大冰雹', 'storm']
};
const sun = '<circle class="wc-sun" cx="28" cy="27" r="8"/><path class="wc-rays" d="M28 12v3m0 24v3M13 27h3m24 0h3M17 16l2 2m18 18 2 2m0-22-2 2M19 36l-2 2"/>';
const moon = '<path class="wc-moon" d="M32 15a12 12 0 1 0 9 18c-12 2-18-9-9-18Z"/>';
const cloud = '<path class="wc-cloud" d="M14 34c-7-1-7-11 0-12a10 10 0 0 1 18-4c6-1 10 3 10 7 7 2 6 9-1 9Z"/>';
const accents = {
  fog: '<path class="wc-mist" d="M12 39h28m-21 4h25"/>',
  rain: '<path class="wc-rain" d="m20 38-2 4m11-4-2 4m11-4-2 4"/>',
  snow: '<g class="wc-snow"><circle cx="20" cy="39" r="1.3"/><circle cx="28" cy="42" r="1.3"/><circle cx="36" cy="39" r="1.3"/></g>',
  storm: '<path class="wc-bolt" d="m27 31-4 8h4l-1 6 8-11h-5l2-3Z"/>'
};
const temperature = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 1 });

function node(tag, className, text) {
  const result = document.createElement(tag);
  if (className) result.className = className;
  if (text != null) result.textContent = text;
  return result;
}

function weatherStamp(kind, isDay) {
  const stamp = node('span', 'wc-stamp');
  stamp.setAttribute('aria-hidden', 'true');
  const sky = node('span', 'wc-sky' + (isDay ? '' : ' wc-night'));
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 56 56');
  const light = isDay ? sun : moon;
  if (kind === 'clear') svg.innerHTML = light;
  else if (kind === 'partly') svg.innerHTML = '<g transform="translate(12,-3) scale(.78)">' + light + '</g><g transform="translate(-1,5)">' + cloud + '</g>';
  else if (kind === 'unknown') svg.innerHTML = '<path class="wc-mist" d="M11 21h21m-17 7h29m-32 7h21"/>';
  else svg.innerHTML = cloud + (accents[kind] || '');
  sky.append(svg);
  stamp.append(sky);
  return stamp;
}

function dataTime(iso, zone) {
  const time = node('time');
  time.dateTime = iso;
  time.title = iso;
  const options = { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZoneName: 'short' };
  if (zone) {
    try {
      time.textContent = new Intl.DateTimeFormat('zh-CN', { ...options, timeZone: zone }).format(new Date(iso));
      return time;
    } catch { /* Keep the offset supplied with the reading when the browser lacks this zone. */ }
  }
  const parts = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}).*?(Z|[+-]\d{2}:\d{2})$/.exec(iso);
  time.textContent = parts ? parts[1] + ' ' + parts[2] + ' UTC' + (parts[3] === 'Z' ? '' : parts[3]) : iso;
  return time;
}

function renderReading(body, data) {
  const [label, kind] = conditions[data.weatherCode] || ['天气现象待确认', 'unknown'];
  const value = temperature.format(data.temperature) + ' °C';
  const place = node('div', 'wc-place');
  place.append(node('strong', 'wc-city', data.city), node('small', '', 'IP 估算'));
  const summary = node('div', 'wc-summary');
  summary.append(node('b', 'wc-degrees', value), node('span', 'wc-condition', label));
  const copy = node('div', 'wc-reading');
  copy.append(place, summary);
  const observation = node('div', 'wc-observation');
  observation.append(copy, weatherStamp(kind, data.isDay));
  const details = node('div', 'wc-details');
  const updated = node('span', '', '数据时间 ');
  updated.append(dataTime(data.observedAt, data.timeZone));
  const source = node('a', 'wc-source', data.sourceLabel);
  source.href = data.sourceUrl;
  source.target = '_blank';
  source.rel = 'noopener noreferrer';
  details.append(updated, source);
  body.replaceChildren(observation, details);
  return data.city + '，' + label + '，' + value;
}

export function mountWeatherCard(root, { signal }) {
  if (signal.aborted) return;
  const header = node('header', 'panel-head');
  const title = node('div', 'panel-title');
  const pin = node('span', 'section-icon');
  pin.innerHTML = '<svg class="icon" aria-hidden="true"><use href="/icons.svg#pin"/></svg>';
  title.append(pin, node('h2', '', '当地天气'));
  const button = node('button', 'wc-refresh', '刷新');
  button.type = 'button';
  button.setAttribute('aria-label', '刷新当地天气');
  header.append(title, button);
  const body = node('div', 'wc-body');
  const message = node('p', 'wc-message');
  message.setAttribute('role', 'status');
  root.replaceChildren(header, body, message);

  let refreshAt = 0;
  let request;
  let timer;
  let hasReading = false;
  function schedule() {
    clearTimeout(timer);
    if (document.hidden || signal.aborted || request) return;
    const remaining = refreshAt - Date.now();
    if (remaining <= 0) load(false);
    else timer = setTimeout(() => load(false), remaining);
  }
  function stop() {
    clearTimeout(timer);
    if (request) refreshAt = 0;
    request?.abort();
    request = undefined;
    button.disabled = false;
    body.removeAttribute('aria-busy');
  }
  async function load(refresh) {
    if (request || signal.aborted || document.hidden) return;
    clearTimeout(timer);
    const attempt = new AbortController();
    request = attempt;
    button.disabled = true;
    body.setAttribute('aria-busy', 'true');
    message.classList.toggle('wc-sr-only', hasReading);
    message.textContent = hasReading ? '正在刷新天气…' : '正在按访问 IP 查找当地天气…';
    try {
      const data = await getLocalWeather({ signal: attempt.signal, refresh });
      if (attempt.signal.aborted) return;
      const description = renderReading(body, data);
      refreshAt = data.refreshAt;
      hasReading = true;
      message.classList.add('wc-sr-only');
      message.textContent = '天气已更新。' + description;
      button.textContent = '刷新';
      button.setAttribute('aria-label', '刷新当地天气');
    } catch (error) {
      if (attempt.signal.aborted) return;
      refreshAt = Date.now() + weatherRefreshInterval;
      message.classList.remove('wc-sr-only');
      const reason = error.message || '暂时无法读取当地天气。';
      message.textContent = hasReading ? '刷新失败，当前显示上次的数据。' : reason;
      button.textContent = '重试';
      button.setAttribute('aria-label', '重试加载当地天气');
    } finally {
      if (request === attempt) {
        request = undefined;
        button.disabled = false;
        body.removeAttribute('aria-busy');
        schedule();
      }
    }
  }
  button.addEventListener('click', () => load(true), { signal });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop();
    else schedule();
  }, { signal });
  signal.addEventListener('abort', stop, { once: true });
  schedule();
}
