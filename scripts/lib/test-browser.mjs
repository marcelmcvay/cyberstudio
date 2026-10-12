// Browser for the UI test scripts. WebKit by default: the desktop app runs in
// WKWebView on macOS, so that is the engine whose behavior matters.
//   MRMAK_TEST_BROWSER=webkit (default) | chromium | firefox | msedge | chrome | <any Chromium channel>
import { chromium, firefox, webkit } from '@playwright/test';

export const testBrowserName = (process.env.MRMAK_TEST_BROWSER || 'webkit').toLowerCase();

export function launchTestBrowser(options = {}) {
  const settings = { headless: true, ...options };
  if (testBrowserName === 'webkit') return webkit.launch(settings);
  if (testBrowserName === 'firefox') return firefox.launch(settings);
  if (testBrowserName === 'chromium') return chromium.launch(settings);
  return chromium.launch({ ...settings, channel: testBrowserName });
}

const chromiumFamily = !['webkit', 'firefox'].includes(testBrowserName);

/** Context permissions only Chromium knows (WebKit rejects clipboard-read/write). */
export function testPermissions(list) {
  return chromiumFamily ? list : [];
}

/*
 * WebKit reports two harmless things as page errors that Chromium keeps quiet:
 * a report frame on the content origin being probed from the UI origin (the
 * theme bridge falls back to postMessage), and a keepalive release call cut off
 * while the page unloads. Only those exact messages are ignored.
 */
// Playwright's WebKit error parser cuts the message at "http:", so the
// patterns match what is left: "/127.0.0.1:<port>...".
const BENIGN_WEBKIT = [
  /^(?:Blocked a frame with origin "http:)?\/\/?127\.0\.0\.1:\d+" from accessing a frame with origin "http:\/\/127\.0\.0\.1:\d+"\. Protocols, domains, and ports must match\.$/,
  /^(?:Fetch API cannot load http:)?\/\/?127\.0\.0\.1:\d+\/api\/live\/release due to access control checks\.$/,
];
export function realPageErrors(messages) {
  return testBrowserName === 'webkit' ? messages.filter(message => !BENIGN_WEBKIT.some(pattern => pattern.test(message))) : messages;
}

/*
 * Headless WebKit has no clipboard permission to grant, so readText() is
 * refused. Outside Chromium, an in-page clipboard stands in: the app's own
 * writeText() calls land in it and the test reads them back.
 */
export async function useTestClipboard(context) {
  if (chromiumFamily) return;
  await context.addInitScript(() => {
    let text = '';
    const clipboard = { writeText: async value => { text = String(value); }, readText: async () => text, write: async () => {}, read: async () => [] };
    Object.defineProperty(navigator, 'clipboard', { configurable: true, get: () => clipboard });
  });
}
