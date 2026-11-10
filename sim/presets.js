// Gain presets, each picked to show one behaviour clearly with a 45° step.
// Verified with `node test.js` — update the checks there if you change these.

export const PRESETS = [
  // Kp 1 still swings +-10° at 4 s; 0.5 calms down sooner and the 10° offset is obvious.
  { id: 'p', name: 'P only', kp: 0.5, ki: 0, kd: 0,
    blurb: 'Overshoots ~45%, rings, then settles about 10° short: the main-rotor torque needs a constant error to hold +5° of tail pitch (5° / Kp).' },
  // Ki 2 (with Kp 1) is past the stability limit (Ki < ~0.7 Kp with servo lag): it limit-cycles forever.
  { id: 'pi', name: 'PI', kp: 0.5, ki: 0.3, kd: 0,
    blurb: 'P only plus a little I: the offset slowly disappears (mean heading creeps onto 45°), but with no D it rings for seconds. Try duration 10 s.' },
  { id: 'pd', name: 'PD', kp: 1, ki: 0, kd: 0.1,
    blurb: 'D damps the overshoot nicely, but without I it still settles short of the target.' },
  { id: 'good', name: 'Good PID', kp: 2, ki: 3, kd: 0.2,
    blurb: 'About 10% overshoot and settled on target in under a second.' },
  { id: 'hiP', name: 'Too much P', kp: 5, ki: 3, kd: 0.15,
    blurb: 'Fast, but the tail slams into its limits and the heading rings.' },
  { id: 'hiI', name: 'Too much I', kp: 1.5, ki: 15, kd: 0.15,
    blurb: 'The integrator charges up during the move: big overshoot, then a slow wallowing oscillation that never dies out (this much I is past the stability limit).' },
  { id: 'hiD', name: 'Too much D', kp: 1.5, ki: 3, kd: 0.8, noise: 0.02,
    blurb: 'Over-damped: the turn crawls, the I term builds up and overshoots slowly, and D turns gyro noise into tail chatter. (Also switches on 0.02° gyro noise.)' },
];
