// Isolated desktop Workspace: synthetic cards, mocked reads, no service or sessions.
import { createServer } from 'vite';
import { launchTestBrowser, realPageErrors } from './lib/test-browser.mjs';
import assert from 'node:assert/strict';
import { expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const evidence = process.env.TRAY_FILTER_EVIDENCE || '/tmp/cyberstudio-tray-filter';
const baseline = process.argv.includes('--baseline');
const today = new Date().toISOString().slice(0, 10);
const card = (id, title, category, names, extra = {}) => ({
  id, title, category, description: `${title} study`, type: 'standalone',
  created: today, folder: id, status: 'active',
  steps: names.map(name => ({ name, path: `${name.toLowerCase().replaceAll(' ', '-')}.html` })), ...extra,
});
const fixture = {
  views: [
    { id: 'references', label: 'References', steps: ['References', 'Image generations'] },
    { id: 'real', label: 'Real world', steps: ['Real world'] },
    { id: 'models', label: '3D', viewer: 'compare3d' },
    { id: 'empty', label: 'Motion', steps: ['Motion'] },
  ],
  entities: [
    card('hub', 'Project hub', 'planning', ['Overview', 'Plan'], { pinned: true }),
    card('alpha', 'Alpha machine', 'machines', ['Overview', 'References', 'Real world', 'Image generations']),
    card('beta', 'Beta machine', 'machines', ['Overview']),
    card('gamma', 'Gamma room', 'rooms', ['Overview', 'Real world']),
    card('delta', 'Delta sketch', 'drawings', ['Overview', 'Image generations']),
    card('model', 'Model study', 'machines', ['Overview', 'Model'], {
      steps: [{ name: 'Overview', path: 'overview.html' }, { name: 'Model', path: 'model.json', viewer: 'compare3d' }],
    }),
    card('archived', 'Archived reference', 'machines', ['Overview', 'References'], { status: 'archived' }),
    card('old', 'Older reference', 'machines', ['Overview', 'References'], { created: '2000-01-01' }),
  ],
  navigation: { id: 'fixture', label: 'Project destinations', groups: [
    { label: 'Planning', links: [{ label: 'Project overview', entity: 'hub', step: 'Overview' }] },
    { label: 'Studies', links: [
      { label: 'Alpha overview', entity: 'alpha', step: 'Overview' },
      { label: 'Alpha references', entity: 'alpha', step: 'References' },
      { label: 'Alpha generations', entity: 'alpha', step: 'Image generations' },
      { label: 'Open Alpha', entity: 'alpha' },
      { label: 'Beta overview', entity: 'beta', step: 'Overview' },
      { label: 'Gamma sources', entity: 'gamma', step: 'Real world' },
      { label: 'Archived sources', entity: 'archived', step: 'References' },
      { label: 'Older sources', entity: 'old', step: 'References' },
      { label: 'Broken tab', entity: 'alpha', step: 'Missing' },
      { label: 'Broken card', entity: 'missing', step: 'Overview' },
    ] },
  ] },
};
const root = path.resolve(import.meta.dirname, '..');
const server = await createServer({
  root, publicDir: false,
  server: { host: '127.0.0.1', port: 0, open: false, watch: null, hmr: false },
  plugins: [{ name: 'isolated-tray-fixture', configureServer(vite) {
    vite.middlewares.use(async (req, res, next) => {
      if (!req.url?.startsWith('/__tray-test')) return next();
      const html = await vite.transformIndexHtml(req.url, `<!doctype html><html><head></head>
        <body><div id="root" class="desktop-root workspace-root"><div class="workspace-surface" id="app"></div></div>
        <script type="module">
          import React from 'react';
          import { createRoot } from 'react-dom/client';
          import App from '/src/App.tsx';
          import WorkspaceTheme from '/src/components/WorkspaceTheme.tsx';
          import '/src/styles/tokens.css'; import '/src/styles/global.css';
          import '/src/styles/workspace-theme.css'; import '/src/desktop/desktop.css';
          createRoot(document.getElementById('app')).render(React.createElement(React.Fragment, null,
            React.createElement(WorkspaceTheme), React.createElement(App)));
        </script></body></html>`);
      res.setHeader('Content-Type', 'text/html'); res.end(html);
    });
  } }],
});
let browser;
const results = [];
try {
  await mkdir(evidence, { recursive: true });
  await server.listen();
  const url = `${server.resolvedUrls.local[0]}__tray-test?desktop=1`;
  browser = await launchTestBrowser();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  page.setDefaultTimeout(10000);
  const errors = [];
  const requests = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.route('**/api/**', async route => {
    const request = route.request();
    requests.push({ method: request.method(), path: new URL(request.url()).pathname });
    assert.equal(request.method(), 'GET', 'The fixture must never write to a service');
    if (new URL(request.url()).pathname === '/api/workspace') return route.fulfill({ json: fixture });
    if (new URL(request.url()).pathname === '/api/assets') return route.fulfill({ json: { assets: [] } });
    throw new Error(`Unexpected API read: ${request.url()}`);
  });
  await page.route('**/workspace/**', route => route.fulfill({ contentType: 'text/html', body:
    '<!doctype html><html><body><h1>Synthetic document</h1><p>Selected document stays open.</p></body></html>' }));
  const cards = page.getByRole('navigation', { name: 'Workspace cards', exact: true });
  const nav = page.getByRole('navigation', { name: 'Project destinations', exact: true });
  const views = page.getByRole('group', { name: 'Menu view', exact: true });
  const search = page.getByRole('textbox', { name: 'Search entities', exact: true });
  const choose = label => views.getByRole('button', { name: new RegExp(`^${label}(?:\\s|$)`) }).click();
  const snapshot = async () => ({
    cards: await cards.locator('a').allTextContents(),
    destinations: await nav.locator('a').allTextContents(),
    missing: await cards.locator('.missing').count(),
    hash: await page.evaluate(() => location.hash),
  });
  await page.goto(`${url}#/hub/1`);
  await page.locator('.report-document[aria-busy=false]').waitFor();
  await choose('References');
  if (baseline) {
    const references = await snapshot();
    await search.fill('Delta');
    const searched = await snapshot();
    await page.screenshot({ path: path.join(evidence, 'before-search.png') });
    await writeFile(path.join(evidence, 'before.json'), JSON.stringify({ references, searched, errors }, null, 2));
    console.log(JSON.stringify({ references, searched, errors }, null, 2));
  } else {
    const hrefs = locator => locator.locator('a').evaluateAll(links => links.map(link => link.getAttribute('href')).sort());
    const expectCards = async expected => assert.deepEqual(await hrefs(cards), expected.sort());
    const expectDestinations = async expected => assert.deepEqual(await nav.locator('a').allTextContents(), expected);
    const preserveDocument = async () => {
      assert.equal(await page.evaluate(() => location.hash), '#/hub/1');
      await expect(page.getByRole('tab', { name: 'Plan', exact: true })).toHaveAttribute('aria-selected', 'true');
      await expect(page.locator('iframe.report-frame')).toHaveAttribute('data-preserved', 'yes');
    };
    for (const theme of ['dark', 'light']) {
      for (const width of [1440, 900, 390]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(`${url}#/hub/1`);
        await page.locator('.report-document[aria-busy=false]').waitFor();
        await page.evaluate(theme => document.documentElement.dataset.workspaceTheme = theme, theme);
        if (await page.locator('.app-layout.sidebar-collapsed').count()) await page.getByRole('button', { name: 'Show menu', exact: true }).click();
        await page.locator('iframe.report-frame').evaluate(frame => frame.dataset.preserved = 'yes');

        await choose('All areas');
        assert.equal(await cards.locator('a').count(), 6, 'All areas restores pinned and unpinned cards');
        // Project links and views reach cards past the 7-day fold; only hand-archived work drops out.
        await expectDestinations(['Project overview', 'Alpha overview', 'Alpha references', 'Alpha generations', 'Open Alpha', 'Beta overview', 'Gamma sources', 'Older sources']);
        await choose('References');
        await expectCards(['#/alpha/1', '#/delta/1', '#/old/1']);
        await expectDestinations(['Alpha references', 'Alpha generations', 'Open Alpha', 'Older sources']);
        assert.equal(await nav.getByText('Planning', { exact: true }).count(), 0, 'Empty quick-link groups are omitted');
        assert.equal(await cards.locator('.missing').count(), 0);
        assert.equal(await cards.getByText('rooms', { exact: true }).count(), 0);
        await expect(views.getByRole('button', { name: /^References/ })).toHaveText('References3');
        await expect(nav.getByRole('link', { name: 'Open Alpha', exact: true })).toHaveAttribute('href', '#/alpha/1');
        await expect(nav.getByRole('link', { name: 'Alpha generations', exact: true })).toHaveAttribute('href', '#/alpha/3');
        await preserveDocument();
        await page.screenshot({ path: path.join(evidence, `${theme}-${width}-references.png`) });

        // Search intersects the current view, including its quick links.
        await search.fill('Delta');
        await expectCards(['#/delta/1']);
        await expect(nav).toHaveCount(0);
        await choose('Real world');
        await expectCards([]);
        await expect(page.locator('.sidebar-empty')).toContainText('No matches in Real world for “Delta”');
        await expect(search).toHaveValue('Delta');
        await page.locator('.sidebar-empty').getByRole('button', { name: 'Clear search', exact: true }).click();
        await expectCards(['#/alpha/2', '#/gamma/1']);
        await expectDestinations(['Open Alpha', 'Gamma sources']);
        await choose('3D');
        await expectCards(['#/model/1']);
        await expect(nav).toHaveCount(0);
        await choose('Motion');
        await expectCards([]);
        await expect(page.locator('.sidebar-empty')).toContainText('No cards in Motion');
        await page.screenshot({ path: path.join(evidence, `${theme}-${width}-empty.png`) });
        await page.locator('.sidebar-empty').getByRole('button', { name: 'Show all areas', exact: true }).click();
        assert.equal(await cards.locator('a').count(), 6);
        await search.fill('Alpha');
        await expectCards(['#/alpha']);
        await choose('References');
        await expectCards(['#/alpha/1']);
        await choose('All areas');
        await expectCards(['#/alpha']);
        await expect(search).toHaveValue('Alpha');
        await search.press('Escape');
        assert.equal(await cards.locator('a').count(), 6);
        await preserveDocument();

        // Archived-search and archive toggles retain their existing behavior.
        await search.fill('Archived');
        await expectCards(['#/archived']);
        await choose('References');
        await expectCards([]); // Review views continue to exclude archived work.
        await choose('All areas');
        await page.getByRole('button', { name: 'Clear search', exact: true }).click();
        await page.getByRole('button', { name: /Show archive/ }).click();
        assert.equal(await cards.locator('a').count(), 8);
        await expect(nav.getByRole('link', { name: 'Older sources', exact: true })).toHaveCount(1);
        await page.getByRole('button', { name: /Hide archive/ }).click();
        assert.equal(await cards.locator('a').count(), 6);
        await expect(nav.getByRole('link', { name: 'Older sources', exact: true })).toHaveCount(1);
        await expect(nav.getByRole('link', { name: 'Archived sources', exact: true })).toHaveCount(0);
        await preserveDocument();

        // Filter controls fit the tray at both sides of the desktop breakpoint.
        const layout = await page.evaluate(() => {
          const sidebar = document.querySelector('.sidebar');
          const buttons = [...document.querySelectorAll('.sidebar-views button')];
          const bounds = sidebar.getBoundingClientRect();
          return { theme: document.documentElement.dataset.workspaceTheme,
            sidebar: { left: bounds.left, right: bounds.right, width: bounds.width },
            overflow: document.documentElement.scrollWidth > innerWidth,
            buttonsFit: buttons.every(button => {
              const box = button.getBoundingClientRect();
              return box.left >= bounds.left && box.right <= bounds.right && button.scrollWidth <= button.clientWidth;
            }),
            position: getComputedStyle(sidebar).position,
            background: getComputedStyle(sidebar).backgroundColor,
          };
        });
        assert.equal(layout.overflow, false);
        assert.equal(layout.buttonsFit, true);
        assert.equal(layout.position, width >= 1000 ? 'relative' : 'absolute');
        assert.ok(layout.sidebar.left >= 0 && layout.sidebar.right <= width);
        results.push({ theme, width, layout, status: 'passed' });
      }
    }

    // Navigation opens the intended view tab, marks it active, and survives back.
    await page.setViewportSize({ width: 1440, height: 900 });
    await choose('References');
    await nav.getByRole('link', { name: 'Alpha generations', exact: true }).click();
    await expect(page.getByRole('tab', { name: 'Image generations', exact: true })).toHaveAttribute('aria-selected', 'true');
    await expect(nav.getByRole('link', { name: 'Alpha generations', exact: true })).toHaveAttribute('aria-current', 'page');
    await page.goBack();
    await expect(page.getByRole('tab', { name: 'Plan', exact: true })).toHaveAttribute('aria-selected', 'true');
    await cards.locator('a[href="#/alpha/1"]').click();
    await expect(page.getByRole('tab', { name: 'References', exact: true })).toHaveAttribute('aria-selected', 'true');
    await page.reload();
    await expect(views.getByRole('button', { name: /^References/ })).toHaveAttribute('aria-pressed', 'true');
    await expectCards(['#/alpha/1', '#/delta/1', '#/old/1']);
    await page.getByRole('button', { name: 'Workspace', exact: true }).click();
    await expect(page.locator('.home-title')).toHaveText('References');
    await expect(page.locator('.view-missing')).toContainText(['Beta machine', 'Gamma room']);
    await expect(cards.locator('.missing')).toHaveCount(0);

    // Projects without custom views/navigation still have normal search and archive.
    const normal = { entities: fixture.entities };
    await page.route('**/api/workspace', route => route.fulfill({ json: normal }));
    await page.reload();
    await page.getByRole('button', { name: 'Show menu', exact: true }).click();
    await expect(views).toHaveCount(0);
    await expect(nav).toHaveCount(0);
    assert.equal(await cards.locator('a').count(), 6);
    await search.fill('Delta');
    await expectCards(['#/delta']);
    await search.fill('no-such-card');
    await expectCards([]);
    await page.locator('.sidebar-empty').getByRole('button', { name: 'Clear search', exact: true }).click();
    assert.equal(await cards.locator('a').count(), 6);
    assert.deepEqual(realPageErrors(errors), []);
    await writeFile(path.join(evidence, 'verification.json'), JSON.stringify({
      fixture: 'synthetic only; no project content or active service', results,
      checks: ['views and exact destination tabs', 'search intersection and clear', 'All areas reset',
        'empty states', 'selected iframe retained', 'archive and pinned cards', 'navigation/back',
        'view persistence', 'home progress gallery retained', 'no custom views/navigation', 'layout fit'],
      errors: realPageErrors(errors), requests,
    }, null, 2));
    console.log(`Tray filtering passed: ${results.length} theme/width combinations, navigation, search, archive, persistence and home gallery. Evidence: ${evidence}`);
  }
} finally {
  await browser?.close();
  await server.close();
}
