import { api } from './api.js';
import { siteDateFormatter } from './dates.js';

const main = document.querySelector('#main');
const dialog = document.querySelector('#search-dialog');
const searchInput = document.querySelector('#search-keyword');
const routePattern = /^\/(?:articles(?:\/[^/]+)?|projects(?:\/[^/]+)?|tools|catalog\/tools\/[^/]+|about)?\/?$/;
const typeNames = { TECH: '技术', LIFE: '生活', DIARY: '日记', PAGE: '独立页面' };
let currentPage;
let settingsRequest;
let displayedRoute;

function settings() {
  settingsRequest ??= api('/settings').catch(() => {
    settingsRequest = null;
    return null;
  });
  return settingsRequest;
}

function element(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text != null) el.textContent = text;
  return el;
}

function icon(name) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('class', 'icon');
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS(ns, 'use');
  use.setAttribute('href', '/icons.svg#' + name);
  svg.append(use);
  return svg;
}

function letterRow(item, formatter) {
  const row = element('a', 'letter-row');
  row.href = '/articles/' + encodeURIComponent(item.slug);
  if (item.coverMediaId) {
    const img = element('img', 'cover');
    img.src = '/media/' + encodeURIComponent(item.coverMediaId);
    img.alt = '';
    img.loading = 'lazy';
    img.addEventListener('error', () => img.remove(), { once: true });
    row.append(img);
  }
  const info = element('div', 'letter-info');
  const date = new Date(item.publishedAt);
  const meta = [typeNames[item.articleType], item.publishedAt && Number.isFinite(date.valueOf()) && formatter.format(date)];
  info.append(element('span', 'letter-meta', meta.filter(Boolean).join('  ·  ')), element('h3', null, item.title));
  if (item.summary) info.append(element('p', null, item.summary));
  row.append(info, icon('arrow'));
  return row;
}

function inboxMessage(list, title, message, retry) {
  const state = element('div', 'inbox-state');
  const text = element('div');
  text.append(element('b', null, title), element('p', null, message));
  state.append(icon('mail'), text);
  if (retry) {
    const button = element('button', 'retry', '重试');
    button.type = 'button';
    button.addEventListener('click', retry);
    state.append(button);
  }
  list.replaceChildren(state);
}

function showInbox(config, pageSignal) {
  const list = main.querySelector('.letter-list');
  const tabs = [...main.querySelectorAll('.mail-tabs button')];
  const formatter = siteDateFormatter('zh-CN', { dateStyle: 'medium' }, config?.site_timezone);
  let request;
  pageSignal.addEventListener('abort', () => request?.abort(), { once: true });
  async function load(type) {
    request?.abort();
    request = new AbortController();
    const { signal } = request;
    for (const tab of tabs) tab.setAttribute('aria-pressed', String(tab.dataset.type === type));
    list.setAttribute('aria-busy', 'true');
    list.textContent = '正在收取来信…';
    const query = new URLSearchParams({ page: 1, size: Math.min(3, config?.page_size || 3) });
    if (type) query.set('type', type);
    try {
      const { items } = await api('/articles?' + query, { signal });
      if (signal.aborted) return;
      if (items.length) list.replaceChildren(...items.map(item => letterRow(item, formatter)));
      else inboxMessage(list, type ? '这个信格暂时是空的' : '信箱里还没有公开来信', type ? '换一个栏目看看吧。' : '文章发布后，会按时间出现在这里。');
    } catch (error) {
      if (!signal.aborted) inboxMessage(list, '暂时收不到来信', error.message, () => load(type));
    } finally {
      if (!signal.aborted) list.setAttribute('aria-busy', 'false');
    }
  }
  for (const tab of tabs) tab.addEventListener('click', () => load(tab.dataset.type));
  return load('');
}

function showPostmark(config, signal) {
  const card = main.querySelector('.daily');
  const time = card.querySelector('time');
  const week = card.querySelector('.daily-week');
  const button = card.querySelector('.stamp-button');
  const feedback = card.querySelector('.stamp-feedback');
  const key = 'kasukabe:last-visit-stamp';
  const zone = config?.site_timezone;
  const calendar = siteDateFormatter('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }, zone);
  const weekday = siteDateFormatter('zh-CN', { weekday: 'long' }, zone);
  let saved = '';
  function refresh() {
    const now = new Date();
    const parts = Object.fromEntries(calendar.formatToParts(now).map(part => [part.type, part.value]));
    const day = [parts.year, parts.month, parts.day].join('-');
    time.dateTime = day;
    time.textContent = day.replaceAll('-', '.');
    week.textContent = weekday.format(now);
    let persisted = '';
    try { persisted = localStorage.getItem(key); } catch { /* The stamp still works for this visit. */ }
    const stamped = saved === day || persisted === day;
    card.classList.toggle('stamped', stamped);
    button.disabled = stamped;
    button.querySelector('span').textContent = stamped ? '今日已盖戳' : '盖个到访戳';
    if (!stamped) feedback.textContent = '';
    return day;
  }
  button.addEventListener('click', () => {
    saved = refresh();
    try { localStorage.setItem(key, saved); } catch { /* Keep in memory when storage is unavailable. */ }
    refresh();
    card.classList.remove('stamping');
    requestAnimationFrame(() => card.classList.add('stamping'));
    feedback.textContent = '春日部到访戳，收好啦！';
  });
  window.addEventListener('focus', refresh, { signal });
  window.addEventListener('storage', refresh, { signal });
  const timer = setInterval(refresh, 60000);
  signal.addEventListener('abort', () => clearInterval(timer), { once: true });
  refresh();
}

async function renderPage() {
  currentPage?.abort();
  currentPage = new AbortController();
  const { signal } = currentPage;
  const url = new URL(location.href);
  displayedRoute = url.pathname + url.search;
  const section = url.pathname === '/index.html' ? '' : url.pathname.split('/')[1] || '';
  const navPath = '/' + (section === 'catalog' ? 'tools' : section);
  for (const link of document.querySelectorAll('.site-nav a')) {
    if (link.getAttribute('href') === navPath) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  if (!section) {
    main.replaceChildren(document.querySelector('#home-template').content.cloneNode(true));
    const card = main.querySelector('.weather-card');
    import('./weather-card.js').then(({ mountWeatherCard }) => {
      if (!signal.aborted) mountWeatherCard(card, { signal });
    }).catch(() => {
      if (!signal.aborted) card.textContent = '天气卡暂时无法加载，请刷新页面重试。';
    });
  } else main.replaceChildren(element('p', 'wrap loading-page', '正在打开页面…'));
  const config = await settings();
  if (signal.aborted) return;
  if (config?.site_description) document.querySelector('meta[name="description"]').content = config.site_description;
  if (!section) {
    document.title = '首页 · ' + (config?.site_name || '春日部邮局');
    showPostmark(config, signal);
    await showInbox(config, signal);
  } else {
    const { renderCatalog } = await import('./catalog.js');
    if (!signal.aborted) await renderCatalog(main, { url, settings: config, signal });
  }
}

async function navigate(href, push = true) {
  if (dialog.open) dialog.close();
  if (push && href !== location.href) {
    history.replaceState({ ...history.state, scrollY: window.scrollY }, '');
    history.pushState(null, '', href);
  }
  const restoreY = push ? 0 : history.state?.scrollY || 0;
  const page = renderPage();
  const signal = currentPage.signal;
  main.focus({ preventScroll: true });
  window.scrollTo(0, 0);
  if (restoreY) {
    await page;
    if (!signal.aborted) window.scrollTo(0, restoreY);
  }
}

document.addEventListener('click', event => {
  const link = event.target.closest('a[href]');
  if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || link.target || link.hasAttribute('download')) return;
  const url = new URL(link.href);
  if (url.origin !== location.origin || url.hash || !routePattern.test(url.pathname)) return;
  event.preventDefault();
  navigate(url.href);
});
window.addEventListener('popstate', () => {
  if (location.pathname + location.search !== displayedRoute) navigate(location.href, false);
});

function openSearch() {
  searchInput.value = new URLSearchParams(location.search).get('keyword') || '';
  dialog.showModal();
  searchInput.focus();
  searchInput.select();
}
document.querySelector('.search-trigger').addEventListener('click', openSearch);
document.querySelector('.dialog-close').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', event => {
  if (event.target !== dialog) return;
  const rect = dialog.getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
});
document.addEventListener('keydown', event => {
  if (event.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey && !dialog.open && !event.target.closest('input,textarea,select,[contenteditable]')) {
    event.preventDefault();
    openSearch();
  }
});
document.querySelector('#site-search').addEventListener('submit', event => {
  event.preventDefault();
  const url = new URL('/articles', location.origin);
  if (searchInput.value.trim()) url.searchParams.set('keyword', searchInput.value.trim());
  navigate(url.href);
});
renderPage();
