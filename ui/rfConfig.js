// "Your Rotorflight config" panel: load a CLI diff/dump (file or paste), pick the
// PID and rate profile, and apply its yaw PID values and yaw rates to the sim.
// The text and the profile choices are kept in localStorage, so the config is
// re-applied on the next visit (slider tweaks made after loading are not kept).

import { parseRotorflightCli, profileChoices, yawConfigFromCli, maxYawRate, yawRatesDisplay, RF_YAW_DEFAULTS } from '../sim/index.js';
import { state, PILOT_DEFAULTS } from './state.js';
import { $ } from './util.js';

const STORE_KEY = 'heli-yaw-sim.rotorflight-config.v1';

function readStore() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY)) || null; } catch { return null; }
}
function writeStore(v) {
  try {
    if (v) localStorage.setItem(STORE_KEY, JSON.stringify(v));
    else localStorage.removeItem(STORE_KEY);
    return true;
  } catch { return false; }
}

// Only the lines the parser reads, so a large `dump all` fits comfortably in storage.
const keepLines = (text) => String(text).split(/\r?\n/)
  .filter((l) => /^\s*(set\s|profile\s|rateprofile\s|#\s*rotorflight)/i.test(l)).join('\n');

// Rate type names as the configurator's Rates tab lists them.
const RATE_LABEL = { NONE: 'None', BETAFLIGHT: 'Betaflight', RACEFLIGHT: 'Raceflight', KISS: 'KISS', ACTUAL: 'Actual', QUICK: 'QuickRates', ROTORFLIGHT: 'Rotorflight' };

/**
 * @param controls   the initControls() API ({ refresh, setStickRange })
 * @param onChange   re-run the simulation
 * @returns { loaded() }  the applied config ({ rf, label }) or null
 */
export function initRfConfig({ controls, onChange }) {
  let current = null; // { text, fileName, pid, rate, parsed, cfg }

  const showError = (msg) => { $('cfgError').hidden = !msg; $('cfgError').textContent = msg || ''; };

  function fillSelect(sel, indices, active, names) {
    sel.innerHTML = indices.map((i) => {
      const nm = names[i] ? ` · ${names[i]}` : '';
      return `<option value="${i}"${i === active ? ' selected' : ''}>${i + 1}${nm}${i === active ? ' (active)' : ''}</option>`;
    }).join('');
  }

  function render() {
    $('cfgLoaded').hidden = !current;
    if (!current) return;
    const { parsed, cfg, fileName } = current;
    const ch = profileChoices(parsed);
    const craft = parsed.master.name;
    $('cfgTitle').textContent = [craft || fileName || 'Pasted config', parsed.version && `Rotorflight ${parsed.version}`]
      .filter(Boolean).join(' · ');

    const pidNames = Object.fromEntries(ch.pid.map((i) => [i, parsed.profiles[i].profile_name]));
    const rateNames = Object.fromEntries(ch.rate.map((i) => [i, parsed.rateProfiles[i].rateprofile_name]));
    $('cfgPidRow').hidden = ch.pid.length < 2;
    $('cfgRateRow').hidden = ch.rate.length < 2;
    fillSelect($('cfgPid'), ch.pid, ch.activePid, pidNames);
    fillSelect($('cfgRate'), ch.rate, ch.activeRate, rateNames);
    $('cfgPid').value = String(current.pid);
    $('cfgRate').value = String(current.rate);

    const r = cfg.rates;
    $('cfgRates').innerHTML =
      `Yaw: <b>P ${cfg.rf.P} · I ${cfg.rf.I} · D ${cfg.rf.D} · F ${cfg.rf.F}</b>, stop ${cfg.rf.cwStopGain}/${cfg.rf.ccwStopGain}<br>` +
      `Yaw rates: <b>${Math.round(maxYawRate(r))}°/s</b> full stick ` +
      `<span class="muted">(${[RATE_LABEL[r.type], ...yawRatesDisplay(r).map((f) => `${f.label} ${f.value}${f.unit ?? ''}`)].join(' · ')})</span>`;
    $('cfgNotes').innerHTML = cfg.notes.map((n) => `<li>${n.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</li>`).join('');
  }

  /** Put the loaded values into the sim. */
  function apply() {
    const { cfg } = current;
    state.rf = { ...cfg.rf };
    state.yawRates = { ...cfg.rates };
    const max = Math.round(maxYawRate(cfg.rates));
    controls.setStickRange(max);
    state.flickRate = max;                                   // a flick is a full-stick input
    state.piroRate = (Math.sign(state.piroRate) || 1) * max; // keep the piro direction
    controls.refresh();
    onChange();
  }

  /** Parse text, pick profiles (stored choice if still valid, else the active ones), apply and save. */
  function load(text, { fileName = null, pid = null, rate = null, save = true } = {}) {
    const parsed = parseRotorflightCli(text);
    const ch = profileChoices(parsed);
    const pidIdx = ch.pid.includes(pid) ? pid : ch.activePid;
    const rateIdx = ch.rate.includes(rate) ? rate : ch.activeRate;
    const cfg = yawConfigFromCli(parsed, pidIdx, rateIdx);
    if (cfg.found === 0) {
      showError("No Rotorflight yaw settings found. Paste the output of the CLI command `diff all` or `dump all`.");
      return false;
    }
    showError('');
    current = { text: keepLines(text), fileName, pid: pidIdx, rate: rateIdx, parsed, cfg };
    if (save && !persist()) cfg.notes.push("Couldn't save to this browser's storage, so it won't be here next visit.");
    apply();
    render();
    return true;
  }

  function persist() {
    return writeStore({ text: current.text, fileName: current.fileName, pid: current.pid, rate: current.rate });
  }

  function forget() {
    current = null;
    writeStore(null);
    state.rf = { ...RF_YAW_DEFAULTS };
    state.yawRates = null;
    controls.setStickRange(null);
    state.flickRate = PILOT_DEFAULTS.flickRate;
    state.piroRate = PILOT_DEFAULTS.piroRate;
    controls.refresh();
    render();
    onChange();
  }

  // ---- wiring
  $('cfgFileBtn').addEventListener('click', () => $('cfgFile').click());
  $('cfgFile').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    if (f.size > 2e6) { showError('That file is too big for a CLI diff/dump.'); return; }
    load(await f.text(), { fileName: f.name });
  });
  $('cfgPasteToggle').addEventListener('click', () => {
    $('cfgPaste').hidden = !$('cfgPaste').hidden;
    if (!$('cfgPaste').hidden) $('cfgText').focus();
  });
  $('cfgPasteLoad').addEventListener('click', () => {
    if (load($('cfgText').value)) { $('cfgText').value = ''; $('cfgPaste').hidden = true; }
  });
  const reselect = () => load(current.text, {
    fileName: current.fileName, pid: +$('cfgPid').value, rate: +$('cfgRate').value,
  });
  $('cfgPid').addEventListener('change', reselect);
  $('cfgRate').addEventListener('change', reselect);
  $('cfgReapply').addEventListener('click', () => { apply(); });
  $('cfgForget').addEventListener('click', forget);

  // ---- restore from last visit
  const saved = readStore();
  if (saved?.text && !load(saved.text, { fileName: saved.fileName, pid: saved.pid, rate: saved.rate, save: false })) {
    showError('');
    writeStore(null);
  }
  render();

  return {
    loaded: () => current && { rf: current.cfg.rf, label: current.parsed.master.name || current.fileName || 'your config' },
  };
}
