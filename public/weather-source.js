export const weatherRefreshInterval = 15 * 60 * 1000;
let cached;

async function readJson(url, signal, service) {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  signal?.throwIfAborted();
  signal?.addEventListener('abort', cancel, { once: true });
  const timeout = setTimeout(cancel, 10000);
  try {
    const response = await fetch(url, {
      signal: controller.signal, mode: 'cors', credentials: 'omit',
      referrerPolicy: 'no-referrer', cache: 'no-store'
    });
    if (response.status === 429) throw new Error(service + '繁忙，请稍后再试。');
    if (!response.ok) throw new Error(service + '暂时不可用。');
    return await response.json();
  } catch (error) {
    signal?.throwIfAborted();
    if (controller.signal.aborted) throw new Error(service + '响应超时。');
    if (error instanceof TypeError || error instanceof SyntaxError) throw new Error('暂时无法读取' + service + '的数据。');
    throw error;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', cancel);
  }
}

function cityCoordinate(value, limit) {
  if (typeof value !== 'number' && !(typeof value === 'string' && value.trim())) return null;
  const coordinate = Number(value);
  return Number.isFinite(coordinate) && Math.abs(coordinate) <= limit ? coordinate.toFixed(1) : null;
}

export async function getLocalWeather({ signal, refresh = false } = {}) {
  signal?.throwIfAborted();
  if (!refresh && cached && Date.now() < cached.refreshAt) return cached;

  // A browser-side lookup also works behind a reverse proxy and when opening localhost.
  const location = await readJson('https://get.geojs.io/v1/ip/geo.json', signal, '城市定位服务');
  const city = typeof location?.city === 'string' ? location.city.trim() : '';
  const latitude = cityCoordinate(location?.latitude, 90);
  const longitude = cityCoordinate(location?.longitude, 180);
  if (!city || latitude === null || longitude === null) throw new Error('暂时无法根据这个网络出口确定城市。');

  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.search = new URLSearchParams({
    latitude, longitude, current: 'temperature_2m,weather_code,is_day',
    temperature_unit: 'celsius', timeformat: 'unixtime', timezone: 'auto'
  });
  const data = await readJson(url, signal, '天气服务');
  const current = data?.current;
  if (!Number.isFinite(current?.temperature_2m) || !Number.isInteger(current.weather_code) ||
      ![0, 1].includes(current.is_day) || !Number.isSafeInteger(current.time) || current.time <= 0 ||
      !Number.isFinite(new Date(current.time * 1000).valueOf())) {
    throw new Error('天气服务尚未提供完整的当前天气。');
  }
  signal?.throwIfAborted();
  // Keep only the display fields and next refresh time, never IP addresses or coordinates.
  cached = {
    city, temperature: current.temperature_2m, weatherCode: current.weather_code, isDay: current.is_day === 1,
    observedAt: new Date(current.time * 1000).toISOString(), timeZone: data.timezone || 'UTC',
    sourceLabel: 'Open-Meteo', sourceUrl: 'https://open-meteo.com/',
    refreshAt: Date.now() + weatherRefreshInterval
  };
  return cached;
}
