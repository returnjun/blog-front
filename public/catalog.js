import { api } from './api.js';
import { siteDateFormatter } from './dates.js';

const sections = {
  articles: { name: '文章', title: '文章手记', fields: ['type', 'keyword', 'categoryId', 'tag'], mark: 'book' },
  projects: { name: '作品', title: '作品展柜', fields: ['developmentStage', 'tech'], mark: 'case' },
  tools: { name: '工具', title: '工具口袋', fields: [], mark: 'grid' }
};
const articleTypes = { TECH: '技术', LIFE: '生活', DIARY: '日记', PAGE: '独立页面' };
const stages = { DEVELOPING: '开发中', COMPLETED: '已完成', MAINTAINING: '维护中', ARCHIVED: '已归档' };

function node(tag, className, value) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (value != null) element.textContent = value;
  return element;
}

function icon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'cat-icon');
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS(svg.namespaceURI, 'use');
  use.setAttribute('href', '/icons.svg#' + name);
  svg.append(use);
  return svg;
}

function link(label, href, className) {
  const a = node('a', className, label);
  a.href = href;
  return a;
}

function pageUrl(section, params, changes = {}) {
  const next = new URLSearchParams();
  for (const field of sections[section].fields) {
    const value = Object.hasOwn(changes, field) ? changes[field] : params.get(field);
    if (value) next.set(field, value);
  }
  if (changes.page > 1) next.set('page', changes.page);
  return '/' + section + (next.size ? '?' + next : '');
}

function crumb(name, section) {
  const nav = node('nav', 'cat-crumb');
  nav.setAttribute('aria-label', '面包屑');
  nav.append(link('首页', '/'));
  if (section) nav.append(node('span', 'cat-sep', '/'), link(sections[section].title, '/' + section));
  const current = node('span', 'cat-current', name);
  current.setAttribute('aria-current', 'page');
  nav.append(node('span', 'cat-sep', '/'), current);
  return nav;
}

function stamp(mark) {
  const box = node('span', 'cat-stamp');
  box.setAttribute('aria-hidden', 'true');
  box.append(icon(mark));
  return box;
}

function banner(section, settings) {
  const { title, mark } = sections[section];
  const header = node('header', 'cat-banner');
  const heading = node('div');
  heading.append(crumb(title), node('h1', '', title));
  if (section === 'articles' && settings?.site_description) {
    heading.append(node('p', 'cat-site-description', settings.site_description));
  }
  header.append(heading, stamp(mark));
  return header;
}

function filters(section, params, categories, categoryError) {
  const box = node('section', 'cat-filters');
  box.setAttribute('aria-label', '筛选' + sections[section].name);
  const article = section === 'articles';
  const typeKey = article ? 'type' : 'developmentStage';
  const choices = article ? articleTypes : stages;
  const choicesNav = node('nav', 'cat-choices');
  choicesNav.setAttribute('aria-label', article ? '文章类型' : '开发阶段');
  for (const [key, name] of [['', '全部'], ...Object.entries(choices)]) {
    const a = link(name, pageUrl(section, params, { [typeKey]: key }), 'cat-choice');
    if ((params.get(typeKey) || '') === key) a.setAttribute('aria-current', 'true');
    choicesNav.append(a);
  }
  const form = node('form', 'cat-query');
  form.method = 'get';
  form.action = '/' + section;
  form.setAttribute('aria-label', '查询' + sections[section].name);
  if (params.get(typeKey)) {
    const type = node('input');
    type.type = 'hidden';
    type.name = typeKey;
    type.value = params.get(typeKey);
    form.append(type);
  }
  const search = node('label', 'cat-query-text');
  const input = node('input');
  input.type = 'search';
  input.name = article ? 'keyword' : 'tech';
  input.placeholder = article ? '搜索标题、摘要或正文' : '输入完整技术栈名称';
  input.setAttribute('aria-label', input.placeholder);
  input.value = params.get(input.name) || '';
  search.append(icon('search'), input);
  form.append(search);
  if (article) {
    const select = node('select');
    select.name = 'categoryId';
    select.setAttribute('aria-label', '文章分类');
    select.append(new Option('所有分类', ''));
    for (const c of categories) select.append(new Option(c.name, String(c.id)));
    const current = params.get('categoryId');
    if (current && !Array.from(select.options).some(option => option.value === current)) {
      select.append(new Option('分类 ' + current, current));
    }
    select.value = current || '';
    form.append(select);
    const tag = node('input', 'cat-tag-query');
    tag.type = 'search';
    tag.name = 'tag';
    tag.placeholder = '精确标签';
    tag.setAttribute('aria-label', '按完整标签名称筛选');
    tag.value = params.get('tag') || '';
    form.append(tag);
  }
  const submit = node('button', 'cat-submit', '查找');
  submit.type = 'submit';
  form.append(submit);
  form.addEventListener('submit', event => {
    event.preventDefault();
    const submitted = new URLSearchParams();
    for (const [field, value] of new FormData(form)) submitted.set(field, value.trim());
    location.assign(pageUrl(section, submitted));
  });
  if (sections[section].fields.some(field => params.get(field))) {
    form.append(link('清除筛选', '/' + section, 'cat-reset'));
  }
  box.append(choicesNav, form);
  if (categoryError) {
    const note = node('p', 'cat-warning', '分类列表暂时无法读取。');
    note.append(retryButton());
    box.append(note);
  }
  return box;
}

function retryButton() {
  const retry = node('button', 'cat-reset', '重新加载');
  retry.type = 'button';
  retry.addEventListener('click', () => location.reload());
  return retry;
}

function itemTitle(item) {
  return item.title || item.name;
}

function media(item, className) {
  const id = item.coverMediaId || item.iconMediaId;
  if (!/^\d+$/.test(String(id))) return null;
  const img = node('img', className);
  img.alt = '';
  img.loading = 'lazy';
  img.src = '/media/' + id;
  img.addEventListener('error', () => img.remove(), { once: true });
  return img;
}

function itemMeta(item, dateFormat) {
  const meta = node('div', 'cat-meta');
  const label = articleTypes[item.articleType] || stages[item.developmentStage];
  if (label) meta.append(node('span', 'cat-type', label));
  if (item.publishedAt) {
    const published = new Date(item.publishedAt);
    if (!Number.isNaN(published.valueOf())) {
      const time = node('time', '', dateFormat.format(published));
      time.dateTime = item.publishedAt;
      time.title = '首次发布';
      meta.append(time);
    }
  }
  return meta;
}

function tags(item, section) {
  const row = node('div', 'cat-tags');
  const key = section === 'projects' ? 'tech' : 'tag';
  for (const value of (item.techStack || item.tags || [])) {
    row.append(link((key === 'tag' ? '# ' : '') + value, pageUrl(section, new URLSearchParams(), { [key]: value })));
  }
  return row;
}

function itemCard(item, section, dateFormat) {
  const card = node('article', 'cat-card');
  const path = (section === 'tools' ? '/catalog/tools/' : '/' + section + '/') + encodeURIComponent(item.slug);
  const thumbnail = media(item, 'cat-thumb');
  if (thumbnail) card.append(thumbnail);
  const copy = node('div', 'cat-card-copy');
  const meta = itemMeta(item, dateFormat);
  if (meta.childElementCount) copy.append(meta);
  const h2 = node('h2');
  h2.append(link(itemTitle(item), path, 'cat-title-link'));
  copy.append(h2);
  if (item.summary) copy.append(node('p', 'cat-summary', item.summary));
  const itemTags = tags(item, section);
  if (itemTags.childElementCount) copy.append(itemTags);
  const arrow = node('span', 'cat-card-arrow');
  arrow.setAttribute('aria-hidden', 'true');
  arrow.append(icon('arrow'));
  card.append(copy, arrow);
  return card;
}

function statusPanel(heading, message, action, mark = 'mail') {
  const panel = node('div', 'cat-status');
  const messageBox = node('div');
  messageBox.append(node('h2', '', heading));
  if (message) messageBox.append(node('p', '', message));
  panel.append(stamp(mark), messageBox);
  if (action) panel.append(action);
  return panel;
}

function errorPanel(error, section) {
  if (error.status === 404) {
    return statusPanel('内容暂不可见', '这封来信尚未公开，或地址已经变更。', link('返回' + sections[section].title, '/' + section, 'cat-button'));
  }
  return statusPanel('暂时无法读取', error.message || '请稍后再试。', retryButton());
}

function pager(section, params, page, last) {
  const nav = node('nav', 'cat-pager');
  nav.setAttribute('aria-label', '分页');
  if (page > 1) nav.append(link('← 上一页', pageUrl(section, params, { page: page - 1 })));
  nav.append(node('span', '', '第 ' + page + ' 页，共 ' + last + ' 页'));
  if (page < last) nav.append(link('下一页 →', pageUrl(section, params, { page: page + 1 })));
  return nav;
}

function formatFor(settings) {
  return siteDateFormatter('zh-CN', { dateStyle: 'medium' }, settings?.site_timezone);
}

async function list(view, section, url, settings, signal) {
  const params = url.searchParams;
  const args = new URL(pageUrl(section, params), url).searchParams;
  const requested = Number(params.get('page'));
  const page = Number.isSafeInteger(requested) && requested > 0 ? requested : 1;
  const size = settings?.page_size || 20;
  args.set('page', page);
  args.set('size', size);
  const [result, categories] = await Promise.allSettled([
    api('/' + section + '?' + args, { signal }),
    section === 'articles' ? api('/categories', { signal }) : Promise.resolve([])
  ]);
  if (signal?.aborted) return;
  view.replaceChildren(banner(section, settings));
  if (section !== 'tools') view.append(filters(section, params, categories.value || [], categories.status === 'rejected'));
  if (result.status === 'rejected') {
    view.append(errorPanel(result.reason, section));
    return;
  }
  const { items, total } = result.value;
  const name = sections[section].name;
  const last = Math.max(1, Math.ceil(total / size));
  if (items.length) {
    const count = node('p', 'cat-count', '共 ' + total + ' ' + (section === 'articles' ? '篇' : '项') + name);
    const grid = node('div', 'cat-grid');
    const dateFormat = formatFor(settings);
    for (const item of items) grid.append(itemCard(item, section, dateFormat));
    view.append(count, grid);
  } else if (page > last) {
    view.append(statusPanel('这一页没有内容', '', link('返回第一页', pageUrl(section, params), 'cat-button')));
  } else if (sections[section].fields.some(field => params.get(field))) {
    view.append(statusPanel('没有找到匹配的' + name, '可以调整上方筛选条件，或查看全部' + name + '。', link('查看全部' + name, '/' + section, 'cat-button')));
  } else {
    view.append(statusPanel('暂无公开' + name, null, link('回到首页', '/', 'cat-button'), sections[section].mark));
  }
  if (last > 1 && page <= last) view.append(pager(section, params, page, last));
}

function action(label, raw, localAllowed = false) {
  if (typeof raw !== 'string' || raw.includes('\\') || /[\u0000-\u001f\u007f]/.test(raw)) return null;
  const local = localAllowed && /^\/(?!\/)/.test(raw);
  if (!local && !/^https?:\/\//i.test(raw)) return null;
  try {
    const target = new URL(raw, location.origin);
    if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password) return null;
    const a = link(label, target.href, 'cat-button');
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.append(icon('arrow'));
    return a;
  } catch { return null; }
}

let markdown;
async function detail(view, section, slug, about, settings, signal) {
  const [item, { default: MarkdownIt }] = await Promise.all([
    api('/' + section + '/' + encodeURIComponent(slug), { signal }),
    import('./vendor/markdown-it/markdown-it.mjs')
  ]);
  if (signal?.aborted) return;
  markdown ??= new MarkdownIt({ html: false, linkify: false, typographer: false });
  const article = node('article', 'cat-letter');
  const header = node('header', 'cat-letter-head');
  header.append(crumb(about ? '关于我' : itemTitle(item), about ? null : section), node('h1', '', itemTitle(item)));
  const meta = itemMeta(item, formatFor(settings));
  if (item.contentDate) {
    const date = node('time', '', '记录于 ' + item.contentDate);
    date.dateTime = item.contentDate;
    meta.append(date);
  }
  if (meta.childElementCount) header.append(meta);
  if (item.summary) header.append(node('p', 'cat-lead', item.summary));
  const itemTags = tags(item, section);
  if (itemTags.childElementCount) header.append(itemTags);
  article.append(header);
  const cover = media(item, section === 'tools' ? 'cat-tool-icon' : 'cat-cover');
  if (cover) article.append(cover);
  const body = node('div', 'cat-markdown');
  body.innerHTML = markdown.render(item.bodyMarkdown || item.description || '');
  article.append(body);
  const actions = node('div', 'cat-actions');
  const buttons = [action('查看源码', item.repositoryUrl), action('打开演示', item.demoUrl), action('进入工具', item.entryUrl, true)];
  for (const a of buttons) if (a) actions.append(a);
  if (actions.childElementCount) article.append(actions);
  view.replaceChildren(article);
  document.title = itemTitle(item) + (settings?.site_name ? ' · ' + settings.site_name : '');
}

export async function renderCatalog(root, { url, settings, signal }) {
  const pathname = url.pathname.replace(/\/+$/, '');
  const about = pathname === '/about';
  const match = pathname.match(/^\/(articles|projects)(?:\/([^/]+))?$|^\/(tools)$|^\/catalog\/(tools)\/([^/]+)$/);
  const view = node('div', 'wrap cat-page');
  root.replaceChildren(view);
  if (!match && !about) {
    view.append(statusPanel('找不到这个页面', '', link('返回首页', '/', 'cat-button')));
    return;
  }
  const section = about ? 'articles' : (match[1] || match[3] || match[4]);
  const slug = about ? 'about' : (match[2] || match[5]);
  view.dataset.section = about ? 'about' : section;
  const label = about ? '关于我' : sections[section].title;
  document.title = label + (settings?.site_name ? ' · ' + settings.site_name : '');
  const loading = node('p', 'cat-loading', '正在读取' + label + '…');
  loading.setAttribute('role', 'status');
  if (!slug) view.append(banner(section, settings));
  view.append(loading);
  try {
    if (slug) await detail(view, section, decodeURIComponent(slug), about, settings, signal);
    else await list(view, section, url, settings, signal);
  } catch (error) {
    if (!signal?.aborted) view.replaceChildren(crumb(label), errorPanel(error, section));
  }
}
