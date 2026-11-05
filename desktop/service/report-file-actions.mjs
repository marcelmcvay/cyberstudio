// Dependency-free so the same controller can run in the UI and isolated reports.
// Reports never receive an API token or a native path bridge.
export function installFileActions(win, options = {}) {
  if (win.__makFileActions) return win.__makFileActions;
  const doc = win.document;
  const approved = new WeakSet();
  const generated = new Map();
  const createObjectURL = win.URL.createObjectURL.bind(win.URL);
  const revokeObjectURL = win.URL.revokeObjectURL.bind(win.URL);
  win.URL.createObjectURL = object => {
    const url = createObjectURL(object);
    if (object instanceof win.Blob) generated.set(url, object);
    return url;
  };
  win.URL.revokeObjectURL = url => { generated.delete(url); revokeObjectURL(url); };
  let active;
  const style = doc.createElement('style');
  style.textContent = `
    .mak-file-action{box-sizing:border-box;position:fixed;inset:0;margin:auto;width:min(440px,calc(100vw - 24px));max-height:calc(100dvh - 24px);overflow:auto;padding:24px;border:1px solid #544a43;border-radius:14px;background:#1c1815;color:#ede6df;font:14px/1.5 system-ui,sans-serif;box-shadow:0 20px 70px #0008;text-align:left}
    .mak-file-action::backdrop{background:#0008}
    .mak-file-action h2{margin:0 0 6px;font:600 19px/1.3 system-ui,sans-serif;color:inherit;overflow-wrap:anywhere}
    .mak-file-action p{margin:8px 0;overflow-wrap:anywhere;color:inherit}
    .mak-file-action .mak-file-location{font-size:12px;opacity:.8;white-space:pre-wrap}
    .mak-file-action .mak-file-buttons{display:flex;flex-wrap:wrap;gap:8px;margin-top:20px}
    .mak-file-action button{border:1px solid #77685c;border-radius:7px;background:transparent;color:inherit;padding:9px 13px;font:500 13px system-ui,sans-serif;cursor:pointer}
    .mak-file-action button.primary{background:#edb1a9;color:#271b18;border-color:#edb1a9}
    .mak-file-action button:disabled{opacity:.5;cursor:wait}
    .mak-file-action [hidden]{display:none!important}
    .mak-file-action button:focus-visible{outline:3px solid #e58171;outline-offset:3px}
    .mak-file-action [role=alert]{color:#ffb8ad}
    [data-workspace-theme=light] .mak-file-action,[data-mrmak-theme=light] .mak-file-action{background:#fffaf5;color:#261f19;border-color:#c5b6a9}
    [data-workspace-theme=light] .mak-file-action [role=alert],[data-mrmak-theme=light] .mak-file-action [role=alert]{color:#a12718}
    .mak-file-feedback{position:fixed;bottom:18px;left:12px;max-width:calc(100vw - 48px);padding:9px 14px;border-radius:8px;background:#27211c;color:#fff5eb;box-shadow:0 3px 20px #0005;z-index:2147483647;font:13px/1.4 system-ui,sans-serif;pointer-events:none}
  `;
  (doc.head || doc.documentElement).append(style);
  const feedback = message => {
    let note = doc.querySelector('.mak-file-feedback');
    if (!note) { note = doc.createElement('div'); note.className = 'mak-file-feedback'; note.setAttribute('role', 'status'); doc.body.append(note); }
    note.textContent = message;
    win.clearTimeout(note.hideTimer); note.hideTimer = win.setTimeout(() => note.remove(), 6000);
  };
  const bridge = (url, name, prepared) => new Promise((resolve, reject) => {
    const id = win.crypto.randomUUID();
    const cleanup = () => { win.clearTimeout(timer); win.removeEventListener('message', receive); };
    const receive = event => {
      if (event.source !== win.parent || event.origin !== options.bridgeOrigin || event.data?.id !== id) return;
      if (event.data.type === 'mrmak:file-fetch') {
        const bytes = prepared || win.fetch(url).then(response => {
          if (!response.ok) throw new Error(`Could not download this file (${response.status}).`);
          return response.blob();
        }).then(blob => ({ blob }), error => ({ error }));
        bytes.then(result => win.parent.postMessage({ type: 'mrmak:file-bytes', id, blob: result.blob, error: result.error?.message }, options.bridgeOrigin));
      } else if (event.data.type === 'mrmak:file-result') {
        cleanup(); event.data.error ? reject(new Error(event.data.error)) : resolve(event.data.result);
      }
    };
    const timer = win.setTimeout(() => { cleanup(); reject(new Error('Workspace did not confirm this action. Check your file location before trying again.')); }, 11 * 60_000);
    win.addEventListener('message', receive);
    win.parent.postMessage({ type: 'mrmak:file-request', id, url, name, action: 'choose' }, options.bridgeOrigin);
  });
  const local = (url, action) => {
    if (options.local) return options.local(url, action);
    return Promise.resolve(null);
  };
  const filename = (url, name) => {
    if (name) return name.split(/[\\/]/).pop();
    if (['blob:', 'data:'].includes(url.protocol)) return 'Generated file';
    try { return decodeURIComponent(url.pathname.split('/').pop()) || 'file'; } catch { return 'file'; }
  };
  const download = async (url, name, prepared, provider) => {
    let object;
    try {
      let blob;
      if (provider) blob = await provider();
      else if (prepared) {
        const result = await prepared;
        if (result.error) throw result.error;
        blob = result.blob;
      } else {
        const response = await win.fetch(url);
        if (!response.ok) throw new Error(`Could not download this file (${response.status}).`);
        blob = await response.blob();
      }
      object = win.URL.createObjectURL(blob);
    } catch (error) {
      // Cross-origin servers may forbid fetch. Leave the explicit browser link
      // available instead of treating an opaque/network failure as a saved file.
      if (new win.URL(url).origin === win.location.origin || ['blob:', 'data:'].includes(new win.URL(url).protocol)) throw error;
      throw new Error('This source could not be downloaded here. Open the original link in your browser to save it.', { cause: error });
    }
    const link = doc.createElement('a'); link.href = object; link.download = name;
    approved.add(link); doc.body.append(link); link.click(); link.remove();
    if (object) win.setTimeout(() => win.URL.revokeObjectURL(object), 30_000);
    return 'Download requested. Check your browser’s downloads or save prompt.';
  };
  const request = (input, name, trigger = doc.activeElement, provider) => {
    if (active) return active;
    const url = new win.URL(input, win.location.href);
    if (!['http:', 'https:', 'blob:', 'data:'].includes(url.protocol)) { feedback('This file link is not supported.'); return Promise.resolve('cancelled'); }
    // Generators often revoke the object URL immediately after link.click().
    // Retain its bytes in memory while the person chooses; do not save anything.
    const prepared = url.protocol === 'blob:' && !provider ? generated.has(url.href)
      ? Promise.resolve({ blob: generated.get(url.href) })
      : win.fetch(url.href).then(response => response.blob()).then(blob => ({ blob }), error => ({ error })) : null;
    // Desktop choices and downloads belong to the UI, outside sandboxed HTML.
    // A report can request a chooser, never a raw reveal or save operation.
    if (options.bridgeOrigin && win.parent !== win) {
      active = bridge(url.href, name, prepared).catch(error => { feedback(error.message); return 'cancelled'; }).finally(() => {
        active = null;
        if (trigger?.isConnected && typeof trigger.focus === 'function') trigger.focus({ preventScroll: true });
      });
      return active;
    }
    active = new Promise(resolve => {
      const dialog = doc.createElement('dialog'); dialog.className = 'mak-file-action'; dialog.setAttribute('aria-label', 'File actions');
      const heading = doc.createElement('h2'); heading.textContent = filename(url, name);
      const context = doc.createElement('p'); context.className = 'mak-file-location';
      let displayPath; try { displayPath = decodeURI(url.pathname); } catch { displayPath = url.pathname; }
      context.textContent = ['blob:', 'data:'].includes(url.protocol) ? 'Generated file in this page' : `${url.origin}${displayPath}`;
      const description = doc.createElement('p'); description.textContent = 'Checking file…';
      const error = doc.createElement('p'); error.setAttribute('role', 'alert');
      const original = doc.createElement('a'); original.textContent = 'Open download link in browser'; original.href = url.href; original.target = '_blank'; original.rel = 'noopener noreferrer'; original.hidden = true;
      original.style.color = 'inherit'; approved.add(original);
      const buttons = doc.createElement('div'); buttons.className = 'mak-file-buttons';
      const reveal = doc.createElement('button'); reveal.type = 'button'; reveal.hidden = true; reveal.className = 'primary';
      const save = doc.createElement('button'); save.type = 'button'; save.textContent = 'Download'; save.disabled = true;
      const cancel = doc.createElement('button'); cancel.type = 'button'; cancel.textContent = 'Cancel';
      buttons.append(reveal, save, cancel); dialog.append(heading, context, description, error, original, buttons); doc.body.append(dialog);
      let metadata, busy = false, finished = false;
      const finish = (result, message) => {
        if (finished) return; finished = true;
        dialog.close(); dialog.remove(); active = null;
        if (trigger?.isConnected && typeof trigger.focus === 'function') trigger.focus({ preventScroll: true });
        feedback(message); resolve(result);
      };
      cancel.onclick = () => finish('cancelled', 'Cancelled. No copy saved.');
      dialog.addEventListener('cancel', event => { event.preventDefault(); if (!busy) cancel.click(); });
      dialog.addEventListener('keydown', event => {
        if (event.key !== 'Tab') return;
        const stops = [...dialog.querySelectorAll('button:not(:disabled),a[href]')].filter(node => !node.hidden && node.getClientRects().length);
        if (!stops.length) return;
        event.preventDefault();
        const current = stops.indexOf(doc.activeElement);
        stops[(current + (event.shiftKey ? stops.length - 1 : 1)) % stops.length].focus();
      });
      const perform = async action => {
        if (busy) return;
        busy = true; reveal.disabled = save.disabled = cancel.disabled = true; error.textContent = '';
        try {
          if (metadata?.native) {
            const result = await local(url.href, action);
            finish(result.status, result.status === 'cancelled' ? 'Cancelled. No copy saved.' : result.status === 'saved' ? 'Copy saved.' : 'File revealed. No copy saved.');
          } else finish('requested', await download(url.href, heading.textContent, prepared, provider));
        } catch (failure) {
          error.textContent = failure.message || 'The file action failed.';
          if (!metadata?.native && url.origin !== win.location.origin && ['http:', 'https:'].includes(url.protocol)) original.hidden = false;
          busy = false; reveal.disabled = save.disabled = cancel.disabled = false; save.focus();
        }
      };
      reveal.onclick = () => { void perform('reveal'); };
      save.onclick = () => { void perform('save'); };
      dialog.showModal(); cancel.focus();
      Promise.resolve(local(url.href, 'inspect')).then(result => {
        if (finished) return;
        metadata = result;
        if (result) { heading.textContent = result.name; context.textContent = result.location; }
        description.textContent = result?.native ? 'This file is already on your computer.' : 'Download a copy of this file?';
        if (result?.native) { reveal.textContent = result.revealLabel; reveal.hidden = false; save.textContent = 'Save a copy…'; }
        else save.className = 'primary';
        save.disabled = false;
        // Do not move focus if the person has already started navigating.
        if (doc.activeElement === cancel) (result?.native ? reveal : save).focus();
      }).catch(failure => {
        if (finished) return;
        description.textContent = 'This file is unavailable.'; error.textContent = failure.message || 'Could not check this file.';
      });
    });
    return active;
  };
  const isDownload = link => {
    if (!link || approved.has(link)) return false;
    let url; try { url = new win.URL(link.href, win.location.href); } catch { return; }
    return link.hasAttribute('download') || link.hasAttribute('data-mak-download') || /\.(zip|7z|tar|tgz|gz|rar)$/i.test(url.pathname);
  };
  const intercept = event => {
    const link = event.target.closest?.('a[href]');
    if (!isDownload(link)) return;
    event.preventDefault(); event.stopImmediatePropagation();
    void request(link.href, link.getAttribute('download') || undefined, link);
  };
  doc.addEventListener('click', intercept, true);
  doc.addEventListener('auxclick', intercept, true);
  const click = win.HTMLAnchorElement.prototype.click;
  win.HTMLAnchorElement.prototype.click = function () {
    if (isDownload(this)) { void request(this.href, this.getAttribute('download') || undefined, this.isConnected ? this : doc.activeElement); return; }
    return click.call(this);
  };
  win.__makFileActions = { request };
  return win.__makFileActions;
}
