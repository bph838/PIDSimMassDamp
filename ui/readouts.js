// Step-response metric tiles.

import { $, signed } from './util.js';

function set(id, text, dim = false) {
  const el = $(id);
  el.textContent = text;
  el.classList.toggle('dim', dim);
}

export function updateReadouts(m, thetaMax) {
  set('m-pre', signed(m.psi0, 1) + '°');
  if (m.riseTime === null) set('m-rise', 'never reached 90%', true);
  else set('m-rise', m.riseTime.toFixed(3) + ' s');
  set('m-os', m.overshoot.toFixed(1) + '%');
  if (m.settlingTime === null) set('m-settle', 'did not settle', true);
  else set('m-settle', m.settlingTime.toFixed(3) + ' s');
  set('m-sse', signed(m.ssError, 2) + '°');
  set('m-peak', m.peakPitch.toFixed(1) + '°');
  $('m-peak-sub').textContent = m.peakPitch >= thetaMax - 1e-6 ? 'commanded · at limit' : 'commanded';
  set('m-sat', m.satPct.toFixed(1) + '%');
}
