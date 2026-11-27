import { api as request } from './api.js';

const nav = document.querySelector('#studio-nav');
const screen = document.querySelector('#studio-screen');
const check = document.querySelector('#session-check');
const login = document.querySelector('#signin');
const workspace = document.querySelector('#workspace');
const form = document.querySelector('#sign-in-form');
const authFeedback = document.querySelector('#auth-feedback');
const identity = document.querySelector('#identity');
const signout = document.querySelector('#signout');
const notice = document.querySelector('#studio-notice');
const sections = {
  desk: ['工作台', 'home'], articles: ['文章手记', 'book'], projects: ['作品展柜', 'case'],
  tools: ['工具口袋', 'grid'], categories: ['文章分类', 'stamp'], media: ['媒体库', 'mail'], settings: ['站点设置', 'settings']
};
let profile = null;
let authGeneration = 0;
let currentPage;
let leaveGuard;
let dirty;
let locked = true;
let navigating = false;
let restoration;
let noticeTimer;
let displayed = location.pathname + location.search;
let historyIndex = history.state?.studioIndex ?? 0;
history.replaceState({ studioIndex: historyIndex }, '');

function el(tag, cls, label) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (label != null) node.textContent = label;
  return node;
}
function mark(name) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('class', 'icon');
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS(ns, 'use');
  use.setAttribute('href', '/icons.svg#' + name);
  svg.append(use);
  return svg;
}
function link(label, href, cls) {
  const a = el('a', cls, label);
  a.href = href;
  return a;
}
function sectionPath(key) { return key === 'desk' ? '/admin/' : '/admin/' + key; }
function notify(message) {
  notice.textContent = message;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => { notice.textContent = ''; }, 5000);
}
for (const [key, [label, icon]] of Object.entries(sections)) {
  if (key === 'articles' || key === 'categories') nav.append(el('p', 'st-nav-label', key === 'articles' ? '内容管理' : '邮局管理'));
  const a = link(label, sectionPath(key));
  a.prepend(mark(icon));
  a.dataset.section = key;
  nav.append(a);
}

function showLogin(message) {
  locked = true;
  check.hidden = true;
  workspace.hidden = true;
  identity.hidden = signout.hidden = true;
  login.hidden = false;
  authFeedback.textContent = message || '';
  document.title = '站主登录 · 春日部邮局';
  form.elements.username.focus({ preventScroll: true });
}
async function api(path, options = {}) {
  const generation = authGeneration;
  try {
    return await request(path, options);
  } catch (error) {
    if (error.status === 401 && !locked && generation === authGeneration && !options.signal?.aborted) {
      showLogin('登录已过期。请重新登录以继续编辑。');
    }
    throw error;
  }
}
function showWorkspace(user, resumed = false) {
  const sameUser = profile && profile.id === user.id;
  profile = user;
  authGeneration++;
  locked = false;
  identity.textContent = user.nickname || user.username;
  signout.title = '退出 ' + (user.nickname || user.username);
  check.hidden = login.hidden = true;
  workspace.hidden = identity.hidden = signout.hidden = false;
  if (resumed && sameUser && dirty?.() && displayed === location.pathname + location.search) {
    document.title = '继续编辑 · 春日部邮局';
    notify('已重新登录，可以继续保存。');
    return;
  }
  render();
}
async function checkSession() {
  check.replaceChildren(document.createTextNode('正在检查登录状态…'));
  try {
    showWorkspace(await request('/admin/session'));
  } catch (error) {
    if (error.status === 401) return showLogin();
    const retry = el('button', 'st-btn', '重新连接');
    retry.type = 'button';
    retry.addEventListener('click', checkSession);
    check.replaceChildren(el('p', 'st-error', error.message), retry);
  }
}
form.addEventListener('submit', async event => {
  event.preventDefault();
  const submit = form.querySelector('button');
  if (submit.disabled) return;
  submit.disabled = true;
  authFeedback.textContent = '';
  try {
    const user = await request('/admin/session', { method: 'POST', body: {
      username: form.elements.username.value.trim(), password: form.elements.password.value
    } });
    form.reset();
    showWorkspace(user, true);
  } catch (error) {
    authFeedback.textContent = error.message;
  } finally { submit.disabled = false; }
});
signout.addEventListener('click', async () => {
  if (signout.disabled || !(await mayLeave())) return;
  signout.disabled = true;
  try {
    await request('/admin/session', { method: 'DELETE' });
  } catch (error) {
    if (error.status !== 401) { notify(error.message); return; }
  } finally { signout.disabled = false; }
  currentPage?.abort();
  leaveGuard = dirty = null;
  profile = null;
  authGeneration++;
  screen.replaceChildren();
  history.replaceState({ studioIndex: historyIndex }, '', '/admin/');
  displayed = '/admin/';
  showLogin('已退出登录。');
});

async function mayLeave() {
  return !leaveGuard || await leaveGuard();
}
function replace(path) {
  history.replaceState({ studioIndex: historyIndex }, '', path);
  displayed = location.pathname + location.search;
}
async function go(path) {
  if (navigating || restoration) return false;
  navigating = true;
  try {
    if (!(await mayLeave())) return false;
    if (displayed !== path) history.pushState({ studioIndex: ++historyIndex }, '', path);
    if (!locked) render();
    return true;
  } finally { navigating = false; }
}
document.addEventListener('click', event => {
  const a = event.target.closest('a[href]');
  if (!a || event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || a.target || a.hasAttribute('download')) return;
  const url = new URL(a.href);
  if (url.origin !== location.origin || url.hash) return;
  if (/^\/admin(?:\/|$)/.test(url.pathname)) {
    event.preventDefault();
    go(url.pathname + url.search);
  }
  // Native navigation to the blog uses the same beforeunload protection as a refresh.
});
window.addEventListener('beforeunload', event => {
  if (dirty?.()) { event.preventDefault(); event.returnValue = ''; }
});
window.addEventListener('popstate', async event => {
  const target = event.state?.studioIndex;
  if (restoration && target === historyIndex) { restoration = false; return; }
  if ((!locked || profile) && !(await mayLeave())) {
    if (Number.isInteger(target) && target !== historyIndex) {
      restoration = true;
      history.go(historyIndex - target);
    } else { replace(displayed); }
    return;
  }
  historyIndex = target ?? 0;
  if (!locked) render();
});

async function dashboard(root, signal) {
  const hero = el('header', 'st-desk-hero');
  const text = el('div', 'st-desk-copy');
  text.append(el('h1', '', '邮局工作台'), link('写一篇文章', '/admin/articles/new', 'st-btn st-primary'));
  hero.append(text);
  const cards = el('div', 'st-counts');
  const recent = el('section', 'st-panel st-recent');
  const title = el('div', 'st-head');
  title.append(el('h2', '', '最近编辑的文章'), link('查看全部', '/admin/articles', 'st-text-link'));
  recent.append(title);
  const list = el('div', 'st-recent-list', '正在读取…');
  recent.append(list);
  root.replaceChildren(hero, cards, recent);
  await Promise.all(['articles', 'projects', 'tools'].map(async (section, index) => {
    const [label] = sections[section];
    const a = link('', sectionPath(section), 'st-count st-count-' + section);
    const art = el('span', 'st-count-stamp');
    art.setAttribute('aria-hidden', 'true');
    const copy = el('span', 'st-count-copy');
    const number = el('strong', '', '…');
    copy.append(el('span', '', label), number);
    a.append(art, copy);
    cards.append(a);
    try {
      const { total, items } = await api('/admin/' + section + '?inTrash=false&page=1&size=' + (index === 0 ? 5 : 1), { signal });
      if (signal.aborted) return;
      number.textContent = String(total);
      if (section !== 'articles') return;
      list.replaceChildren();
      if (!items.length) list.append(el('p', 'st-empty', '还没有文章。可以从一篇草稿开始。'));
      for (const item of items) {
        const row = link('', '/admin/articles/' + item.id, 'st-recent-row');
        const state = item.status === 'PUBLISHED' ? (item.visibility === 'PRIVATE' ? '已私密定稿' : '已发布') : { DRAFT: '草稿', OFFLINE: '已下线' }[item.status] || item.status;
        row.append(el('span', 'st-recent-name', item.title || '未命名草稿'), el('span', 'st-status', state));
        list.append(row);
      }
    } catch (error) {
      if (signal.aborted) return;
      number.textContent = '暂不可读';
      if (section === 'articles') list.replaceChildren(el('p', 'st-error', error.message));
    }
  }));
}

async function render() {
  clearTimeout(noticeTimer);
  notice.textContent = '';
  currentPage?.abort();
  currentPage = new AbortController();
  const { signal } = currentPage;
  leaveGuard = dirty = null;
  displayed = location.pathname + location.search;
  const [, , raw, id] = location.pathname.split('/');
  const section = !raw || raw === 'index.html' ? 'desk' : raw;
  const name = sections[section]?.[0] || '写作台';
  document.title = name + ' · 春日部邮局';
  for (const a of nav.querySelectorAll('a')) {
    if (a.dataset.section === section) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
  const view = el('div', 'st-view');
  screen.replaceChildren(view);
  view.append(el('p', 'st-panel', '正在读取…'));
  screen.focus({ preventScroll: true });
  window.scrollTo(0, 0);
  const ctx = {
    section, id: id || null, query: new URLSearchParams(location.search), signal, api, go,
    replace: path => { if (!signal.aborted) replace(path); },
    onLeave: fn => { if (!signal.aborted) leaveGuard = fn; },
    onDirty: fn => { if (!signal.aborted) dirty = fn; }
  };
  try {
    if (section === 'desk') await dashboard(view, signal);
    else if (['articles', 'projects', 'tools'].includes(section)) {
      const { renderContent } = await import('./studio-content.js');
      if (!signal.aborted) await renderContent(view, ctx);
    } else {
      const { renderManagement } = await import('./studio-management.js');
      if (!signal.aborted) await renderManagement(view, ctx);
    }
  } catch (error) {
    if (signal.aborted) return;
    const box = el('section', 'st-panel');
    const retry = el('button', 'st-btn', '重新读取');
    retry.addEventListener('click', () => go(displayed));
    box.append(el('h1', '', name), el('p', 'st-error', error.message), retry);
    view.replaceChildren(box);
  }
}
checkSession();
