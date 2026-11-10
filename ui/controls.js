// Sidebar controls: sliders with number inputs, checkboxes, loop rate and preset buttons.
// Every change writes to `state` and calls onChange().

import { PRESETS } from '../sim/index.js';
import { state } from './state.js';
import { $, clamp } from './util.js';

const SLIDERS = [
  { key: 'kp', group: 'gains', label: 'Kp', min: 0, max: 10, step: 0.05, hint: '° pitch per ° error' },
  { key: 'ki', group: 'gains', label: 'Ki', min: 0, max: 20, step: 0.1, hint: '° pitch per °·s' },
  { key: 'kd', group: 'gains', label: 'Kd', min: 0, max: 1, step: 0.005, hint: '° pitch per °/s' },
  { key: 'step', group: 'step', label: 'Step size', unit: '°', min: 10, max: 180, step: 1 },
  { key: 'duration', group: 'step', label: 'Duration', unit: 's', min: 1, max: 10, step: 0.5 },
  { key: 'thetaMax', group: 'servo', label: 'θ max', unit: '°', min: 1, max: 45, step: 0.5, hint: 'pitch limit' },
  { key: 'servoTauMs', group: 'servo', label: 'Servo lag τ', unit: 'ms', min: 0, max: 100, step: 1 },
  { key: 'dCutoff', group: 'ctrl', label: 'D filter cutoff', unit: 'Hz', min: 5, max: 250, step: 1 },
  { key: 'noise', group: 'dist', label: 'Gyro noise σ', unit: '°', min: 0, max: 0.2, step: 0.002 },
  { key: 'punchTime', group: 'dist', label: 'Punch at', unit: 's', min: 0.1, max: 4, step: 0.1, hint: 'after the step' },
];
const CHECKBOXES = ['antiWindup', 'dOnError', 'mainTorque', 'punch'];

export function initControls({ onChange }) {
  const controls = {};
  const presetBtns = {};
  const decimals = (s) => (String(s.step).split('.')[1] || '').length;
  const fmt = (key, v) => Number(v).toFixed(decimals(controls[key].spec));

  // ---- sliders
  function buildSlider(s) {
    const row = document.createElement('div');
    row.className = 'slider-row';
    row.innerHTML =
      `<label for="nm-${s.key}">${s.label}${s.unit ? `<span class="unit">${s.unit}</span>` : ''}${s.hint ? `<small>${s.hint}</small>` : ''}</label>` +
      `<input type="number" id="nm-${s.key}" min="${s.min}" max="${s.max}" step="${s.step}">` +
      `<input type="range" id="sl-${s.key}" min="${s.min}" max="${s.max}" step="${s.step}" aria-label="${s.label}">`;
    $('grp-' + s.group).append(row);
    const range = row.querySelector('input[type=range]');
    const num = row.querySelector('input[type=number]');
    controls[s.key] = { range, num, spec: s };
    range.addEventListener('input', () => setValue(s.key, parseFloat(range.value), 'range'));
    num.addEventListener('input', () => {
      const v = parseFloat(num.value);
      if (Number.isFinite(v)) setValue(s.key, clamp(v, +num.min, +num.max), 'num');
    });
    num.addEventListener('change', () => { num.value = fmt(s.key, state[s.key]); });
  }

  function sync(key) {
    const c = controls[key];
    c.range.value = state[key];
    c.num.value = fmt(key, state[key]);
  }

  function setValue(key, v, from) {
    state[key] = v;
    const c = controls[key];
    if (from !== 'range') c.range.value = v;
    if (from !== 'num') c.num.value = fmt(key, v);
    if (key === 'duration') updatePunchRange();
    if (key === 'kp' || key === 'ki' || key === 'kd') markPreset();
    onChange();
  }

  // The punch can't happen after the end of the run.
  function updatePunchRange() {
    const c = controls.punchTime;
    c.range.max = c.num.max = state.duration;
    if (state.punchTime > state.duration) { state.punchTime = state.duration; sync('punchTime'); }
  }

  SLIDERS.forEach(buildSlider);
  Object.keys(controls).forEach(sync);
  updatePunchRange();

  // ---- checkboxes + select
  for (const id of CHECKBOXES) {
    const el = $(id);
    el.checked = state[id];
    el.addEventListener('change', () => { state[id] = el.checked; onChange(); });
  }
  $('loopRate').value = String(state.loopRate);
  $('loopRate').addEventListener('change', (e) => { state.loopRate = +e.target.value; onChange(); });

  // ---- presets
  function applyPreset(p) {
    for (const k of ['kp', 'ki', 'kd']) { state[k] = p[k]; sync(k); }
    if (p.noise !== undefined) { state.noise = p.noise; sync('noise'); }
    markPreset();
    onChange();
  }

  // Highlight the preset matching the current gains and show its description.
  function markPreset() {
    let active = null;
    for (const p of PRESETS) {
      const on = p.kp === state.kp && p.ki === state.ki && p.kd === state.kd;
      presetBtns[p.id].classList.toggle('active', on);
      if (on) active = p;
    }
    $('preset-blurb').textContent = active ? active.blurb : 'Custom gains.';
    $('readout-blurb').textContent = active ? `${active.name}: ${active.blurb}` : '';
  }

  for (const p of PRESETS) {
    const b = document.createElement('button');
    b.className = 'btn';
    b.textContent = p.name;
    b.title = `Kp ${p.kp} · Ki ${p.ki} · Kd ${p.kd}${p.noise ? ` · noise ${p.noise}°` : ''}`;
    b.addEventListener('click', () => applyPreset(p));
    $('presets').append(b);
    presetBtns[p.id] = b;
  }

  return { applyPreset };
}
