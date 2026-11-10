// Presets for the Rotorflight yaw controller, each picked to show one behaviour clearly.
// Verified with `node test.js` — update the checks there if you change these.
//
// Gains are in Rotorflight's own units. `rf` is a complete profile: stock values
// plus the preset's changes. Optional `punch` and `rateNoise` are applied too.
// `scenario` is the pilot input the description (and test.js) refers to; the UI
// doesn't apply it, so picking a preset never changes the pilot input.

import { RF_YAW_DEFAULTS } from './rotorflight/yawPid.js';

const rf = (changes) => ({ ...RF_YAW_DEFAULTS, ...changes });

export const PRESETS = [
  { id: 'stock', name: 'Stock', rf: rf({}), scenario: 'piro',
    blurb: 'Rotorflight defaults (P 80, I 120, D 10, stop gains 120/80). On Piro & stop, stopping a 360°/s piro takes ~0.75 s, carries on ~40° and bounces back ~17°.' },
  { id: 'community', name: 'Community', rf: rf({ P: 120, I: 180, D: 20, cwStopGain: 180, ccwStopGain: 165 }), scenario: 'piro',
    blurb: 'A typical community tail tune (P 120, I 180, D 20, stop gains 180/165). On Piro & stop: a crisp stop, ~0.34 s with only ~3° of bounce-back.' },
  { id: 'soft', name: 'Soft stops', rf: rf({ cwStopGain: 50, ccwStopGain: 50 }), scenario: 'piro',
    blurb: 'Stop gains cut to 50: P is halved during stops. On Piro & stop the tail lets go late, overshoots and bounces back ~28° with a wobble.' },
  { id: 'rateMode', name: 'Rate mode (I = 0)', rf: rf({ I: 0 }), scenario: 'flick',
    blurb: 'No I term: the tail only damps yaw rate, it has no heading hold. Main-rotor torque makes the heli drift steadily.' },
  { id: 'hiI', name: 'Too much I', rf: rf({ I: 700 }), scenario: 'flick',
    blurb: 'I 700: a tail wag (~3–4 Hz) that never dies out. Rotorflight docs: raise I if the tail drifts, lower it if it wags.' },
  { id: 'noPrecomp', name: 'Precomp off', rf: rf({ collectiveFF: 0 }), scenario: 'flick', punch: true,
    blurb: 'Collective FF 0, with a collective punch at 2 s: the torque kick yaws the heli ~2.4° until I catches up. Set it back to 60 and the kick drops to ~0.6°.' },
  { id: 'noisyD', name: 'Noisy D', rf: rf({ D: 60 }), scenario: 'flick', rateNoise: 5,
    blurb: 'D 60 with 5°/s of gyro noise: D acts on yaw acceleration, so it turns noise into tail chatter. (Also switches on gyro noise.)' },
];
