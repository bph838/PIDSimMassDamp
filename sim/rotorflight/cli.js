/*
 * Read the yaw settings out of a Rotorflight CLI `diff`, `diff all` or `dump`.
 *
 * Output format (src/main/cli/cli.c): `set <name> = <value>` lines, with
 * `profile N` / `rateprofile N` lines starting each PID / rate profile section.
 * `diff all` and `dump all` list every profile and then repeat the active ones
 * ("restore original profile selection"), so the last `profile N` seen is the
 * active one. A diff only lists changed values: anything missing is the
 * firmware default. CLI names are from src/main/cli/settings.c.
 */

import { RF_YAW_DEFAULTS, RF_YAW_LIMITS } from './yawPid.js';
import { RATES_TYPES, YAW_RATES_DEFAULTS } from './rates.js';

/**
 * @returns {
 *   version, board          from the "# Rotorflight / BOARD (ID) VERSION" header, if present
 *   master                  { name: value } outside any profile section
 *   profiles, rateProfiles  { index: { name: value } }
 *   activeProfile, activeRateProfile   indices (last ones selected), or null
 * }
 */
export function parseRotorflightCli(text) {
  const out = { version: null, board: null, master: {}, profiles: {}, rateProfiles: {}, activeProfile: null, activeRateProfile: null };
  let section = out.master;
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('#')) {
      const v = line.match(/^#\s*Rotorflight\s*\/\s*(\S+)\s*\([^)]*\)\s*(\S+)/i);
      if (v) { out.board = v[1]; out.version = v[2]; }
      continue;
    }
    let m;
    if ((m = line.match(/^profile\s+(\d+)$/i))) {
      const i = +m[1];
      section = out.profiles[i] ??= {};
      out.activeProfile = i;
    } else if ((m = line.match(/^rateprofile\s+(\d+)$/i))) {
      const i = +m[1];
      section = out.rateProfiles[i] ??= {};
      out.activeRateProfile = i;
    } else if ((m = line.match(/^set\s+(\w+)\s*=\s*(.*)$/i))) {
      section[m[1].toLowerCase()] = m[2].trim();
    }
  }
  return out;
}

// CLI name → RF_YAW_DEFAULTS key. [name, index] reads one element of an array setting.
const PID_MAP = [
  ['yaw_p_gain', 'P'], ['yaw_i_gain', 'I'], ['yaw_d_gain', 'D'], ['yaw_f_gain', 'F'], ['yaw_b_gain', 'B'],
  ['yaw_cw_stop_gain', 'cwStopGain'], ['yaw_ccw_stop_gain', 'ccwStopGain'],
  ['yaw_gyro_cutoff', 'gyroCutoff'], ['yaw_d_cutoff', 'dtermCutoff'], ['yaw_b_cutoff', 'btermCutoff'],
  [['error_limit', 2], 'errorLimit'],
  ['error_decay_time_yaw', 'errorDecayTime'], ['error_decay_limit_yaw', 'errorDecayLimit'],
  [['iterm_relax_level', 2], 'itermRelaxLevel'], [['iterm_relax_cutoff', 2], 'itermRelaxCutoff'],
  ['yaw_precomp_cutoff', 'precompCutoff'],
  ['yaw_collective_ff_gain', 'collectiveFF'], ['yaw_cyclic_ff_gain', 'cyclicFF'],
  ['yaw_master_gain', 'masterGain'],
];

// Yaw settings that change the response but that this sim doesn't model, with their defaults.
const NOT_MODELLED_PID = [
  ['yaw_inertia_precomp_gain', 0, 'yaw inertia precomp'],
];
const NOT_MODELLED_RATES = [
  ['yaw_response', 0, 'yaw response time'],
  ['yaw_accel_limit', 0, 'yaw accel limit'],
  [['setpoint_boost_gain', 2], 0, 'yaw setpoint boost'],
  ['yaw_dynamic_ceiling_gain', 0, 'yaw dynamic ceiling'],
  ['yaw_dynamic_deadband_gain', 10, 'yaw dynamic deadband'],
];

const sortedKeys = (o) => Object.keys(o).map(Number).sort((a, b) => a - b);

/** PID and rate profile indices found in the text, and which are active. */
export function profileChoices(parsed) {
  const pid = sortedKeys(parsed.profiles), rate = sortedKeys(parsed.rateProfiles);
  return {
    pid, rate,
    activePid: parsed.activeProfile ?? pid[0] ?? null,
    activeRate: parsed.activeRateProfile ?? rate[0] ?? null,
  };
}

/**
 * Build the sim's yaw controller profile and yaw rates from parsed CLI text.
 * @returns {
 *   rf      complete yaw profile (RF_YAW_DEFAULTS keys); values not in the text are defaults
 *   rates   { type, rcRate, expo, srate }
 *   name, rateName   profile names, if set
 *   found   how many yaw settings were read from the text (0 → probably not a Rotorflight config)
 *   notes   human-readable warnings
 * }
 */
export function yawConfigFromCli(parsed, pidIndex, rateIndex) {
  const pidSec = (pidIndex !== null && parsed.profiles[pidIndex]) || {};
  const rateSec = (rateIndex !== null && parsed.rateProfiles[rateIndex]) || {};
  // A profile value pasted without its "profile N" line lands in master: accept it there too.
  const lookup = (sec) => (key) => {
    const [name, idx] = Array.isArray(key) ? key : [key, null];
    const v = sec[name] ?? parsed.master[name];
    if (v === undefined) return undefined;
    return idx === null ? v : v.split(',')[idx]?.trim();
  };
  const pidGet = lookup(pidSec), rateGet = lookup(rateSec);
  const notes = [];
  let found = 0;

  const num = (v, what) => {
    const n = Number(v);
    if (!Number.isFinite(n)) { notes.push(`Couldn't read ${what} = "${v}"; using the default.`); return undefined; }
    return n;
  };
  const label = (key) => (Array.isArray(key) ? `${key[0]}[yaw]` : key);

  // ---- PID profile
  const rf = { ...RF_YAW_DEFAULTS };
  for (const [cli, key] of PID_MAP) {
    const v = pidGet(cli);
    if (v === undefined) continue;
    const n = num(v, label(cli));
    if (n === undefined) continue;
    found++;
    const [lo, hi] = RF_YAW_LIMITS[key] ?? [-Infinity, Infinity];
    if (n < lo || n > hi) notes.push(`${label(cli)} = ${n} is outside the sim's ${lo}–${hi}; clamped.`);
    rf[key] = Math.min(hi, Math.max(lo, n));
  }
  const relax = pidGet('iterm_relax_type');
  if (relax !== undefined) {
    found++;
    rf.itermRelax = relax.toUpperCase() === 'RPY';
  }
  const mode = pidGet('pid_mode');
  if (mode !== undefined && Number(mode) !== 3) {
    notes.push(`pid_mode = ${mode}: the sim only runs mode 3 (the default yaw controller).`);
  }
  for (const [cli, def, what] of NOT_MODELLED_PID) {
    const v = pidGet(cli);
    if (v !== undefined && Number(v) !== def) notes.push(`${what} (${label(cli)} = ${v}) isn't simulated.`);
  }

  // ---- rate profile
  const rates = { ...YAW_RATES_DEFAULTS };
  const type = rateGet('rates_type');
  if (type !== undefined) {
    found++;
    const t = type.toUpperCase();
    if (RATES_TYPES.includes(t)) rates.type = t;
    else notes.push(`Unknown rates_type "${type}"; using ${rates.type}.`);
  }
  for (const [cli, key] of [['yaw_rc_rate', 'rcRate'], ['yaw_expo', 'expo'], ['yaw_srate', 'srate']]) {
    const v = rateGet(cli);
    if (v === undefined) continue;
    const n = num(v, cli);
    if (n === undefined) continue;
    found++;
    rates[key] = n;
  }
  for (const [cli, def, what] of NOT_MODELLED_RATES) {
    const v = rateGet(cli);
    if (v !== undefined && Number(v) !== def) notes.push(`${what} (${label(cli)} = ${v}) isn't simulated.`);
  }

  return {
    rf, rates, found, notes,
    name: pidGet('profile_name') || null,
    rateName: rateGet('rateprofile_name') || null,
  };
}
