/*
 * Rotorflight yaw (tail) rate controller, pid_mode 3 — the firmware default.
 *
 * JavaScript port of Rotorflight (https://github.com/rotorflight/rotorflight-firmware):
 *   src/main/flight/pid.c     pidLoadProfile (yaw parts), applyItermRelax,
 *                             pidApplyYawMode3, pidApplyPrecomp (collective/cyclic part)
 *   src/main/flight/pid.h     *_TERM_SCALE constants, PID_YAW_RATE_MODE_DECAY
 *   src/main/flight/mixer.c   mixerApplyInputLimit / saturation timer (MIXER_SATURATION_TIME)
 *   src/main/pg/pid.c         default yaw profile values
 * Ported from commit df6bda6 (8 Nov 2026).
 *
 * Rotorflight is free software: you can redistribute it and/or modify it under
 * the terms of the GNU General Public License as published by the Free Software
 * Foundation, either version 3 of the License, or (at your option) any later
 * version. This port is distributed under the same licence (see LICENSE).
 *
 * What is NOT ported (not modelled by this simulator): the rates/setpoint pipeline
 * (setpoint is given in deg/s directly), main-rotor inertia precomp (headspeed is
 * constant here), ground/spool-up error decay (always "spooled up"), the upstream
 * gyro filters/notches, and the mixer's rate/curve rules.
 *
 * Units: setpoint and gyro in deg/s. Rotorflight's PID output is a mixer input
 * where 1.0 = 24 deg of tail pitch (the configurator's tail override scale,
 * 0.024 deg per raw unit). Outputs from this module are converted to degrees.
 *
 * Sign convention: positive yaw = nose right (clockwise from above). Rotorflight's
 * PID works in the opposite sign (setpoint.c: "rcCommand[YAW] CW direction is
 * positive, while gyro[YAW] is negative", so the setpoint is negated), and there
 * the CW stop gain applies when the rate error is positive. In this sim's sign that
 * is a negative error: the CW gain is used when stopping a nose-right (clockwise)
 * rotation. Checked against a Rotorflight 4.6 blackbox log: logged axisP / rate error
 * is the CW gain for positive Rotorflight error and the CCW gain for negative, and the
 * hover tail trim is negative there (positive here).
 */

import { limitf, constrain, transition, pt1Filter, firstOrderLPF, difFilter } from './filters.js';

// pid.h
export const YAW_P_TERM_SCALE = 0.00006666666;
export const YAW_I_TERM_SCALE = 0.0005;
export const YAW_D_TERM_SCALE = 1.0e-6;
export const YAW_F_TERM_SCALE = 0.000025;
export const YAW_B_TERM_SCALE = 1.0e-6;
export const PID_YAW_RATE_MODE_DECAY = 0.2;
const MASTER_GAIN_MIN = 25, MASTER_GAIN_MAX = 200;

// mixer.h
export const MIXER_SATURATION_TIME = 5;

/** Degrees of tail pitch per unit of mixer input (configurator tail override scale). */
export const TAIL_DEG_PER_UNIT = 24;
/** Degrees of main-rotor collective per unit of mixer input (configurator main override scale). */
export const COLLECTIVE_DEG_PER_UNIT = 12;

/** Default yaw profile (src/main/pg/pid.c), in Rotorflight's own units. */
export const RF_YAW_DEFAULTS = Object.freeze({
  P: 80, I: 120, D: 10, F: 0, B: 0,
  cwStopGain: 120, ccwStopGain: 80,      // yaw_cw_stop_gain / yaw_ccw_stop_gain (%)
  gyroCutoff: 100,                       // gyro_cutoff[yaw] (Hz) — PID bandwidth limiter
  dtermCutoff: 20, btermCutoff: 20,      // Hz
  errorLimit: 60,                        // error_limit[yaw] (deg)
  errorDecayTime: 0, errorDecayLimit: 0, // error_decay_time_yaw (0.1 s), error_decay_limit_yaw (deg/s); 0 = off
  itermRelax: true,                      // iterm_relax_type = RPY
  itermRelaxLevel: 40, itermRelaxCutoff: 10,
  precompCutoff: 5,                      // yaw_precomp_cutoff (Hz)
  collectiveFF: 60, cyclicFF: 10,        // yaw_collective_ff_gain / yaw_cyclic_ff_gain
  masterGain: 100,                       // yaw_master_gain (%)
});

/**
 * What Rotorflight lets you enter for each yaw profile value (whole numbers only):
 * the configurator's Profiles tab (src/tabs/profiles/fields.js, Profiles.svelte) or,
 * for settings it doesn't show, the firmware CLI (src/main/cli/settings.c).
 */
export const RF_YAW_LIMITS = Object.freeze({
  P: [0, 1000], I: [0, 1000], D: [0, 1000], F: [0, 1000], B: [0, 1000], // PID_GAIN_MAX
  cwStopGain: [25, 250], ccwStopGain: [25, 250],
  gyroCutoff: [0, 250], dtermCutoff: [0, 250], btermCutoff: [0, 250],  // 0 = off
  errorLimit: [0, 180],
  errorDecayTime: [0, 250], errorDecayLimit: [0, 250],                  // CLI only
  itermRelaxLevel: [10, 250],                                          // CLI only; firmware clamps to 10..250
  itermRelaxCutoff: [1, 100],
  precompCutoff: [0, 250],
  collectiveFF: [0, 250], cyclicFF: [0, 250],
  masterGain: [25, 200],
});

// pidApplyPrecomp: drag estimate, 2nd-order approximation (accurate to ~12 deg collective)
const dragCoef = (x) => x * x;

/**
 * @param profile     Rotorflight yaw profile values (see RF_YAW_DEFAULTS)
 * @param pidRateHz   PID loop frequency
 * @param tailLimitDeg  mixer yaw input limit, in degrees of tail pitch
 */
export function createRotorflightYawPid(profile, pidRateHz, tailLimitDeg) {
  const pr = { ...RF_YAW_DEFAULTS, ...profile };
  const freq = pidRateHz;
  const dT = 1 / freq;

  // ---- pidLoadProfile (yaw)
  const Kp = YAW_P_TERM_SCALE * pr.P;
  const Ki = YAW_I_TERM_SCALE * pr.I;
  const Kd = YAW_D_TERM_SCALE * pr.D;
  const Kf = YAW_F_TERM_SCALE * pr.F;
  const Kb = YAW_B_TERM_SCALE * pr.B;
  const masterGain = constrain(pr.masterGain, MASTER_GAIN_MIN, MASTER_GAIN_MAX) / 100;
  const errorLimit = pr.errorLimit;

  let errorDecayRate = pr.errorDecayTime ? 10 / pr.errorDecayTime : 0;
  const errorDecayLimit = pr.errorDecayLimit ? pr.errorDecayLimit : 3600;
  if (pr.I === 0) errorDecayRate = Math.max(PID_YAW_RATE_MODE_DECAY, errorDecayRate); // rate mode

  const yawCWStopGain = pr.cwStopGain / 100;
  const yawCCWStopGain = pr.ccwStopGain / 100;
  const relaxLevel = constrain(pr.itermRelaxLevel, 10, 250);

  const gyrorFilter = firstOrderLPF(pr.gyroCutoff, freq);
  const dtermFilter = difFilter(pr.dtermCutoff, freq);
  const btermFilter = difFilter(pr.btermCutoff, freq);
  const relaxFilter = pt1Filter(constrain(pr.itermRelaxCutoff, 1, 100), freq);
  const precompFilter = firstOrderLPF(pr.precompCutoff, freq);
  const collectiveFFGain = pr.collectiveFF / 100;
  const cyclicFFGain = pr.cyclicFF / 100;

  // ---- mixer input limit (MIXER_IN_STABILIZED_YAW)
  const inputLimit = tailLimitDeg / TAIL_DEG_PER_UNIT;
  let saturation = 0;

  let axisError = 0;

  // Latest outputs, in degrees of tail pitch (reused object).
  const out = { P: 0, I: 0, D: 0, F: 0, cmd: 0, saturated: false, pidSum: 0 };

  function applyItermRelax(itermError, setpoint) {
    if (!pr.itermRelax) return itermError;
    const setpointLpf = relaxFilter.apply(setpoint);
    const setpointHpf = setpoint - setpointLpf;
    const itermRelaxFactor = Math.max(0, 1 - Math.abs(setpointHpf) / relaxLevel);
    return itermError * itermRelaxFactor;
  }

  /**
   * One PID cycle: pidApplyYawMode3 + pidApplyPrecomp + mixer input limit.
   * @param setpoint  yaw rate command (deg/s)
   * @param gyro      measured yaw rate (deg/s)
   * @param collective, cyclic  main-rotor deflections in mixer units (1.0 = 12 deg)
   */
  function update(setpoint, gyro, collective = 0, cyclic = 0) {
    // Saturation flag from the previous mixer pass (PID runs before the mixer).
    const axisSaturated = saturation > 0;

    // pidApplyGyroRate: bandwidth limiter
    const gyroRate = gyrorFilter.apply(gyro);

    const errorRate = setpoint - gyroRate;
    // Rotorflight: transition(error, -10, 10, CCW, CW) in its own (negated) sign, so here
    // a negative error (stopping a nose-right turn) uses the CW gain.
    const stopGain = transition(errorRate, -10, 10, yawCWStopGain, yawCCWStopGain);

    // P-term
    const P = Kp * masterGain * errorRate * stopGain;

    // D-term (on measurement)
    const D = Kd * masterGain * dtermFilter.apply(-gyroRate);

    // I-term
    const itermErrorRate = applyItermRelax(errorRate, setpoint);
    const saturated = axisSaturated && axisError * itermErrorRate > 0;
    const itermDelta = saturated ? 0 : itermErrorRate * dT * masterGain;
    axisError = limitf(axisError + itermDelta, errorLimit);
    const I = Ki * axisError;

    // Error decay (spooled up)
    const errorDecay = limitf(axisError * errorDecayRate, errorDecayLimit);
    axisError -= errorDecay * dT;

    // Feedforward + boost
    let F = Kf * setpoint;
    const B = Kb * btermFilter.apply(setpoint);
    let pidSum = P + I + D + F + B;

    // pidApplyPrecomp: collective/cyclic-to-yaw (rotation sign and spool-up ratio = 1)
    const mainDeflection = Math.abs(collective) * collectiveFFGain + Math.abs(cyclic) * cyclicFFGain;
    const mainPrecomp = precompFilter.apply(dragCoef(mainDeflection));
    F += mainPrecomp + B; // B and precomp are both shown with the feedforward
    pidSum += mainPrecomp;

    // mixerUpdate: count down saturation, then mixerApplyInputLimit
    if (saturation) saturation--;
    let input = pidSum;
    if (input > inputLimit) { input = inputLimit; saturation = MIXER_SATURATION_TIME; }
    else if (input < -inputLimit) { input = -inputLimit; saturation = MIXER_SATURATION_TIME; }

    out.P = P * TAIL_DEG_PER_UNIT;
    out.I = I * TAIL_DEG_PER_UNIT;
    out.D = D * TAIL_DEG_PER_UNIT;
    out.F = F * TAIL_DEG_PER_UNIT;
    out.pidSum = pidSum * TAIL_DEG_PER_UNIT;
    out.cmd = input * TAIL_DEG_PER_UNIT;
    out.saturated = input !== pidSum;
    return out;
  }

  /**
   * Put the controller in hover equilibrium before a run (not in the firmware:
   * a real heli gets here by flying). The I-term carries whatever tail pitch the
   * precomp doesn't, and the filters start settled at gyro = 0.
   * Returns the tail pitch command (deg).
   */
  function initHover(trimDeg, collective = 0, cyclic = 0) {
    const precomp = dragCoef(Math.abs(collective) * collectiveFFGain + Math.abs(cyclic) * cyclicFFGain);
    precompFilter.reset(precomp);
    gyrorFilter.reset(0);
    dtermFilter.reset(0);
    btermFilter.reset(0);
    relaxFilter.reset(0);
    const needed = trimDeg / TAIL_DEG_PER_UNIT - precomp;
    axisError = Ki > 0 ? limitf(needed / Ki, errorLimit) : 0;
    const sum = Ki * axisError + precomp;
    const input = limitf(sum, inputLimit);
    out.P = out.D = 0;
    out.I = Ki * axisError * TAIL_DEG_PER_UNIT;
    out.F = precomp * TAIL_DEG_PER_UNIT;
    out.pidSum = sum * TAIL_DEG_PER_UNIT;
    out.cmd = input * TAIL_DEG_PER_UNIT;
    out.saturated = false;
    return out.cmd;
  }

  return { update, initHover, out };
}
