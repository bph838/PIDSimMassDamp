// Entry point: wires the UI modules together.
//   controls change state → run() simulates → charts, readouts and heli view redraw.

import { simulate, computeMetrics, computeStopMetrics, sampleIndex } from '../sim/index.js';
import { state, simParams, gainsLabel, SHOW_PRE } from './state.js';
import { readTheme, onThemeChange } from './theme.js';
import { $, clamp } from './util.js';
import { initControls } from './controls.js';
import { createCharts, updateCharts, showPlayhead, headingSnapshot } from './charts.js';
import { updateReadouts } from './readouts.js';
import { createHeliView } from './heliView.js';
import { createPlayback } from './playback.js';
import { createPins } from './pins.js';

let res = null;

// ---- redraw everything that depends on the playhead time
function showAt(t, hoverKey = null) {
  if (!res) return;
  const i = sampleIndex(res, t);
  showPlayhead(res, t, i, hoverKey);
  heli.draw(
    { psi: res.psi[i], sp: res.sp[i], theta: res.theta[i] },
    { rotorAngle: playback.rotorAngle, spinning: playback.playing },
  );
  const shown = Math.abs(res.t[i]) < 0.005 ? 0 : res.t[i]; // avoid "-0.00"
  $('playTime').textContent = `t = ${shown.toFixed(2)} s`;
}

// ---- simulate + redraw; coalesced to one run per animation frame
function run() {
  res = simulate(simParams());
  updateCharts(res, pins.pins);
  // A rate controller doesn't aim for the integrated stick angle of a piro, so hide those tiles.
  const tracking = state.scenario !== 'piro';
  updateReadouts(computeMetrics(res), computeStopMetrics(res), state.thetaMax, tracking);
  playback.t = clamp(playback.t, -SHOW_PRE, state.duration);
  showAt(playback.t);
}
let runQueued = false;
function scheduleRun() {
  if (runQueued) return;
  runQueued = true;
  requestAnimationFrame(() => { runQueued = false; run(); });
}

// ---- build
readTheme();
const chartHandlers = {
  onHover: (t, key) => { if (!playback.playing) showAt(t, key); },
  onLeave: () => { if (!playback.playing) showAt(playback.t); },
  onClick: (t) => playback.playFrom(t),
};

const heli = createHeliView($('heli'), () => showAt(playback.t));
const playback = createPlayback({
  button: $('play'),
  speedButtons: [...document.querySelectorAll('.speed-btn')],
  start: () => -SHOW_PRE,
  end: () => state.duration,
  onFrame: (t) => showAt(t),
});
const pins = createPins({
  snapshot: () => {
    if (runQueued) { runQueued = false; run(); } // make sure the trace matches the current gains
    return { label: gainsLabel(), data: headingSnapshot() };
  },
  onChange: () => res && updateCharts(res, pins.pins),
});
initControls({ onChange: scheduleRun }); // gains start at Rotorflight stock values; the Stock preset highlights itself

if (!window.Chart) {
  document.querySelector('.main').insertAdjacentHTML('afterbegin',
    '<p class="card" style="padding:12px">Chart.js failed to load from the CDN. Check your internet connection and reload.</p>');
} else {
  createCharts(chartHandlers);
  pins.render();
  run();

  onThemeChange(() => {
    createCharts(chartHandlers);
    pins.render();
    run();
  });
}
