// "Pin this run": up to 4 frozen heading traces, each keeping its colour slot until removed.

import { T, PIN_SLOTS, withAlpha } from './theme.js';
import { $ } from './util.js';

/**
 * @param opts { snapshot() -> { label, data }, onChange() }
 * @returns { pins, render() }   pins is a 4-slot array (null = empty slot)
 */
export function createPins({ snapshot, onChange }) {
  const pins = PIN_SLOTS.map(() => null);
  const pinBtn = $('pin');
  const list = $('pinList');

  function render() {
    list.innerHTML = '';
    pins.forEach((p, j) => {
      if (!p) return;
      const li = document.createElement('li');
      li.innerHTML = `<span class="sw" style="background:${withAlpha(T[PIN_SLOTS[j]], 0.75)}"></span><span class="txt"></span><button title="Remove pin" aria-label="Remove pin">×</button>`;
      li.querySelector('.txt').textContent = p.label;
      li.querySelector('button').addEventListener('click', () => { pins[j] = null; changed(); });
      list.append(li);
    });
    const full = pins.every(Boolean);
    pinBtn.disabled = full;
    pinBtn.title = full ? 'Maximum of 4 pins. Remove one or clear pins.' : 'Freeze the current heading trace for comparison';
  }

  function changed() { render(); onChange(); }

  pinBtn.addEventListener('click', () => {
    const j = pins.indexOf(null);
    if (j < 0) return;
    pins[j] = snapshot();
    changed();
  });
  $('clearPins').addEventListener('click', () => { pins.fill(null); changed(); });

  return { pins, render };
}
