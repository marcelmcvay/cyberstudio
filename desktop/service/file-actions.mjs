import path from 'node:path';
import { randomUUID } from 'node:crypto';

// Only already-authorized content URLs reach the existing native file bridge.
export class FileActions {
  constructor(files, send) { this.files = files; this.send = send; this.available = false; this.pending = new Map(); }
  receive(event) {
    if (event?.type === 'file-actions-available') { this.available = true; return; }
    if (event?.type !== 'file-action-result') return;
    const pending = this.pending.get(event.requestId);
    if (!pending) return;
    clearTimeout(pending.timer); this.pending.delete(event.requestId);
    event.error ? pending.reject(new Error(String(event.error))) : pending.resolve({ status: event.cancelled ? 'cancelled' : pending.action === 'save' ? 'saved' : 'revealed' });
  }
  async request({ url, action }) {
    if (typeof url !== 'string' || url.length > 8192 || !['inspect', 'reveal', 'save'].includes(action)) throw new Error('Choose a valid file action.');
    const { file, info } = await this.files.resolveContentUrl(url);
    if (action === 'inspect') return { name: path.basename(file), location: path.relative(this.files.repo, file), size: info.size,
      native: this.available, revealLabel: process.platform === 'darwin' ? 'Show in Finder' : process.platform === 'win32' ? 'Show in Explorer' : 'Open containing folder' };
    if (!this.available) throw new Error('Native file actions are unavailable. Use Download instead.');
    const requestId = randomUUID();
    return new Promise((resolve, reject) => {
      // A save picker can stay open while the person chooses a destination.
      const timer = setTimeout(() => { this.pending.delete(requestId); reject(new Error('The desktop did not confirm the file action. Check Finder or your save location before trying again.')); }, action === 'save' ? 10 * 60_000 : 15_000);
      this.pending.set(requestId, { resolve, reject, timer, action });
      this.send({ type: action === 'save' ? 'save-copy' : 'reveal', requestId, path: file });
    });
  }
  close() { for (const item of this.pending.values()) { clearTimeout(item.timer); item.reject(new Error('CyberStudio is closing.')); } this.pending.clear(); }
}
