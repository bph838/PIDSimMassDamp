// UI state (in UI units) and its mapping to simulate() parameters.

import { RF_YAW_DEFAULTS } from '../sim/index.js';

export const SHOW_PRE = 0.5; // seconds of pre-roll shown on the graphs

export const state = {
  scenario: 'flick',        // 'flick' | 'piro'

  // Rotorflight yaw profile (Rotorflight units)
  rf: { ...RF_YAW_DEFAULTS },
  rateNoise: 0,

  // pilot input
  step: 45, flickRate: 180, piroRate: 360, piroTime: 1.5, duration: 4,

  // heli and loop
  thetaMax: 25, servoTauMs: 20, loopRate: 1000,
  mainTorque: true, punch: false, punchTime: 2,
};

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
    step: state.step, flickRate: state.flickRate, piroRate: state.piroRate, piroTime: state.piroTime,
    duration: state.duration, showPreroll: SHOW_PRE,
    thetaMax: state.thetaMax, servoTau: state.servoTauMs / 1000, loopRate: state.loopRate,
    mainTorque: state.mainTorque, punch: state.punch, punchTime: state.punchTime,
    rateNoise: state.rateNoise,
  };
}

/** Short label of the current gains, e.g. for pinned runs. */
export function gainsLabel() {
  let s = `P${state.rf.P} I${state.rf.I} D${state.rf.D} · stop ${state.rf.cwStopGain}/${state.rf.ccwStopGain}`;
  if (state.scenario === 'piro') s += ` · piro ${state.piroRate}°/s`;
  else if (state.step !== 45) s += ` · ${state.step}°`;
  return s;
}
