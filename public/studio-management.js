const mediaPageSize = 20;
const mediaStatus = { READY: '已就绪', UPLOADING: '上传中', DELETING: '删除中' };
const settingFields = [
  ['site_name', '网站名称', 'text'],
  ['site_description', '网站简介', 'textarea'],
  ['site_timezone', '站点时区', 'text'],
  ['page_size', '每页条数', 'number'],
  ['media_default_storage', '新文件默认存储', 'select']
];

function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text != null) element.textContent = text;
  return element;
}

function button(label, action, primary = false) {
  const element = node('button', 'st-btn' + (primary ? ' st-primary' : ''), label);
  element.type = 'button';
  element.addEventListener('click', action);
  return element;
}

function submit(label) {
  const element = node('button', 'st-btn st-primary', label);
  element.type = 'submit';
  return element;
}

function field(label, control, hint) {
  const wrapper = node('label', 'st-field mg-field');
  wrapper.append(node('span', 'mg-label', label), control);
  if (hint) wrapper.append(node('small', 'mg-hint', hint));
  return wrapper;
}

function input(name, value, type = 'text') {
  const control = node('input');
  control.name = name;
  control.type = type;
  control.value = value ?? '';
  return control;
}

function heading(title, action) {
  const header = node('header', 'st-head mg-heading');
  header.append(node('h1', '', title));
  if (action) header.append(action);
  return header;
}

function panel() {
  return node('section', 'st-panel mg-panel');
}

function guardChanges(ctx, state, changed) {
  ctx.onDirty?.(() => state.busy || changed());
  ctx.onLeave?.(() => {
    if (state.busy) {
      state.message('请求正在处理，请稍候。');
      return false;
    }
    return !changed() || window.confirm('放弃尚未提交的修改并离开？');
  });
}

function categoryForm(category, save, cancel) {
  const form = node('form', 'mg-category-fields');
  const name = input('name', category?.name);
  name.required = true;
  name.maxLength = 100;
  const slug = input('slug', category?.slug);
  slug.required = true;
  slug.pattern = '[a-z0-9]+(-[a-z0-9]+)*';
  slug.maxLength = 100;
  slug.spellcheck = false;
  const order = input('sortOrder', category?.sortOrder ?? 0, 'number');
  order.min = '0';
  order.max = '2147483647';
  order.step = '1';
  const actions = node('div', 'st-actions mg-actions');
  actions.append(submit('保存分类'), button('取消', cancel));
  form.append(field('分类名称', name), field('分类标识', slug, '小写字母、数字，词间用短横线连接。'),
    field('排序', order, '小的排在前面。'), actions);
  form.addEventListener('submit', event => {
    event.preventDefault();
    save({ name: name.value.trim(), slug: slug.value, sortOrder: Number(order.value) });
  });
  const changed = () => name.value !== (category?.name ?? '') || slug.value !== (category?.slug ?? '')
    || Number(order.value) !== (category?.sortOrder ?? 0);
  return { form, changed };
}

async function categories(ctx, state) {
  const endpoint = '/admin/categories';
  let entries = await ctx.api(endpoint, { signal: ctx.signal });
  if (ctx.signal.aborted) return;
  const editor = panel();
  const list = panel();
  let editedId;
  let changed = () => false;
  guardChanges(ctx, state, () => changed());

  function closeEditor() {
    editedId = undefined;
    changed = () => false;
    editor.hidden = true;
    editor.replaceChildren();
  }
  function discard() {
    return !changed() || window.confirm('放弃正在编辑的分类？');
  }
  function edit(entry) {
    if (!discard()) return;
    editedId = entry?.id;
    const fields = categoryForm(entry, data => state.run(async () => {
      const saved = await ctx.api(entry ? endpoint + '/' + entry.id : endpoint, {
        method: entry ? 'PUT' : 'POST', body: data, signal: ctx.signal
      });
      if (ctx.signal.aborted) return;
      entries = entries.filter(item => item.id !== saved.id);
      entries.push(saved);
      entries.sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
      closeEditor();
      drawList();
      state.message('已保存分类「' + saved.name + '」。');
    }), () => { if (discard()) closeEditor(); });
    changed = fields.changed;
    editor.hidden = false;
    editor.replaceChildren(node('h2', '', entry ? '编辑分类' : '新建分类'), fields.form);
    fields.form.elements.name.focus();
  }
  function remove(entry) {
    if (!window.confirm('删除分类「' + entry.name + '」？')) return;
    state.run(async () => {
      await ctx.api(endpoint + '/' + entry.id, { method: 'DELETE', signal: ctx.signal });
      if (ctx.signal.aborted) return;
      entries = entries.filter(item => item.id !== entry.id);
      if (editedId === entry.id) closeEditor();
      drawList();
      state.message('已删除分类「' + entry.name + '」。');
    });
  }
  function drawList() {
    const rows = node('div', 'mg-rows');
    for (const entry of entries) {
      const row = node('article', 'mg-row');
      const info = node('div', 'mg-item');
      info.append(node('h3', '', entry.name), node('p', 'mg-meta', entry.slug + ' · 排序 ' + entry.sortOrder));
      const actions = node('div', 'st-actions mg-actions');
      const removeButton = button('删除', () => remove(entry));
      removeButton.classList.add('mg-remove');
      actions.append(button('编辑', () => edit(entry)), removeButton);
      row.append(info, actions);
      rows.append(row);
    }
    list.replaceChildren(node('h2', '', '已有分类（' + entries.length + '）'),
      entries.length ? rows : node('p', 'mg-empty', '还没有文章分类。'));
  }
  closeEditor();
  drawList();
  state.fields.replaceChildren(heading('文章分类', button('新建分类', () => edit(null), true)), editor, list);
}

function fileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function mediaRow(item, state, toggle, remove) {
  const row = node('article', 'mg-row mg-media-row');
  const path = '/media/' + item.id;
  const ready = item.status === 'READY';
  const thumb = node('div', 'mg-thumb');
  const shortType = item.mime?.split('/')[1] || 'FILE';
  thumb.append(node('span', '', shortType === 'octet-stream' ? 'FILE' : shortType.toUpperCase()));
  if (ready && ['image/png','image/jpeg','image/gif','image/webp'].includes(item.mime)) {
    const img = node('img');
    img.loading = 'lazy';
    img.alt = '';
    img.addEventListener('error', () => img.remove(), { once: true });
    img.src = path;
    thumb.append(img);
  }
  const info = node('div', 'mg-item');
  info.append(node('h3', '', item.name), node('p', 'mg-meta',
    'ID ' + item.id + ' · ' + fileSize(item.size) + ' · ' + mediaStatus[item.status] + ' · ' + (item.visibility === 'PUBLIC' ? '公开' : '私密')));
  const actions = node('div', 'st-actions mg-actions');
  if (ready) {
    const open = node('a', 'st-btn', '打开文件');
    open.href = path;
    open.target = '_blank';
    open.rel = 'noopener noreferrer';
    actions.append(open, button('复制地址', async () => {
      try { await navigator.clipboard.writeText(path); state.message('已复制 ' + path); }
      catch { window.prompt('复制文件地址', path); }
    }), button(item.visibility === 'PUBLIC' ? '设为私密' : '设为公开', () => toggle(item)));
  }
  const del = button(item.status === 'DELETING' ? '重试删除' : '删除', () => remove(item));
  del.classList.add('mg-remove');
  actions.append(del);
  row.append(thumb, info, actions);
  return row;
}

async function media(ctx, state) {
  const endpoint = '/admin/media';
  const rawPage = Number(ctx.query.get('page'));
  const page = Number.isInteger(rawPage) && rawPage > 0 && rawPage <= 2147483647 ? rawPage : 1;
  const read = () => ctx.api(endpoint + '?page=' + page + '&size=' + mediaPageSize, { signal: ctx.signal });
  let pageData = await read();
  if (ctx.signal.aborted) return;
  const uploadPanel = panel();
  const list = panel();
  const form = node('form', 'mg-upload');
  const file = input('file', '', 'file');
  file.required = true;
  const uploadButton = submit('上传文件');
  form.append(field('选择文件', file, '每次可上传一个文件，最大 25 MB。新上传的文件仅站主可见。'), uploadButton);
  uploadPanel.append(node('h2', '', '上传媒体'), form);
  guardChanges(ctx, state, () => Boolean(file.files.length));
  const pageUrl = number => number === 1 ? '/admin/media' : '/admin/media?page=' + number;

  async function refresh() {
    try {
      const current = await read();
      if (ctx.signal.aborted) return;
      pageData = current;
      drawList();
    } catch (error) {
      if (ctx.signal.aborted) return;
      list.replaceChildren(node('p', 'st-error', '媒体清单暂时无法刷新。' + error.message),
        button('重新加载清单', () => state.run(refresh)));
    }
  }
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const selected = file.files[0];
    if (!selected) return;
    if (selected.size > 25 * 1024 * 1024) {
      state.message('请重新选择 25 MB 以内的文件。', true);
      return;
    }
    const data = new FormData();
    data.append('file', selected);
    const ok = await state.run(async () => {
      const saved = await ctx.api(endpoint, { method: 'POST', body: data, signal: ctx.signal });
      form.reset();
      state.message('已上传「' + saved.name + '」。');
      if (page === 1) await refresh();
    });
    if (ok && !ctx.signal.aborted && page !== 1) ctx.go(pageUrl(1));
  });
  function toggle(item) {
    const visibility = item.visibility === 'PUBLIC' ? 'PRIVATE' : 'PUBLIC';
    if (visibility === 'PRIVATE' && !window.confirm('将「' + item.name + '」设为私密？引用此文件的公开页面会受到影响。')) return;
    state.run(async () => {
      const saved = await ctx.api(endpoint + '/' + item.id + '/visibility', { method: 'PUT', body: { visibility }, signal: ctx.signal });
      if (ctx.signal.aborted) return;
      pageData.items = pageData.items.map(row => row.id === saved.id ? saved : row);
      drawList();
      state.message('已更新「' + saved.name + '」的可见性。');
    });
  }
  async function remove(item) {
    if (!window.confirm('永久删除文件「' + item.name + '」？')) return;
    let previous = false;
    const ok = await state.run(async () => {
      await ctx.api(endpoint + '/' + item.id, { method: 'DELETE', signal: ctx.signal });
      if (ctx.signal.aborted) return;
      await refresh();
      previous = page > 1 && pageData.items.length === 0;
      state.message('已删除「' + item.name + '」。');
    });
    if (ok && previous && !ctx.signal.aborted) ctx.go(pageUrl(page - 1));
  }
  function drawList() {
    const { items, total } = pageData;
    const rows = node('div', 'mg-rows');
    for (const item of items) rows.append(mediaRow(item, state, toggle, remove));
    const last = Math.max(1, Math.ceil(total / mediaPageSize));
    list.replaceChildren(node('h2', '', '媒体清单（' + total + '）'),
      items.length ? rows : node('p', 'mg-empty', page === 1 ? '还没有上传文件。' : '这一页没有文件。'));
    if (last === 1 && page === 1) return;
    const nav = node('nav', 'mg-pager');
    nav.setAttribute('aria-label', '媒体分页');
    if (page > 1) nav.append(button('上一页', () => ctx.go(pageUrl(Math.min(last, page - 1)))));
    nav.append(node('span', '', '第 ' + page + ' 页 · 共 ' + last + ' 页'));
    if (page < last) nav.append(button('下一页', () => ctx.go(pageUrl(page + 1))));
    list.append(nav);
  }
  drawList();
  state.fields.replaceChildren(heading('媒体库'), uploadPanel, list);
}

async function settings(ctx, state) {
  const endpoint = '/admin/settings';
  const [initial, providers] = await Promise.all([
    ctx.api(endpoint, { signal: ctx.signal }),
    ctx.api(endpoint + '/storage-providers', { signal: ctx.signal })
  ]);
  if (ctx.signal.aborted) return;
  const box = panel();
  box.append(node('h2', '', '网站配置'));
  const controls = new Map();
  let saved = initial;
  const original = key => String(saved[key] ?? '');
  const isChanged = key => controls.get(key).value !== original(key);
  guardChanges(ctx, state, () => [...controls.keys()].some(isChanged));
  for (const [key, title, type] of settingFields) {
    const form = node('form', 'mg-setting');
    let control;
    if (type === 'select') {
      control = node('select');
      for (const [code, name] of Object.entries(providers)) control.add(new Option(name, code));
      if (saved[key] && !Object.hasOwn(providers, saved[key])) {
        const old = new Option(saved[key] + '（当前未启用）', saved[key]);
        old.disabled = true;
        control.add(old);
      }
    } else if (type === 'textarea') {
      control = node('textarea');
      control.rows = 2;
    } else {
      control = input(key, original(key), type);
    }
    control.name = key;
    control.value = original(key);
    control.required = key !== 'site_description';
    if (type === 'number') {
      control.min = '1';
      control.max = '100';
      control.step = '1';
    }
    controls.set(key, control);
    const hints = { site_timezone: '例如 Asia/Shanghai 或 UTC+08:00。', page_size: '访客目录每页显示 1 至 100 条。' };
    const save = submit('保存');
    save.setAttribute('aria-label', '保存' + title);
    form.append(field(title, control, hints[key]), save);
    form.addEventListener('submit', event => {
      event.preventDefault();
      state.run(async () => {
        const keep = new Set([...controls.keys()].filter(other => other !== key && isChanged(other)));
        const value = type === 'number' ? Number(control.value) : control.value;
        const response = await ctx.api(endpoint + '/' + key, { method: 'PUT', body: { value }, signal: ctx.signal });
        if (ctx.signal.aborted) return;
        saved = response;
        for (const [other, field] of controls) if (!keep.has(other)) field.value = original(other);
        state.message('已保存' + title + '。');
      });
    });
    box.append(form);
  }
  state.fields.replaceChildren(heading('站点设置'), box);
}

export async function renderManagement(root, ctx) {
  const view = node('div', 'mg-view');
  view.dataset.section = ctx.section;
  const fields = node('fieldset', 'mg-controls');
  const notice = node('p', 'mg-notice');
  notice.setAttribute('role', 'status');
  notice.setAttribute('aria-live', 'polite');
  view.append(notice, fields);
  root.replaceChildren(view);
  const state = {
    busy: false, fields,
    message(text, error = false) {
      if (ctx.signal.aborted) return;
      notice.textContent = text;
      notice.classList.toggle('st-error', error);
      if (error && notice.getBoundingClientRect().bottom < 0) notice.scrollIntoView({ block: 'nearest' });
    },
    async run(action) {
      if (state.busy || ctx.signal.aborted) return false;
      state.busy = true;
      fields.disabled = true;
      try {
        await action();
        return true;
      } catch (error) {
        state.message(error.message, true);
        return false;
      } finally {
        state.busy = false;
        fields.disabled = false;
      }
    }
  };
  fields.append(node('p', 'mg-hint', '正在读取…'));
  try {
    await ({ categories, media, settings })[ctx.section](ctx, state);
  } catch (error) {
    if (ctx.signal.aborted) return;
    state.message(error.message, true);
    fields.replaceChildren(button('重新读取', () => renderManagement(root, ctx)));
  }
}
