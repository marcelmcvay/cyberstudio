import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { intake, normalizeLink, imageSize, kindFor, slug, contentDispositionName } from '../intake.mjs';

const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000030000000208020000', 'hex');

test('share links are rewritten for download and recorded without tokens', () => {
  assert.deepEqual(normalizeLink('https://www.dropbox.com/scl/fi/abc/ref.png?rlkey=k1&st=tok&dl=0'), { link: 'https://www.dropbox.com/scl/fi/abc/ref.png?rlkey=k1&dl=0', download: 'https://www.dropbox.com/scl/fi/abc/ref.png?rlkey=k1&dl=1', provider: 'dropbox', folder: false });
  assert.equal(normalizeLink('https://www.dropbox.com/scl/fo/abc/name?rlkey=k1&dl=0').folder, true);
  assert.equal(normalizeLink('https://drive.google.com/file/d/1AbCdEfGhIjK/view?usp=sharing').download, 'https://drive.google.com/uc?export=download&id=1AbCdEfGhIjK');
  assert.equal(normalizeLink('https://drive.google.com/open?id=1AbCdEfGhIjK').link, 'https://drive.google.com/file/d/1AbCdEfGhIjK/view');
  assert.throws(() => normalizeLink('https://drive.google.com/drive/folders/1AbCdEfGhIjK'), /folder/);
  const web = normalizeLink('https://user:pw@cdn.example.com/a/b.png?X-Amz-Signature=s#frag');
  assert.equal(web.link, 'https://cdn.example.com/a/b.png');
  assert.equal(web.download, 'https://cdn.example.com/a/b.png?X-Amz-Signature=s');
  assert.throws(() => normalizeLink('file:///etc/passwd'), /http/);
});

test('helpers', () => {
  assert.deepEqual(imageSize(png), { width: 3, height: 2, format: 'png' });
  assert.equal(kindFor('x.GLB'), 'mesh'); assert.equal(kindFor('x.mov'), 'video'); assert.equal(kindFor('x.zip'), 'reference');
  assert.equal(slug('Lobby Mood — v2.png'), 'lobby-mood-v2');
  assert.equal(contentDispositionName(`attachment; filename="a b.zip"; filename*=UTF-8''r%C3%A9f.zip`), 'réf.zip');
});

test('intake copies files, dedupes ids and downloads links; HTML answers are rejected', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'intake-test-'));
  const source = path.join(root, 'Ref Shot.png'); await writeFile(source, png);
  const first = await intake({ root, sources: [{ file: source }], from: 'AD team', tags: 'a, b,a' });
  const second = await intake({ root, sources: [{ file: source }] });
  assert.equal(first.id, 'ref-shot'); assert.equal(second.id, 'ref-shot-2');
  assert.deepEqual(first.asset.tags, ['a', 'b']);
  assert.deepEqual(first.asset.image, { width: 3, height: 2, format: 'png' });
  assert.equal(first.asset.provenance.imported_from, 'AD team');
  assert.match(first.asset.files[0].sha256, /^[0-9a-f]{64}$/);
  assert.deepEqual(await readFile(source), png, 'source is copied, not moved');
  const server = http.createServer((request, response) => {
    if (request.url.startsWith('/file')) { response.writeHead(200, { 'Content-Type': 'image/png', 'Content-Disposition': 'attachment; filename="board.png"' }); response.end(png); }
    else if (request.url.startsWith('/sneaky')) { response.writeHead(200, { 'Content-Type': 'application/octet-stream' }); response.end('<!DOCTYPE html><html>Sign in</html>'); }
    else { response.writeHead(200, { 'Content-Type': 'text/html' }); response.end('<html>Sign in</html>'); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const linked = await intake({ root, sources: [{ url: `${base}/file?token=secret` }], title: 'Board' });
    assert.equal(linked.id, 'board');
    assert.equal(linked.asset.provenance.origin, 'link');
    assert.equal(linked.asset.provenance.link, `${base}/file`);
    assert.equal(linked.asset.files[0].path, 'inbox/board/board.png');
    await assert.rejects(intake({ root, sources: [{ url: `${base}/login` }] }), /web page/);
    await assert.rejects(intake({ root, sources: [{ url: `${base}/sneaky` }] }), /web page/);
    await assert.rejects(intake({ root, sources: [{ url: `${base}/file` }], maxLinkBytes: 4 }), /larger than/);
  } finally { server.close(); }
  assert.deepEqual((await readdir(path.join(root, 'inbox'))).sort(), ['board', 'ref-shot', 'ref-shot-2'], 'failed intakes leave no staging folders');
});
