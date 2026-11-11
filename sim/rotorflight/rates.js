/*
 * Rotorflight stick-to-rate curves (yaw axis): stick deflection → yaw rate setpoint.
 *
 * JavaScript port of Rotorflight (https://github.com/rotorflight/rotorflight-firmware):
 *   src/main/fc/rc_rates.c   applyRatesCurve and the per-type curve functions
 *   src/main/fc/rc_rates.h   SETPOINT_RATE_LIMIT
 *   src/main/pg/rates.c      default rate profile values
 * GPL-3.0-or-later, as the rest of this port (see LICENSE).
 *
 * Not ported: the rest of the setpoint pipeline in src/main/flight/setpoint.c
 * (RC smoothing, yaw dynamic deadband/ceiling, response time, accel limit,
 * setpoint boost). The sim's pilot commands the curve's output directly.
 */

export const RATES_TYPES = ['NONE', 'BETAFLIGHT', 'RACEFLIGHT', 'KISS', 'ACTUAL', 'QUICK', 'ROTORFLIGHT'];
export const SETPOINT_RATE_LIMIT = 2000;

/** Default yaw rate settings (src/main/pg/rates.c). CLI: rates_type, yaw_rc_rate, yaw_expo, yaw_srate. */
export const YAW_RATES_DEFAULTS = Object.freeze({ type: 'ROTORFLIGHT', rcRate: 80, expo: 50, srate: 12 });

const clampf = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

/** Curve magnitude for |deflection| = x in 0..1 (deg/s), before the rate limit. */
function curve(r, x) {
  const expo = r.expo / 100;
  switch (r.type) {
    case 'BETAFLIGHT': {
      let rcRate = r.rcRate * 2;
      if (rcRate > 400) rcRate += 14.54 * (rcRate - 400);
      const expof = x * (1 - expo) + x ** 4 * expo;
      const superFactor = 1 / clampf(1 - x * (r.srate / 100), 0.01, 1);
      return rcRate * expof * superFactor;
    }
    case 'RACEFLIGHT': {
      let expof = x * (1 - expo) + x ** 3 * expo;
      expof += expof * x * (r.srate / 100);
      return r.rcRate * 10 * expof;
    }
    case 'KISS': {
      const expof = x * (1 - expo) + x ** 3 * expo;
      const superFactor = 1 / clampf(1 - x * (r.srate / 100), 0.01, 1);
      return r.rcRate * 2 * expof * superFactor;
    }
    case 'ACTUAL': {
      const rcRate = r.rcRate * 10;
      const aRate = Math.max(0, r.srate * 10 - rcRate);
      const expof = x * (1 - expo) + x ** 5 * expo;
      return x * (rcRate + aRate * expof);
    }
    case 'QUICK': {
      const rcRate = r.rcRate * 2;
      const expof = x * (1 - expo) + x ** 3 * expo;
      const maxRate = Math.max(r.srate * 10, rcRate);
      const superRate = 1 - rcRate / maxRate;
      const superFactor = 1 / clampf(1 - expof * superRate, 0.01, 1);
      return rcRate * x * superFactor;
    }
    case 'ROTORFLIGHT': {
      const shape = r.srate / 16 + 2;
      const expof = x * (1 - expo) + x ** shape * expo;
      return r.rcRate * 5 * expof;
    }
    default: // NONE
      return 500 * x;
  }
}

/** Yaw rate setpoint (deg/s) for a stick deflection in -1..1. */
export function yawRateForStick(rates, deflection) {
  const x = Math.min(Math.abs(deflection), 1);
  return Math.sign(deflection) * Math.min(curve(rates, x), SETPOINT_RATE_LIMIT);
}

/**
 * The yaw rate settings as the Rotorflight configurator's Rates tab shows them: its labels
 * and display units (src/tabs/rates/rateTypes.js: display = CLI value / 100 × the type's scale,
 * since MSP carries rc_rate, srate and expo as CLI / 100). Columns in the tab's order.
 * @returns [{ label, value, unit }]
 */
export function yawRatesDisplay(r) {
  const c = (v) => v / 100; // configurator RC_TUNING units
  const fix = (v, d) => +v.toFixed(d);
  switch (r.type) {
    case 'BETAFLIGHT':
      return [{ label: 'RC Rate', value: fix(c(r.rcRate), 2) }, { label: 'Rate', value: fix(c(r.srate), 2) }, { label: 'RC Expo', value: fix(c(r.expo), 2) }];
    case 'RACEFLIGHT':
      return [{ label: 'Rate', value: r.rcRate * 10, unit: '°/s' }, { label: 'Acro+', value: r.srate }, { label: 'Expo', value: r.expo }];
    case 'KISS':
      return [{ label: 'RC Rate', value: fix(c(r.rcRate), 2) }, { label: 'Rate', value: fix(c(r.srate), 2) }, { label: 'RC Curve', value: fix(c(r.expo), 2) }];
    case 'ACTUAL':
      return [{ label: 'Center Sensitivity', value: r.rcRate * 10, unit: '°/s' }, { label: 'Max Rate', value: r.srate * 10, unit: '°/s' }, { label: 'Expo', value: fix(c(r.expo), 2) }];
    case 'QUICK':
      return [{ label: 'RC Rate', value: fix(c(r.rcRate), 2) }, { label: 'Max Rate', value: r.srate * 10, unit: '°/s' }, { label: 'Expo', value: fix(c(r.expo), 2) }];
    case 'ROTORFLIGHT':
      return [{ label: 'Rate', value: r.rcRate * 5, unit: '°/s' }, { label: 'Shape', value: r.srate }, { label: 'Expo', value: r.expo }];
    default:
      return [];
  }
}

/** Full-stick yaw rate (deg/s). */
export const maxYawRate = (rates) => yawRateForStick(rates, 1);

/**
 * Stick deflection (0..1) that commands |rate|, or null if full stick can't reach it.
 * The curves only ever rise with deflection, so a bisection finds it.
 */
export function stickForYawRate(rates, rate) {
  const target = Math.abs(rate);
  if (target > maxYawRate(rates) + 1e-9) return null;
  let lo = 0, hi = 1;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (yawRateForStick(rates, mid) < target) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}
