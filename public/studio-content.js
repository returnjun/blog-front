import MarkdownIt from './vendor/markdown-it/markdown-it.mjs';
import { approvePublicArticleMedia, uploadArticleImage } from './studio-article-media.js';

const markdown = new MarkdownIt({ html: false, linkify: false, typographer: false });
const types = { TECH: '技术', LIFE: '生活', DIARY: '日记', PAGE: '独立页面' };
const stages = { DEVELOPING: '开发中', COMPLETED: '已完成', MAINTAINING: '维护中', ARCHIVED: '已归档' };
const visibility = { PRIVATE: '私密', PUBLIC: '公开' };
const statuses = { DRAFT: '草稿', PUBLISHED: '已发布', OFFLINE: '已下线' };
const sections = {
  articles: { name: '文章', heading: '文章手记', mark: 'book', title: 'title', body: 'bodyMarkdown',
    metadata: ['articleType', 'visibility', 'slug', 'categoryId', 'tags', 'contentDate', 'coverMediaId', 'featuredRank'] },
  projects: { name: '作品', heading: '作品展柜', mark: 'case', title: 'name', body: 'bodyMarkdown',
    metadata: ['slug', 'developmentStage', 'techStack', 'repositoryUrl', 'demoUrl', 'coverMediaId', 'featuredRank', 'sortOrder'] },
  tools: { name: '工具', heading: '工具口袋', mark: 'grid', title: 'name', body: 'description',
    metadata: ['slug', 'visibility', 'entryUrl', 'iconMediaId', 'sortOrder'] }
};
const fields = {
  title: ['文章标题', 'text'], name: ['名称', 'text'], summary: ['摘要', 'multiline'],
  bodyMarkdown: ['Markdown 正文', 'markdown'], description: ['Markdown 说明', 'markdown'],
  articleType: ['文章类型', types, 'TECH'], developmentStage: ['开发阶段', stages, 'DEVELOPING'],
  slug: ['网址标识', 'text'], categoryId: ['文章分类', 'category'], visibility: ['可见性', visibility, 'PRIVATE'],
  tags: ['标签', 'list'], techStack: ['技术栈', 'list'], contentDate: ['记录日期', 'date'],
  coverMediaId: ['封面媒体 ID', 'media'], iconMediaId: ['图标媒体 ID', 'media'],
  featuredRank: ['精选排名', 'number'], sortOrder: ['展示顺序', 'number', 0],
  repositoryUrl: ['源码地址', 'url'], demoUrl: ['演示地址', 'url'], entryUrl: ['工具入口', 'text']
};
const pageSize = 12;

function el(tag, text, className) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function icon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const use = document.createElementNS(svg.namespaceURI, 'use');
  svg.setAttribute('class', 'sc-icon');
  svg.setAttribute('aria-hidden', 'true');
  use.setAttribute('href', '/icons.svg#' + name);
  svg.append(use);
  return svg;
}

function link(text, href, className = 'st-btn') {
  const anchor = el('a', text, className);
  anchor.href = href;
  return anchor;
}

function button(text, handler, className = 'st-btn') {
  const control = el('button', text, className);
  control.type = 'button';
  control.addEventListener('click', handler);
  return control;
}

function statusOf(record) {
  if (record.deletedAt) return '回收站';
  if (record.status === 'PUBLISHED' && record.visibility === 'PRIVATE') return '已私密定稿';
  return statuses[record.status] || '草稿';
}

function listUrl(section, trash, page = 1) {
  const query = new URLSearchParams();
  if (trash) query.set('inTrash', 'true');
  if (page > 1) query.set('page', String(page));
  return '/admin/' + section + (query.size ? '?' + query : '');
}

function publicUrl(section, record) {
  if (!record.id || record.deletedAt || record.status !== 'PUBLISHED' || record.visibility === 'PRIVATE') return null;
  return (section === 'tools' ? '/catalog/tools/' : '/' + section + '/') + encodeURIComponent(record.slug);
}

function pageCount(total) {
  return Math.max(1, Math.ceil(total / pageSize));
}

async function renderList(root, { section, query, api, signal }) {
  const spec = sections[section];
  const trash = query.get('inTrash') === 'true';
  const requested = Number(query.get('page'));
  const page = Number.isSafeInteger(requested) && requested > 0 ? requested : 1;
  const { items, total } = await api('/admin/' + section + '?' + new URLSearchParams({ inTrash: trash, page, size: pageSize }), { signal });
  if (signal.aborted) return;

  const panel = el('section', null, 'sc-list st-panel');
  const bar = el('header', null, 'sc-heading');
  const heading = el('div', null, 'sc-heading-name');
  heading.append(icon(spec.mark), el('h1', spec.heading));
  const create = link('新建' + spec.name, '/admin/' + section + '/new', 'st-btn st-primary');
  create.prepend(icon('pen'));
  bar.append(heading, create);
  const tabs = el('nav', null, 'sc-list-tabs');
  tabs.setAttribute('aria-label', '内容状态');
  for (const [recycled, label] of [[false, '全部内容'], [true, '回收站']]) {
    const tab = link(label, listUrl(section, recycled), 'sc-list-tab');
    if (trash === recycled) {
      tab.setAttribute('aria-current', 'page');
      tab.append(el('small', total));
    }
    tabs.append(tab);
  }
  panel.append(bar, tabs);
  for (const item of items) {
    const row = el('article', null, 'sc-row');
    const words = el('div');
    const href = '/admin/' + section + '/' + item.id + new URL(listUrl(section, trash, page), location.origin).search;
    const title = el('h2');
    title.append(link(item[spec.title] || '未命名草稿', href, 'sc-title-link'));
    const meta = el('div', null, 'sc-row-meta');
    meta.append(el('span', statusOf(item), 'sc-status sc-' + item.status.toLowerCase()));
    const description = [types[item.articleType] || stages[item.developmentStage], visibility[item.visibility], item.slug];
    meta.append(el('span', description.filter(Boolean).join(' · ')));
    words.append(title, meta);
    const edit = link(trash ? '查看' : '编辑', href);
    edit.setAttribute('aria-label', (trash ? '查看' : '编辑') + (item[spec.title] || '未命名草稿'));
    row.append(words, edit);
    panel.append(row);
  }
  const last = pageCount(total);
  if (!items.length) {
    const empty = el('div', null, 'sc-empty');
    empty.append(icon('mail'), el('h2', page > last ? '这一页没有内容' : trash ? '回收站是空的' : '还没有' + spec.name));
    if (page > last) empty.append(link('回到第一页', listUrl(section, trash)));
    panel.append(empty);
  }
  if (last > 1 && page <= last) {
    const pager = el('nav', null, 'sc-pager');
    pager.setAttribute('aria-label', '分页');
    if (page > 1) pager.append(link('上一页', listUrl(section, trash, page - 1)));
    pager.append(el('span', '第 ' + page + ' / ' + last + ' 页'));
    if (page < last) pager.append(link('下一页', listUrl(section, trash, page + 1)));
    panel.append(pager);
  }
  root.replaceChildren(panel);
}

function createField(key, record, section, categories) {
  const [caption, type, initial] = fields[key];
  const labelText = key === 'name' ? sections[section].name + '名称' : caption;
  const wrapper = el('div', null, 'sc-field');
  const label = el('label', labelText);
  let control;
  if (typeof type === 'object' || type === 'category') {
    control = el('select');
    const options = type === 'category' ? [['', '未分类'], ...categories.map(c => [c.id, c.name])] : Object.entries(type);
    if (type === 'category' && record.categoryId != null && !categories.some(c => c.id === record.categoryId)) {
      options.push([record.categoryId, '当前分类 #' + record.categoryId]);
    }
    for (const [value, title] of options) control.add(new Option(title, value));
  } else if (['markdown', 'multiline', 'list'].includes(type)) {
    control = el('textarea');
    control.rows = type === 'markdown' ? 15 : 2;
    if (type === 'list') control.placeholder = '每行一个';
  } else {
    control = el('input');
    control.type = type === 'media' ? 'number' : type;
    if (control.type === 'number') {
      control.min = type === 'media' ? '1' : '0';
      control.step = '1';
      if (type !== 'media') control.max = '2147483647';
    }
  }
  if (['name', 'title'].includes(key)) {
    control.maxLength = section === 'tools' ? 100 : 200;
    control.placeholder = '写下' + labelText;
    control.classList.add('sc-title-field');
  }
  if (key === 'slug') {
    control.required = !!record.id || section !== 'articles';
    control.pattern = '[a-z0-9]+(?:-[a-z0-9]+)*';
    control.maxLength = 160;
    control.placeholder = section === 'articles' && !record.id ? '留空可自动生成' : '例如 spring-letter';
    control.title = '使用小写英文字母、数字，用单个短横线分隔词段';
  }
  if (key === 'summary') control.maxLength = 500;
  if (key === 'entryUrl') control.placeholder = '站内路径或 https://…';
  const initialValue = record[key] ?? initial ?? '';
  control.value = Array.isArray(initialValue) ? initialValue.join('\n') : initialValue;
  control.name = key;
  control.id = 'sc-' + key;
  label.htmlFor = control.id;
  wrapper.append(label, control);
  return { wrapper, control };
}

function displayValue(key, value) {
  const type = fields[key][1];
  if (typeof type === 'object') return type[value] || value || '（空）';
  if (Array.isArray(value)) return value.join('\n') || '（空）';
  return value == null || value === '' ? '（空）' : String(value);
}

function readValue(key, control, record) {
  const type = fields[key][1];
  const raw = control.value;
  if (['number', 'category', 'media'].includes(type)) return raw === '' ? null : Number(raw);
  if (type === 'list') {
    const original = record[key] || [];
    return raw === original.join('\n') ? original : raw.split(/\r?\n/).map(value => value.trim()).filter(Boolean);
  }
  if (type === 'markdown') return raw;
  return raw.trim() || null;
}

function fillControl(control, value) {
  const text = Array.isArray(value) ? value.join('\n') : String(value ?? '');
  if (control.value !== text) control.value = text;
}

function showMediaPicker(root, { api, signal }, mode, onPick) {
  const dialog = el('dialog', null, 'sc-dialog st-panel');
  const head = el('div', null, 'sc-heading');
  const title = el('h2', mode === 'body' ? '插入媒体' : '选择图片');
  title.id = 'sc-picker-title';
  dialog.setAttribute('aria-labelledby', title.id);
  const close = button('关闭', () => dialog.close());
  head.append(title, close);
  const content = el('div');
  dialog.append(head, content);
  root.append(dialog);
  const loading = new AbortController();
  const dispose = () => {
    loading.abort();
    dialog.remove();
    signal.removeEventListener('abort', dispose);
  };
  signal.addEventListener('abort', dispose, { once: true });
  dialog.addEventListener('close', dispose, { once: true });
  dialog.showModal();
  async function load(page) {
    content.replaceChildren(el('p', '正在读取媒体…'));
    try {
      const { items, total } = await api('/admin/media?page=' + page + '&size=' + pageSize, { signal: loading.signal });
      if (loading.signal.aborted) return;
      content.replaceChildren();
      if (!items.length) content.append(el('p', '媒体库里还没有文件。'));
      for (const media of items) {
        const row = el('div', null, 'sc-media-row');
        const info = el('div');
        info.append(el('strong', media.name), el('small', '#' + media.id + ' · ' + visibility[media.visibility] + ' · ' + media.mime));
        const pick = button('选择', () => { onPick(media); dialog.close(); });
        pick.setAttribute('aria-label', '选择 ' + media.name);
        pick.disabled = media.status !== 'READY' || (mode !== 'body' && !media.mime?.startsWith('image/'));
        row.append(info, pick);
        content.append(row);
      }
      const last = pageCount(total);
      if (last > 1) {
        const pager = el('div', null, 'sc-pager');
        if (page > 1) pager.append(button('上一页', () => load(page - 1)));
        pager.append(el('span', page + ' / ' + last));
        if (page < last) pager.append(button('下一页', () => load(page + 1)));
        content.append(pager);
      }
    } catch (error) {
      if (!loading.signal.aborted) content.replaceChildren(el('p', error.message), button('重试', () => load(page)));
    }
  }
  load(1);
}

function addMarkdownPreview(wrapper, control, insertMedia, uploadImage) {
  const tabs = el('div', null, 'sc-edit-tabs');
  const preview = el('div', null, 'sc-preview');
  preview.hidden = true;
  function switchTo(reading) {
    write.setAttribute('aria-pressed', String(!reading));
    view.setAttribute('aria-pressed', String(reading));
    control.hidden = reading;
    insert.hidden = reading;
    if (upload) upload.hidden = reading;
    preview.hidden = !reading;
    if (!reading) { control.focus(); return; }
    if (!control.value.trim()) { preview.textContent = '写下正文后即可预览。'; return; }
    preview.innerHTML = markdown.render(control.value);
    for (const anchor of preview.querySelectorAll('a[href]')) {
      anchor.target = '_blank';
      anchor.rel = 'noopener noreferrer';
    }
  }
  const write = button('写作', () => switchTo(false), 'sc-edit-tab');
  const view = button('预览', () => switchTo(true), 'sc-edit-tab');
  const insert = button('插入媒体', insertMedia, 'sc-media-button');
  const upload = uploadImage ? button('上传图片', uploadImage, 'sc-media-button') : null;
  write.setAttribute('aria-pressed', 'true');
  view.setAttribute('aria-pressed', 'false');
  tabs.append(write, view);
  if (upload) tabs.append(upload);
  tabs.append(insert);
  wrapper.insertBefore(tabs, control);
  wrapper.append(preview);
  return () => { if (!preview.hidden) switchTo(true); };
}

async function renderEditor(root, ctx) {
  const { section, id, query, signal, api, replace, onLeave, onDirty } = ctx;
  const spec = sections[section];
  const path = '/admin/' + section;
  let [record, categories] = await Promise.all([
    id === 'new' ? { status: 'DRAFT' } : api(path + '/' + id, { signal }),
    section === 'articles' ? api('/admin/categories', { signal }) : []
  ]);
  if (signal.aborted) return;

  const form = el('form', null, 'sc-editor');
  // 文件选择器独立于正文和封面字段，选择文件本身不会触发草稿保存。
  let uploadInput, applyUpload, refreshCover;
  if (section === 'articles') {
    uploadInput = el('input');
    uploadInput.type = 'file';
    uploadInput.accept = 'image/jpeg,image/png,image/gif,image/webp,.jpg,.jpeg,.png,.gif,.webp';
    uploadInput.hidden = true;
    uploadInput.addEventListener('change', receiveFile);
    form.append(uploadInput);
  }
  const header = el('header', null, 'sc-editor-head');
  const name = el('h1');
  const savedState = el('p', '', 'sc-saved-state');
  savedState.setAttribute('role', 'status');
  const back = link('← 返回' + spec.heading, listUrl(section, !!record.deletedAt || query.get('inTrash') === 'true', Number(query.get('page')) || 1), 'sc-back');
  const headerWords = el('div');
  headerWords.append(back, name);
  header.append(headerWords, savedState);
  const grid = el('div', null, 'sc-editor-grid');
  const page = el('fieldset', null, 'sc-writing st-panel');
  page.setAttribute('aria-label', '撰写' + spec.name);
  const settings = el('fieldset', null, 'sc-properties st-panel');
  settings.setAttribute('aria-label', '投递设置');
  const propertiesHeading = el('h2', '投递设置');
  propertiesHeading.prepend(icon('stamp'));
  settings.append(propertiesHeading);
  const keys = [spec.title, ...(section === 'tools' ? [] : ['summary']), spec.body, ...spec.metadata];
  const controls = {};
  let updatePreview;
  for (const key of keys) {
    const { wrapper, control } = createField(key, record, section, categories);
    controls[key] = control;
    const isMetadata = spec.metadata.includes(key);
    (isMetadata ? settings : page).append(wrapper);
    if (fields[key][1] === 'media') {
      const group = el('div', null, 'sc-media-field');
      const choose = media => {
        control.value = media.id;
        control.dispatchEvent(new Event('input', { bubbles: true }));
      };
      group.append(control);
      if (uploadInput) {
        group.classList.add('sc-cover-field');
        group.append(button('上传封面', () => selectFile(choose), 'sc-media-button'));
      }
      group.append(button('从媒体库选择', () => showMediaPicker(root, ctx, key, choose), 'sc-media-button'));
      wrapper.append(group);
      if (uploadInput) {
        const cover = el('img', null, 'sc-cover-preview');
        cover.alt = '当前文章封面';
        refreshCover = () => {
          const src = /^[1-9]\d*$/.test(control.value) ? '/media/' + control.value : '';
          cover.hidden = !src;
          if (src && cover.getAttribute('src') !== src) cover.src = src;
          if (!src) cover.removeAttribute('src');
        };
        control.addEventListener('input', refreshCover);
        wrapper.append(cover);
      }
    }
    if (key === spec.body) {
      // 在打开系统文件选择器或媒体库前记下选区，两种方式都插入到原光标位置。
      function insertAtSelection() {
        const start = control.selectionStart, end = control.selectionEnd;
        return media => {
          const label = media.name.replace(/[\\\[\]]/g, '\\$&').replace(/[\r\n]+/g, ' ');
          const mark = (media.mime?.startsWith('image/') ? '!' : '') + '[' + label + '](/media/' + media.id + ')';
          control.setRangeText(mark, start, end, 'end');
          control.dispatchEvent(new Event('input', { bubbles: true }));
          return control;
        };
      }
      updatePreview = addMarkdownPreview(wrapper, control,
        () => showMediaPicker(root, ctx, 'body', insertAtSelection()),
        uploadInput ? () => selectFile(insertAtSelection()) : null);
    }
  }
  const report = el('p', '', 'sc-report');
  report.setAttribute('role', 'status');
  const conflict = el('div', null, 'sc-conflict');
  conflict.hidden = true;
  const actions = el('div', null, 'sc-actions');
  const footer = el('section', null, 'sc-savebar st-panel');
  footer.append(report, conflict, actions);
  grid.append(page, settings);
  form.append(header, grid, footer);
  root.replaceChildren(form);
  let revision = 0, savedRevision = 0, pending, timer, locked = false, blocked = false, generatedSlug;

  function selectFile(onReady) {
    if (locked || blocked || record.deletedAt) return;
    applyUpload = onReady;
    uploadInput.value = '';
    uploadInput.click();
  }
  async function receiveFile() {
    const file = uploadInput.files[0];
    const apply = applyUpload;
    applyUpload = null;
    if (!file || !apply || locked || blocked || record.deletedAt) return;
    let returnFocus;
    locked = true;
    clearTimeout(timer);
    refreshActions();
    try {
      if (pending && !await pending) return;
      if (signal.aborted) return;
      note('正在上传「' + file.name + '」…');
      const media = await uploadArticleImage(api, signal, file);
      if (signal.aborted) return;
      returnFocus = apply(media);
      note('已添加「' + media.name + '」。');
    } catch (error) {
      if (!signal.aborted) note(error.message, true);
    } finally {
      locked = false;
      if (!signal.aborted) {
        refreshActions();
        schedule();
        returnFocus?.focus({ preventScroll: true });
      }
    }
  }
  function payload() {
    return Object.fromEntries(keys.map(key => [key, readValue(key, controls[key], record)]));
  }
  function note(message, error = false) {
    report.textContent = message;
    report.classList.toggle('sc-error', error);
  }
  function dirty() { return revision !== savedRevision; }
  function statusLine() {
    const state = [statusOf(record)];
    if (record.id) state.push('版本 ' + record.version);
    state.push(pending || locked ? '正在提交…' : dirty() ? '有未保存修改' : record.id ? '已保存' : '尚未保存');
    savedState.textContent = state.join(' · ');
  }
  function refreshActions() {
    name.textContent = (record.id ? '编辑' : '新建') + spec.name;
    refreshCover?.();
    controls.slug.required = !!record.id || section !== 'articles';
    for (const field of Object.values(controls)) {
      if (field.matches('select')) field.disabled = !!record.deletedAt;
      else field.readOnly = !!record.deletedAt;
    }
    for (const picker of form.querySelectorAll('.sc-media-button')) picker.disabled = !!record.deletedAt;
    const actionsForState = record.deletedAt ? [['restore', '恢复']] : [
      ['save', record.id ? '保存修改' : '保存草稿'],
      record.status === 'PUBLISHED' ? ['offline', '下线'] : ['publish', record.status === 'OFFLINE' ? '重新发布' : '发布'],
      ...(record.id ? [['trash', '移入回收站']] : [])
    ];
    actions.replaceChildren();
    for (const [action, caption] of actionsForState) {
      const primary = action === 'save' || action === 'restore';
      const control = button(caption, () => perform(action), primary ? 'st-btn st-primary' : 'st-btn');
      if (action === 'trash') control.classList.add('sc-danger');
      control.disabled = locked || blocked;
      actions.append(control);
    }
    const href = publicUrl(section, record);
    if (href) {
      const read = link('查看公开页 ↗', href, 'sc-visit');
      read.target = '_blank'; read.rel = 'noopener noreferrer';
      actions.append(read);
    }
    page.disabled = settings.disabled = locked || blocked;
    statusLine();
  }
  function refreshAddress() {
    const params = query.toString();
    replace(path + '/' + record.id + (params ? '?' + params : ''));
  }
  function accept(updated, snapshot, generation) {
    const wasNew = !record.id;
    for (const key of keys) {
      if (!snapshot || controls[key].value === snapshot[key]) fillControl(controls[key], updated[key]);
    }
    record = updated;
    savedRevision = generation;
    if (wasNew) refreshAddress();
    updatePreview();
    refreshActions();
  }
  function normalized(value) { return JSON.stringify(value ?? null); }

  // Compare against the last acknowledged record so unrelated edits made elsewhere survive a merge.
  async function inspectConflict() {
    try {
      const latest = await api(path + '/' + record.id, { signal });
      if (signal.aborted) return;
      if (latest.version === record.version && !!latest.deletedAt === !!record.deletedAt && latest.status === record.status) {
        blocked = false;
        conflict.hidden = true;
        refreshActions();
        return;
      }
      const heading = el('h2', '核对服务器版本 ' + latest.version);
      const compare = el('div', null, 'sc-differences');
      const choices = {};
      const reads = payload();
      for (const key of keys) {
        const mine = reads[key], remote = latest[key], base = record[key];
        if (normalized(mine) === normalized(remote)) continue;
        const row = el('div', null, 'sc-choice-row');
        const pick = el('select');
        pick.setAttribute('aria-label', '选择' + fields[key][0] + '的版本');
        pick.add(new Option('保留本地', 'local')); pick.add(new Option('采用服务器', 'remote'));
        pick.value = normalized(mine) === normalized(base) ? 'remote' : 'local';
        choices[key] = pick;
        row.append(el('strong', fields[key][0]), pick);
        const detail = el('details');
        detail.append(el('summary', '对比内容'), el('small', '本地'), el('pre', displayValue(key, mine)),
          el('small', '服务器'), el('pre', displayValue(key, remote)));
        row.append(detail);
        compare.append(row);
      }
      const adopt = button(latest.deletedAt ? '载入已回收的版本' : '应用选择，继续编辑', () => {
        if (latest.deletedAt && dirty() && !window.confirm('此内容已被回收。舍弃本地修改并读取回收版本？')) return;
        const local = payload();
        let retained = false;
        for (const key of keys) {
          const retain = !latest.deletedAt && choices[key]?.value === 'local';
          fillControl(controls[key], retain ? local[key] : latest[key]);
          retained ||= retain && normalized(local[key]) !== normalized(latest[key]);
        }
        record = latest; revision++; savedRevision = retained ? revision - 1 : revision;
        blocked = false; conflict.hidden = true;
        updatePreview(); refreshActions();
        note(retained ? '合并内容已保留，请保存修改。' : '已读取服务器版本。');
      });
      conflict.replaceChildren(heading, compare, adopt);
    } catch (error) {
      if (signal.aborted) return;
      conflict.replaceChildren(el('p', error.message), button('重新核对服务器版本', inspectConflict));
    }
  }
  async function failed(error) {
    if (signal.aborted) return;
    note(error.message, true);
    if (record.id && error.status === 409) {
      blocked = true; conflict.hidden = false;
      conflict.textContent = '正在核对服务器版本…';
      refreshActions();
      await inspectConflict();
    }
  }
  function save(automatic) {
    if (pending) return pending;
    if (blocked || record.deletedAt) return Promise.resolve(false);
    if (record.id && !dirty()) return Promise.resolve(true);
    if (!(automatic ? form.checkValidity() : form.reportValidity())) {
      note('请检查投递设置中的字段格式。', true);
      return Promise.resolve(false);
    }
    const snapshot = Object.fromEntries(keys.map(key => [key, controls[key].value]));
    const generation = revision;
    const data = payload();
    const method = record.id ? 'PUT' : 'POST';
    const endpoint = record.id ? path + '/' + record.id + (automatic ? '/autosave' : '') : path;
    if (record.id) data.version = record.version;
    if (!record.id && section === 'articles' && !data.slug) {
      // A retry after a lost create response must still address the same unique draft.
      generatedSlug ??= 'draft-' + Array.from(crypto.getRandomValues(new Uint8Array(16)),
        byte => byte.toString(16).padStart(2, '0')).join('');
      data.slug = generatedSlug;
    }
    pending = (async () => {
      try {
        const updated = await api(endpoint, { method, body: data, signal });
        if (signal.aborted) return false;
        accept(updated, snapshot, generation);
        note(automatic ? '草稿已自动保存。' : '修改已保存。');
        return true;
      } catch (error) {
        await failed(error);
        return false;
      } finally {
        pending = null;
        if (!signal.aborted) statusLine();
      }
    })();
    statusLine();
    return pending;
  }
  function draft() { return section === 'articles' && record.id && record.status === 'DRAFT' && !record.deletedAt; }
  function schedule() {
    clearTimeout(timer);
    if (!draft() || blocked || locked || !dirty()) return;
    timer = setTimeout(async () => {
      if (pending) await pending;
      if (!signal.aborted && !locked && !blocked && dirty() && draft()) await save(true);
    }, 1100);
  }
  async function perform(action) {
    if (locked || blocked) return;
    clearTimeout(timer);
    if (action === 'trash' || action === 'offline') {
      const prompt = action === 'trash' ? '将这条内容移入回收站？' : '下线后访客将无法打开此内容。继续下线？';
      if (!window.confirm(prompt + (dirty() ? ' 本页尚未保存的修改将被舍弃。' : ''))) { schedule(); return; }
    }
    // Keep inputs enabled for native validation, then freeze the editor for the complete save-and-publish operation.
    if (['save', 'publish'].includes(action) && !form.reportValidity()) return;
    locked = true;
    refreshActions();
    try {
      if (pending && !await pending) return;
      if (action === 'save' || action === 'publish') {
        // 已公开文章在保存时即对访客生效；草稿则等到作者点击发布再确认。
        if (record.status === 'PUBLISHED' && dirty() && !await allowPublicMedia()) return;
        if (!await save(false)) return;
        if (action === 'save') { note('修改已保存。'); return; }
        if (!await allowPublicMedia()) return;
      }
      const updated = await api(path + '/' + record.id + '/' + action, { method: 'POST', body: { version: record.version }, signal });
      if (signal.aborted) return;
      accept(updated, null, revision);
      note({ publish: '已' + (updated.visibility === 'PRIVATE' ? '私密定稿。' : '发布。'), offline: '内容已下线。',
        trash: '已移入回收站。', restore: '内容已恢复。' }[action]);
      back.href = listUrl(section, !!updated.deletedAt);
    } catch (error) { await failed(error); }
    finally { locked = false; if (!signal.aborted) refreshActions(); }
  }
  async function allowPublicMedia() {
    if (section !== 'articles' || controls.visibility.value !== 'PUBLIC') return true;
    if (await approvePublicArticleMedia(api, signal, payload())) return true;
    note('已取消本次操作。');
    return false;
  }
  form.addEventListener('input', event => {
    if (controls[event.target.name] !== event.target) return;
    revision++;
    statusLine();
    if (!blocked) note('');
    schedule();
  });
  form.addEventListener('submit', event => { event.preventDefault(); perform('save'); });
  onDirty(() => dirty() || locked || !!pending);
  onLeave(async () => {
    if (locked) { note('请等待当前提交结束。'); return false; }
    clearTimeout(timer);
    if (pending) await pending;
    if (!dirty()) return true;
    if (!blocked && draft() && await save(true) && !dirty()) return true;
    return window.confirm('仍有尚未保存的修改，放弃这些修改并离开？');
  });
  signal.addEventListener('abort', () => clearTimeout(timer), { once: true });
  refreshActions();
  if (section === 'articles' && !record.id) note('首次保存后，文章草稿会自动保存。');
}

export async function renderContent(root, ctx) {
  if (!ctx.id) await renderList(root, ctx);
  else await renderEditor(root, ctx);
}
