// UI state (in UI units) and its mapping to simulate() parameters.

import { RF_YAW_DEFAULTS, DEFAULTS } from '../sim/index.js';

export const SHOW_PRE = 0.5; // seconds of pre-roll shown on the graphs

/** Heli model + signal chain, in UI units (ms where the sim uses seconds). */
export const MODEL_DEFAULTS = Object.freeze({
  thetaMax: DEFAULTS.thetaMax,
  servoTauMs: DEFAULTS.servoTau * 1000,
  thrustTauMs: DEFAULTS.thrustTau * 1000,
  A: DEFAULTS.A,
  b: DEFAULTS.b,
  hoverTrim: DEFAULTS.hoverTrim,
  loopRate: DEFAULTS.loopRate,
  gyroLpfHz: DEFAULTS.gyroLpfHz,
  servoUpdateHz: DEFAULTS.servoUpdateHz,
});

/** Stick rates used when no Rotorflight config is loaded (deg/s). */
export const PILOT_DEFAULTS = Object.freeze({ flickRate: 360, piroRate: 360 });

export const state = {
  scenario: 'flick',        // 'flick' | 'piro'

  // Rotorflight yaw profile (Rotorflight units)
  rf: { ...RF_YAW_DEFAULTS },
  rateNoise: 0,
  // Yaw rates from a loaded Rotorflight config ({ type, rcRate, expo, srate }), or null.
  // Only used to show how much stick a rate needs; the sim takes rates in deg/s.
  yawRates: null,

  // pilot input
  step: 90, ...PILOT_DEFAULTS, pilotLead: DEFAULTS.pilotLead, piroTime: 1.5, duration: 1,

  // heli model and signal chain
  ...MODEL_DEFAULTS,

  // disturbances
  mainTorque: true, punch: false, punchTime: 0.5,

  // step response graph: step size 'stick' (the current stick rate) or 'small'
  stepSize: 'stick',
};

export const SMALL_STEP = 50; // deg/s

/** Stick rate of the current pilot input (deg/s, positive). */
export const stickRate = () => Math.max(1, Math.abs(state.scenario === 'piro' ? state.piroRate : state.flickRate));

/** Step size for the step response graph (deg/s). */
export const stepAmplitude = () => (state.stepSize === 'small' ? SMALL_STEP : stickRate());

/** Read a state value by key; 'rf.P' reads state.rf.P. */
export function getValue(key) {
  if (key.startsWith('rf.')) return state.rf[key.slice(3)];
  return state[key];
}

/** Write a state value by key; 'rf.P' writes state.rf.P. */
export function setStateValue(key, v) {
  if (key.startsWith('rf.')) state.rf[key.slice(3)] = v;
  else state[key] = v;
}

export function simParams() {
  return {
    scenario: state.scenario,
    rf: { ...state.rf },
    step: state.step, flickRate: state.flickRate, pilotLead: state.pilotLead,
    piroRate: state.piroRate, piroTime: state.piroTime,
    duration: state.duration, showPreroll: SHOW_PRE,
    thetaMax: state.thetaMax, servoTau: state.servoTauMs / 1000, thrustTau: state.thrustTauMs / 1000,
    A: state.A, b: state.b, hoverTrim: state.hoverTrim,
    loopRate: state.loopRate, gyroLpfHz: state.gyroLpfHz, servoUpdateHz: state.servoUpdateHz,
    mainTorque: state.mainTorque, punch: state.punch, punchTime: state.punchTime,
    rateNoise: state.rateNoise,
  };
}

/** Top piro rate the tail can sustain: A · (θmax − hover trim) / b (deg/s). */
export const topPiroRate = () => (state.A * (state.thetaMax - state.hoverTrim)) / state.b;

/** Short label of the current gains, e.g. for pinned runs. */
export function gainsLabel() {
  let s = `P${state.rf.P} I${state.rf.I} D${state.rf.D} · stop ${state.rf.cwStopGain}/${state.rf.ccwStopGain}`;
  if (state.scenario === 'piro') s += ` · piro ${state.piroRate}°/s`;
  else if (state.step !== 90) s += ` · ${state.step}°`;
  return s;
}
