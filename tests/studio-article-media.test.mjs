import assert from 'node:assert/strict';
import test from 'node:test';
import { approvePublicArticleMedia, uploadArticleImage } from '../public/studio-article-media.js';

const signal = new AbortController().signal;

function file(parts, filename, type = '') {
  const data = new FormData();
  data.set('file', new Blob(parts, { type }), filename);
  return data.get('file');
}

test('文章没有本地媒体引用时可以直接继续', async () => {
  for (const bodyMarkdown of ['', '![远程图片](https://example.org/photo.jpg)', '普通文字 /media/abc']) {
    assert.equal(await approvePublicArticleMedia(fetch, signal, { coverMediaId: null, bodyMarkdown }), true);
  }
});

test('封面和正文的无效或不精确 ID 在读取资产之前报错', async () => {
  for (const content of [
    { coverMediaId: -1 },
    { coverMediaId: 'xyz' },
    { coverMediaId: null, bodyMarkdown: '/media/0' },
    { coverMediaId: 3, bodyMarkdown: '![图](/media/9007199254740993)' }
  ]) {
    await assert.rejects(approvePublicArticleMedia(fetch, signal, content), /媒体 ID 无效/);
  }
});

test('空图片和超过 25 MiB 的文件在上传前报错', async () => {
  const empty = file([], 'empty.jpg', 'image/jpeg');
  const large = file([new Uint8Array(25 * 1024 * 1024 + 1)], 'large.jpg', 'image/jpeg');
  await assert.rejects(uploadArticleImage(fetch, signal, empty), /有内容的图片/);
  await assert.rejects(uploadArticleImage(fetch, signal, large), /超过 25 MB/);
});

test('拒绝不受支持的 MIME，MIME 缺失时检查文件扩展名', async () => {
  const unsupported = file(['<svg/>'], 'renamed.png', 'image/svg+xml');
  const unknown = file(['opaque'], 'image.dat');
  await assert.rejects(uploadArticleImage(fetch, signal, unsupported), /请选择 JPG/);
  await assert.rejects(uploadArticleImage(fetch, signal, unknown), /请选择 JPG/);
});
