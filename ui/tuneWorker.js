// Runs the gain search off the main thread so the page stays responsive.
import { searchGains } from '../sim/tune.js';

self.onmessage = (e) => {
  try {
    const result = searchGains({ ...e.data, onProgress: (p) => self.postMessage({ type: 'progress', ...p }) });
    self.postMessage({ type: 'done', result });
  } catch (err) {
    self.postMessage({ type: 'error', message: String(err && err.message || err) });
  }
};
