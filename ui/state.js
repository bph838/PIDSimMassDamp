// UI state (in UI units) and its mapping to simulate() parameters.

export const SHOW_PRE = 0.5; // seconds of pre-roll shown on the graphs

export const state = {
  kp: 2, ki: 3, kd: 0.2,
  step: 45, duration: 4,
  thetaMax: 25, servoTauMs: 20,
  dCutoff: 40, loopRate: 1000, antiWindup: true, dOnError: false,
  mainTorque: true, punch: false, punchTime: 2, noise: 0,
};

export function simParams() {
  return {
    kp: state.kp, ki: state.ki, kd: state.kd,
    step: state.step, duration: state.duration, showPreroll: SHOW_PRE,
    thetaMax: state.thetaMax, servoTau: state.servoTauMs / 1000,
    dCutoff: state.dCutoff, loopRate: state.loopRate,
    antiWindup: state.antiWindup, dOnError: state.dOnError,
    mainTorque: state.mainTorque, punch: state.punch, punchTime: state.punchTime,
    noise: state.noise,
  };
}
