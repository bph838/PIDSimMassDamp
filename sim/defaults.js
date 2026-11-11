// Default parameters for a simulation run.
// Units: degrees, seconds. Positive yaw = nose right (clockwise seen from above).

export const DEFAULTS = Object.freeze({
  // Rotorflight yaw profile overrides (see RF_YAW_DEFAULTS in sim/rotorflight/yawPid.js)
  rf: {},

  // Pilot input (see sim/scenario.js)
  scenario: 'flick', // 'flick' | 'piro'
  step: 90,          // flick: turn angle (deg)
  flickRate: 360,    // flick: yaw stick rate while held (deg/s)
  pilotLead: 0.06,   // flick: pilot lets go when heading + rate x lead reaches the angle (s)
  piroRate: 360,     // yaw stick rate command during a piro (deg/s); negative = nose left
  piroTime: 1.5,     // how long the piro stick is held (s)
  duration: 4,       // visible simulation time after the input starts (s)
  preroll: 2,        // settle time in hover before the input (s)
  showPreroll: 0.5,  // how much of the pre-roll to record for plotting (s)

  // ---- Heli model --------------------------------------------------------------
  // Tail servo
  thetaMax: 25,      // tail pitch limit (deg)
  servoTau: 0.010,   // first-order lag (s): a fast digital tail servo
  servoRate: 1000,   // slew limit (deg/s)
  thrustTau: 0.010,  // tail thrust lag behind blade pitch (s): inflow takes time to build

  // Yaw dynamics: dr/dt = A*thetaT - torque - b*r
  A: 128,            // tail authority: yaw accel per degree of tail pitch (deg/s^2 per deg)
  b: 3,              // aerodynamic yaw damping (1/s); top piro rate = A*(thetaMax - hoverTrim)/b
  hoverTrim: 5,      // tail pitch needed to hold heading at hover (deg): main torque = A*hoverTrim
  mainTorque: true,  // set false to remove main rotor torque entirely

  // Collective and the punch disturbance (see collectiveProfile in sim/scenario.js)
  hoverCollective: 6,  // deg
  punchTrim: 3,        // extra main-rotor torque from the punch, in degrees of tail pitch (6° -> ~9.3° collective)
  punch: false,
  punchTime: 2,        // seconds after t = 0

  // Signal chain around the PID (Rotorflight defaults)
  loopRate: 1000,     // PID loop rate (Hz)
  gyroLpfHz: 100,     // gyro_lpf1_static_hz: 1st-order low-pass on the gyro before the PID; 0 = off
  servoUpdateHz: 333, // servo update rate (Hz): the servo takes a new position once per frame; 0 = continuous

  // Sensor
  rateNoise: 0,      // Gaussian std-dev on measured yaw rate (deg/s)
  seed: 12345,       // RNG seed so the noise pattern is repeatable

  // Integration
  dt: 0.0005,        // physics step (s)
  recordDt: 0.001,   // plot sample interval (s)
});
