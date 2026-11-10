// Sidebar controls: sliders with number inputs, checkboxes, pilot-input scenario
// and preset buttons. Every change writes to `state` and calls onChange().
// Keys like 'rf.P' address the Rotorflight yaw profile (see state.js).

import { PRESETS, RF_YAW_DEFAULTS, RF_YAW_LIMITS } from '../sim/index.js';
import { state, getValue, setStateValue } from './state.js';
import { $, clamp } from './util.js';

// `show` decides visibility (default: always).
//
// Rotorflight values use exactly the ranges Rotorflight accepts, as whole numbers
// (RF_YAW_LIMITS in sim/rotorflight/yawPid.js).
const rf = (k) => ({ min: RF_YAW_LIMITS[k][0], max: RF_YAW_LIMITS[k][1] });
const SLIDERS = [
  // Rotorflight gains (Rotorflight units). P/I/D/F/B: 0..PID_GAIN_MAX (1000).
  { key: 'rf.P', group: 'rfgains', label: 'P', ...rf('P'), step: 1, hint: 'rate error (damping)' },
  { key: 'rf.I', group: 'rfgains', label: 'I', ...rf('I'), step: 1, hint: 'heading hold' },
  { key: 'rf.D', group: 'rfgains', label: 'D', ...rf('D'), step: 1, hint: 'yaw acceleration' },
  { key: 'rf.F', group: 'rfgains', label: 'F', ...rf('F'), step: 1, hint: 'stick feedforward' },
  { key: 'rf.B', group: 'rfgains', label: 'B', ...rf('B'), step: 1, hint: 'stick-rate boost' },
  { key: 'rf.cwStopGain', group: 'rfgains', label: 'CW stop gain', unit: '%', ...rf('cwStopGain'), step: 1, hint: 'tail pushing nose right' },
  { key: 'rf.ccwStopGain', group: 'rfgains', label: 'CCW stop gain', unit: '%', ...rf('ccwStopGain'), step: 1, hint: 'tail pushing nose left' },
  { key: 'rf.collectiveFF', group: 'rfgains', label: 'Collective FF', ...rf('collectiveFF'), step: 1, hint: 'torque precomp' },
  // Cutoffs: 0 = filter off (D/B cutoff 0 also switches that term off, as in the firmware).
  { key: 'rf.gyroCutoff', group: 'rfadv', label: 'Gyro cutoff', unit: 'Hz', ...rf('gyroCutoff'), step: 1, hint: '0 = off' },
  { key: 'rf.dtermCutoff', group: 'rfadv', label: 'D cutoff', unit: 'Hz', ...rf('dtermCutoff'), step: 1, hint: '0 = D off' },
  { key: 'rf.btermCutoff', group: 'rfadv', label: 'B cutoff', unit: 'Hz', ...rf('btermCutoff'), step: 1, hint: '0 = B off' },
  // iterm_relax_level is CLI-only; the firmware clamps it to 10..250.
  { key: 'rf.itermRelaxLevel', group: 'rfadv', label: 'I relax level', unit: '°/s', ...rf('itermRelaxLevel'), step: 1, hint: 'CLI only' },
  { key: 'rf.itermRelaxCutoff', group: 'rfadv', label: 'I relax cutoff', unit: 'Hz', ...rf('itermRelaxCutoff'), step: 1 },
  { key: 'rf.errorLimit', group: 'rfadv', label: 'Error limit', unit: '°', ...rf('errorLimit'), step: 1 },
  // error_decay_time_yaw is CLI-only.
  { key: 'rf.errorDecayTime', group: 'rfadv', label: 'Error decay time', unit: '×0.1 s', ...rf('errorDecayTime'), step: 1, hint: '0 = off · CLI only' },
  { key: 'rf.precompCutoff', group: 'rfadv', label: 'Precomp cutoff', unit: 'Hz', ...rf('precompCutoff'), step: 1, hint: '0 = off' },

  // pilot input
  { key: 'step', group: 'step', label: 'Yaw angle', unit: '°', min: 10, max: 180, step: 1, show: () => state.scenario === 'flick' },
  { key: 'flickRate', group: 'step', label: 'Stick rate', unit: '°/s', min: 30, max: 720, step: 10, show: () => state.scenario === 'flick' },
  { key: 'pilotLead', group: 'step', label: 'Let go early', unit: 's', min: 0, max: 0.3, step: 0.01, hint: 'pilot anticipation', show: () => state.scenario === 'flick' },
  { key: 'piroRate', group: 'step', label: 'Piro rate', unit: '°/s', min: -720, max: 720, step: 10, hint: '− = nose left', show: () => state.scenario === 'piro' },
  { key: 'piroTime', group: 'step', label: 'Piro time', unit: 's', min: 0.2, max: 4, step: 0.1, show: () => state.scenario === 'piro' },
  { key: 'duration', group: 'step', label: 'Duration', unit: 's', min: 1, max: 10, step: 0.5 },

  // heli
  { key: 'thetaMax', group: 'servo', label: 'θ max', unit: '°', min: 1, max: 45, step: 0.5, hint: 'pitch limit' },
  { key: 'servoTauMs', group: 'servo', label: 'Servo lag τ', unit: 'ms', min: 0, max: 100, step: 1 },
  { key: 'rateNoise', group: 'dist', label: 'Gyro noise σ', unit: '°/s', min: 0, max: 20, step: 0.5, hint: 'on yaw rate' },
  { key: 'punchTime', group: 'dist', label: 'Punch at', unit: 's', min: 0.1, max: 4, step: 0.1, hint: 'after t = 0', show: () => state.punch },
];
const CHECKBOXES = ['mainTorque', 'punch', 'rf.itermRelax'];

const SCENARIO_BLURB = {
  flick: 'Turn by the yaw angle: the pilot holds the yaw stick at the stick rate and centres it a little early (heading + rate × "let go early" reaches the angle) to allow for the stop.',
  piro: 'Pirouette: the yaw stick is held at the piro rate, then centred. Watch the stop: drift-on, bounce-back, stop time.',
};

export function initControls({ onChange }) {
  const controls = {};
  const decimals = (s) => (String(s.step).split('.')[1] || '').length;
  const fmt = (key, v) => Number(v).toFixed(decimals(controls[key].spec));
  // Round to the slider step (whole numbers for every Rotorflight value).
  const snap = (v, s) => +(s.min + Math.round((v - s.min) / s.step) * s.step).toFixed(decimals(s));

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
    controls[s.key] = { range, num, row, spec: s };
    range.addEventListener('input', () => setValue(s.key, parseFloat(range.value), 'range'));
    num.addEventListener('input', () => {
      const v = parseFloat(num.value);
      if (Number.isFinite(v)) setValue(s.key, snap(clamp(v, +num.min, +num.max), s), 'num');
    });
    num.addEventListener('change', () => { num.value = fmt(s.key, getValue(s.key)); });
  }

  function sync(key) {
    const c = controls[key];
    c.range.value = getValue(key);
    c.num.value = fmt(key, getValue(key));
  }

  function setValue(key, v, from) {
    setStateValue(key, v);
    const c = controls[key];
    if (from !== 'range') c.range.value = v;
    if (from !== 'num') c.num.value = fmt(key, v);
    if (key === 'duration') updatePunchRange();
    markPreset();
    onChange();
  }

  // The punch can't happen after the end of the run.
  function updatePunchRange() {
    const c = controls.punchTime;
    c.range.max = c.num.max = state.duration;
    if (state.punchTime > state.duration) { state.punchTime = state.duration; sync('punchTime'); }
  }

  SLIDERS.forEach(buildSlider);

  // ---- checkboxes
  const checkboxes = {};
  for (const id of CHECKBOXES) {
    const el = $(id);
    checkboxes[id] = el;
    el.addEventListener('change', () => { setStateValue(id, el.checked); markPreset(); refresh(); onChange(); });
  }
  $('loopRate').addEventListener('change', (e) => { state.loopRate = +e.target.value; onChange(); });

  // ---- scenario
  const scenarioBtns = [...$('scenario').querySelectorAll('.seg-btn')];
  scenarioBtns.forEach((b) => b.addEventListener('click', () => {
    state.scenario = b.dataset.scenario;
    refresh();
    onChange();
  }));

  // ---- presets
  const presetBtns = new Map();

  function applyPreset(p) {
    state.rf = { ...RF_YAW_DEFAULTS, ...p.rf };
    // Presets never change the pilot input; `p.scenario` only records what the description refers to.
    if (p.rateNoise !== undefined) state.rateNoise = p.rateNoise;
    if (p.punch !== undefined) state.punch = p.punch;
    refresh();
    onChange();
  }

  const matches = (p) => Object.keys(RF_YAW_DEFAULTS).every((k) => p.rf[k] === state.rf[k]);

  // Highlight the preset matching the current gains and show its description.
  function markPreset() {
    let active = null;
    for (const [p, b] of presetBtns) {
      const on = matches(p);
      b.classList.toggle('active', on);
      if (on) active = p;
    }
    $('preset-blurb').textContent = active ? active.blurb : 'Custom gains.';
    $('readout-blurb').textContent = active ? `${active.name}: ${active.blurb}` : '';
  }

  for (const p of PRESETS) {
    const b = document.createElement('button');
    b.className = 'btn';
    b.textContent = p.name;
    b.title = `P ${p.rf.P} · I ${p.rf.I} · D ${p.rf.D} · stop ${p.rf.cwStopGain}/${p.rf.ccwStopGain} · coll FF ${p.rf.collectiveFF}`;
    b.addEventListener('click', () => applyPreset(p));
    $('presets').append(b);
    presetBtns.set(p, b);
  }

  // ---- bring every control in line with `state`
  function refresh() {
    for (const key in controls) {
      sync(key);
      const show = controls[key].spec.show;
      controls[key].row.hidden = show ? !show() : false;
    }
    for (const id in checkboxes) checkboxes[id].checked = getValue(id);
    $('loopRate').value = String(state.loopRate);
    for (const b of scenarioBtns) b.classList.toggle('active', b.dataset.scenario === state.scenario);
    $('scenario-blurb').textContent = SCENARIO_BLURB[state.scenario];
    updatePunchRange();
    markPreset();
  }

  refresh();

  return { applyPreset, refresh };
}
