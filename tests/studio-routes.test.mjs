import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const server = fileURLToPath(new URL('../server.mjs', import.meta.url));

test('访客页和写作台在前端独立提供，旧页面路径不会转发', { timeout: 12000 }, async t => {
  const service = spawn(process.execPath, [server], {
    env: { ...process.env, HOST: '127.0.0.1', PORT: '0' },
    windowsHide: true, stdio: ['ignore', 'pipe', 'inherit']
  });
  const exited = once(service, 'exit');
  t.after(async () => {
    if (service.exitCode === null && !service.signalCode) service.kill();
    await exited;
  });
  const lines = createInterface({ input: service.stdout });
  const [banner] = await Promise.race([
    once(lines, 'line'), exited.then(() => { throw new Error('前端未能监听测试端口'); })
  ]);
  lines.close();
  const address = banner.match(/http:\/\/127\.0\.0\.1:\d+\//)?.[0];
  assert.ok(address, banner);
  const studio = await readFile(new URL('../public/studio.html', import.meta.url), 'utf8');
  const home = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  for (const route of ['/admin', '/admin/', '/admin/index.html', '/admin/articles/new',
    '/admin/articles/18', '/admin/tools/2', '/admin/projects?page=2', '/admin/categories', '/admin/media', '/admin/settings']) {
    const response = await fetch(new URL(route, address));
    assert.equal(response.status, 200, route);
    assert.equal(await response.text(), studio, route);
  }
  assert.equal(await (await fetch(address)).text(), home);
  for (const route of ['/admin/admin.js', '/admin/admin.css', '/admin/unknown', '/missing-asset.css']) {
    const response = await fetch(new URL(route, address));
    assert.equal(response.status, 404, route);
    assert.equal((await response.json()).detail, '找不到这个页面或文件。');
  }
  const write = await fetch(new URL('/admin/', address), { method: 'POST' });
  assert.equal(write.status, 405);
  assert.equal(write.headers.get('allow'), 'GET, HEAD');
});
