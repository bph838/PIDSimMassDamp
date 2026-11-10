// Step-response metric tiles.

import { $, signed } from './util.js';

function set(id, text, dim = false) {
  const el = $(id);
  el.textContent = text;
  el.classList.toggle('dim', dim);
}

/**
 * @param m   computeMetrics() result
 * @param sm  computeStopMetrics() result
 * @param tracking  false hides the heading-tracking tiles (rate controller in a piro)
 */
export function updateReadouts(m, sm, thetaMax, tracking = true) {
  document.querySelectorAll('.track-tile').forEach((el) => { el.hidden = !tracking; });
  $('track-note').hidden = tracking;
  set('m-pre', signed(m.psi0, 1) + '°');
  if (m.riseTime === null) set('m-rise', 'never reached 90%', true);
  else set('m-rise', m.riseTime.toFixed(3) + ' s');
  set('m-os', m.overshoot.toFixed(1) + '%');
  $('m-os-sub').textContent = `${m.overshootDeg.toFixed(1)}° of ${signed(m.target, 0)}° commanded`;
  if (m.settlingTime === null) set('m-settle', 'did not settle', true);
  else set('m-settle', m.settlingTime.toFixed(3) + ' s');
  set('m-sse', signed(m.ssError, 2) + '°');
  set('m-peak', m.peakPitch.toFixed(1) + '°');
  $('m-peak-sub').textContent = m.peakPitch >= thetaMax - 1e-6 ? 'commanded · at limit' : 'commanded';
  set('m-sat', m.satPct.toFixed(1) + '%');

  // Stop metrics: only meaningful once the stick is centred (flick, piro)
  document.querySelectorAll('.stop-tile').forEach((el) => { el.hidden = !sm; });
  if (sm) {
    set('m-drift', sm.driftOn.toFixed(1) + '°');
    $('m-drift-sub').textContent = `released at ${Math.abs(sm.rateAtRelease).toFixed(0)} °/s`;
    set('m-bounce', sm.bounceBack.toFixed(1) + '°');
    if (sm.stopTime === null) set('m-stop', 'did not stop', true);
    else set('m-stop', sm.stopTime.toFixed(2) + ' s');
  }
}
