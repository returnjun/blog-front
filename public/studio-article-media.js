const imageMimeTypes = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);

/** 在传输前检查本地选择的文件。服务端还会按实际内容识别文件格式。 */
function checkImageFile(file) {
  if (!file || file.size === 0) throw new Error('请选择一张有内容的图片。');
  if (file.size > 25 * 1024 * 1024) throw new Error('图片超过 25 MB，请缩小后再上传。');
  const supported = file.type ? imageMimeTypes.has(file.type.toLowerCase()) : /\.(?:png|jpe?g|gif|webp)$/i.test(file.name);
  if (!supported) throw new Error('请选择 JPG、PNG、GIF 或 WebP 图片。');
}

/** 新图沿用媒体库的私密默认值。成功后由编辑器决定填入封面或插入正文。 */
export async function uploadArticleImage(api, signal, file) {
  checkImageFile(file);
  const data = new FormData();
  data.append('file', file);
  const image = await api('/admin/media', { method: 'POST', body: data, signal });
  if (image.status === 'READY' && imageMimeTypes.has(image.mime)) return image;

  // 文件实际内容可能与扩展名不符；只清理本次上传产生的记录。
  const reason = '服务器未能将此文件识别为可用的 JPG、PNG、GIF 或 WebP 图片。';
  try {
    await api('/admin/media/' + image.id, { method: 'DELETE' });
  } catch (error) {
    throw new Error(reason + '清理媒体 #' + image.id + ' 失败，可在媒体库检查。' + error.message);
  }
  throw new Error(reason);
}

function referencedMediaIds(coverMediaId, bodyMarkdown) {
  const ids = new Set();
  function add(raw) {
    const id = Number(raw);
    // 接口的 ID 是 JSON 数字。无法精确表示时，绝不能把相邻 ID 的文件公开。
    if (!/^\d+$/.test(String(raw)) || !Number.isSafeInteger(id) || id < 1) {
      throw new Error('文章中的媒体 ID 无效，请检查封面和正文中的 /media/ 地址。');
    }
    ids.add(id);
  }
  if (coverMediaId != null && coverMediaId !== '') add(coverMediaId);
  // 与后端引用校验一致，手写的 Markdown 链接和图片链接都计入。
  for (const match of (bodyMarkdown || '').matchAll(/\/media\/(\d+)/g)) add(match[1]);
  return ids;
}

/** 作者明确公开文章时，先核对整篇文章的引用，再请作者逐项核对将要公开的文件。 */
export async function approvePublicArticleMedia(api, signal, { coverMediaId, bodyMarkdown }) {
  const needed = referencedMediaIds(coverMediaId, bodyMarkdown);
  if (!needed.size) return true;
  const found = new Map();
  const size = 100;
  for (let page = 1; ; page++) {
    const { items, total } = await api('/admin/media?page=' + page + '&size=' + size, { signal });
    if (signal.aborted) return false;
    for (const item of items) {
      if (needed.has(item.id)) found.set(item.id, item);
    }
    if (found.size === needed.size || !items.length || page * size >= total) break;
  }

  const toPublish = [];
  for (const id of needed) {
    const item = found.get(id);
    if (!item || item.status !== 'READY') {
      throw new Error('媒体 #' + id + ' 不存在或尚未就绪，请更换引用后重试。');
    }
    if (item.visibility === 'PRIVATE') toPublish.push(item);
    else if (item.visibility !== 'PUBLIC') throw new Error('媒体 #' + id + ' 的可见性无效。');
  }
  if (!toPublish.length) return true;
  const list = toPublish.map(item => '「' + item.name + '」 #' + item.id).join('\n');
  if (!window.confirm('以下文件目前仅站主可见。公开后，访客可通过文件地址查看。\n\n' + list + '\n\n公开这些文件并继续？')) return false;

  // 单个文件的可见性独立保存。重试时重新读取媒体列表，只处理仍为私密的引用。
  for (const item of toPublish) {
    if (signal.aborted) return false;
    await api('/admin/media/' + item.id + '/visibility', { method: 'PUT', body: { visibility: 'PUBLIC' }, signal });
  }
  return !signal.aborted;
}
