// Default parameters for a simulation run.
// Units: degrees, seconds. Positive yaw = nose right (clockwise seen from above).

export const DEFAULTS = Object.freeze({
  // Rotorflight yaw profile overrides (see RF_YAW_DEFAULTS in sim/rotorflight/yawPid.js)
  rf: {},

  // Pilot input (see sim/scenario.js)
  scenario: 'flick', // 'flick' | 'piro'
  step: 90,          // flick: turn angle (deg)
  flickRate: 360,    // flick: yaw stick rate while held (deg/s)
  pilotLead: 0.1,    // flick: pilot lets go when heading + rate x lead reaches the angle (s)
  piroRate: 360,     // yaw stick rate command during a piro (deg/s); negative = nose left
  piroTime: 1.5,     // how long the piro stick is held (s)
  duration: 4,       // visible simulation time after the input starts (s)
  preroll: 2,        // settle time in hover before the input (s)
  showPreroll: 0.5,  // how much of the pre-roll to record for plotting (s)

  // Tail servo / actuator
  thetaMax: 25,      // tail pitch limit (deg)
  servoTau: 0.020,   // first-order lag (s)
  servoRate: 1000,   // slew limit (deg/s)

  // Yaw dynamics: dr/dt = A*theta - torque - b*r
  A: 64,             // yaw accel per degree of tail pitch (deg/s^2 per deg)
  b: 2,              // aerodynamic yaw damping (1/s)
  Dmain: 320,        // main rotor torque at hover collective (deg/s^2)
  mainTorque: true,  // set false to remove main rotor torque entirely

  // Collective and the punch disturbance (see collectiveProfile in sim/scenario.js)
  hoverCollective: 6,          // deg
  torquePerCollective2: 552.96, // induced-drag torque coefficient, deg/s^2 per (mixer unit)^2.
                               // = A x 24 x 0.6^2, so Rotorflight's default collective FF (60) matches it.
  punch: false,
  punchTime: 2,      // seconds after t = 0
  punchTorque: 192,  // extra main-rotor torque (deg/s^2), ~3 deg of tail pitch (collective 6° -> ~9.3°)

  // Controller loop
  loopRate: 1000,    // PID loop rate (Hz)

  // Sensor
  rateNoise: 0,      // Gaussian std-dev on measured yaw rate (deg/s)
  seed: 12345,       // RNG seed so the noise pattern is repeatable

  // Integration
  dt: 0.0005,        // physics step (s)
  recordDt: 0.001,   // plot sample interval (s)
});
