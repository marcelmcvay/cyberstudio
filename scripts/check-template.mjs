// Distribution checks: starter content, media closure, local skills and safe defaults.
import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => readFile(path.join(root, relative), 'utf8');
const { entities } = JSON.parse(await read('workspace/workspace.json'));
const samples = entities.filter(e => e.sample === true);
assert.equal(samples.length, 4, 'The template must retain exactly four sample cards.');
assert.deepEqual(samples.filter(e => e.pinned).map(e => e.title), ['My Dream Game']);
assert.ok(samples.every(e => e.status === 'active'));
assert.deepEqual(samples.map(e => e.category).sort(), ['dev', 'image-gen', 'project', 'research']);
const images = new Set(), videos = new Set(), arachneImages = new Set();
for (const entity of entities) {
  if (entity.defaultStep !== undefined) assert.ok(Number.isInteger(entity.defaultStep) && entity.defaultStep >= 0 && entity.defaultStep < entity.steps.length);
  for (const step of entity.steps) {
    const file = path.join('workspace', entity.folder, step.path);
    const content = await read(file);
    assert.ok(content.trim(), `${file} is empty`);
    assert.doesNotMatch(content, /[\u0400-\u04ff]/u, `${file}: authored sample content must be English`);
    if (!file.endsWith('.html')) continue;
    assert.match(content, /data-mak-report="document"/);
    assert.match(content, /_shared\/report\.js/);
    for (const match of content.matchAll(/\b(?:src|href)="([^"#]+)"/g)) {
      if (/^(?:https?:|data:)/.test(match[1])) continue;
      const target = path.resolve(root, path.dirname(file), decodeURIComponent(match[1].split(/[?#]/)[0]));
      assert.ok(target.startsWith(root + path.sep), 'Asset reference must stay inside the template');
      assert.ok((await stat(target)).isFile(), `${file}: missing ${match[1]}`);
      if (/\.(webp|png)$/.test(target)) images.add(target);
      if (entity.id === 'arachne-character' && /\.webp$/.test(target)) arachneImages.add(target);
      if (/\.mp4$/.test(target)) videos.add(target);
    }
    if (entity.id === 'arachne-character') {
      assert.doesNotMatch(content, /lychee|leech|youtube|Discord|\bpoll\b|publication/i);
      assert.match(content, /<summary>Prompts<\/summary>/, 'Keep the saved generation prompts accessible.');
    }
  }
}
assert.equal(arachneImages.size, 158, 'All Arachne images must be reachable from the tabs.');
assert.equal(videos.size, 8, 'Keep all eight motion studies.');
const skillNames = (await readdir(path.join(root, '.agents/skills'), { withFileTypes: true })).filter(e => e.isDirectory()).map(e => e.name);
assert.equal(skillNames.length, 21);
for (const name of ['game-vfx-workflow', 'game-ui-workflow', 'game-animation-integration', 'game-level-design', 'game-audio-workflow', 'gameplay-visual-review']) {
  assert.ok(skillNames.includes(name), `Missing game production workflow: ${name}`);
}
for (const name of skillNames) {
  const skill = await read(`.agents/skills/${name}/SKILL.md`);
  assert.match(skill, /^---\r?\nname:/);
  const entry = await read(`.claude/skills/${name}/SKILL.md`);
  assert.equal(entry, skill, 'Claude must receive the full maintained skill.');
  assert.doesNotMatch(skill, /[A-Z]:[\\/]Users[\\/]/i, 'Shared skills must not contain a local account path.');
}
// The kit ships its own local Blender connections and nothing else: local stdio
// commands with a pinned package, localhost only, no URLs, headers or secrets.
const KIT_MCP = ['blender', 'blender-strix'];
const { mcpServers = {} } = JSON.parse(await read('.mcp.json'));
for (const [name, server] of Object.entries(mcpServers)) {
  assert.ok(KIT_MCP.includes(name), `.mcp.json: ${name} is not a kit connection. Keep personal servers in user settings.`);
  assert.ok(['uvx', 'bash'].includes(server.command), `.mcp.json: ${name} must be a local command`);
  assert.equal(server.url, undefined, `.mcp.json: ${name} must not point at a remote URL`);
  assert.equal(server.headers, undefined, `.mcp.json: ${name} must not carry headers`);
  const text = JSON.stringify(server);
  assert.match(text, /mcp-for-blender@\d+\.\d+\.\d+/, `.mcp.json: ${name} must pin its package version`);
  assert.doesNotMatch(text, /[\\/](?:Users|home)[\\/]\w|[A-Z]:\\/, `.mcp.json: ${name} must not contain a local account path`);
  for (const [key, value] of Object.entries(server.env || {})) {
    assert.doesNotMatch(key, /KEY|TOKEN|SECRET|PASSWORD/i, `.mcp.json: ${name} must not set ${key}`);
    if (key.endsWith('_HOST')) assert.equal(value, 'localhost', `.mcp.json: ${name} must stay on localhost`);
  }
}
// Plain settings may carry defaults (cap, local Blender port); credentials stay blank.
for (const [, key, value] of (await read('.env.example')).matchAll(/^(\w+)=(.*)$/gm)) {
  if (/KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|AUTH/i.test(key)) assert.equal(value.trim(), '', `.env.example: ${key} must be blank`);
  else assert.doesNotMatch(value, /[\\/](?:Users|home)[\\/]\w|https?:\/\/(?!localhost|127\.0\.0\.1)/, `.env.example: ${key} must not hold a personal path or remote URL`);
}
assert.match(await read('src/desktop/client.ts'), /defaultBypass: false/);
assert.match(await read('desktop/service/server.mjs'), /defaultBypass: false/);
assert.match(await read('desktop/service/sessions.mjs'), /bypass: options\.bypass === true/);
assert.match(await read('desktop/service/sessions.mjs'), /pinned = false, bypass = false/);
const readme = await read('README.md');
assert.match(readme, /Mr\. Mak is small\.\s+<img src="docs\/assets\/mr-mak\.png"[^>]+>\s*$/);
await stat(path.join(root, 'docs/assets/mr-mak.png'));
console.log(`Template passed: four cards, one pin, ${images.size} images, ${videos.size} videos, ${skillNames.length} shared skills, ${Object.keys(mcpServers).length} local kit connections and account placeholders.`);
