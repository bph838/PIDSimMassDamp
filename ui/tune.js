// "Find best gains" panel: runs searchGains() (sim/tune.js) in a worker against the current
// setup (pilot input, heli model, signal chain) and offers the best results to apply.

import { TUNE_KEYS } from '../sim/index.js';
import { state, simParams } from './state.js';
import { $ } from './util.js';

const LABEL = { P: 'P', I: 'I', D: 'D', F: 'F', cwStopGain: 'CW stop', ccwStopGain: 'CCW stop' };

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

/** "P 100 · I 325 · …" with gains that differ from `ref` in bold. */
function gainsHtml(rf, ref) {
  return TUNE_KEYS.map((k) => {
    const txt = `${LABEL[k]} ${rf[k]}`;
    return ref && rf[k] !== ref[k] ? `<b>${txt}</b>` : txt;
  }).join(' · ');
}

/** One line per direction on the nominal heli, plus noise. */
function metricsHtml(detail, scenario) {
  const nominal = detail.cases.filter((c) => c.model === 'nominal');
  const parts = nominal.map((c) => {
    const way = c.dir > 0 ? 'Right' : 'Left';
    if (scenario === 'piro') {
      const stop = c.stop === null ? "doesn't stop" : `stops in ${c.stop.toFixed(2)} s`;
      return `${way}: ${stop}, ${c.bounce.toFixed(1)}° bounce-back`;
    }
    const settle = c.settle === null ? `<span class="bad">doesn't settle</span>` : `settles ${c.settle.toFixed(2)} s`;
    const end = c.settle === null ? `, ends ${Math.abs(c.finalError).toFixed(1)}° off` : '';
    return `${way}: ${settle}, ${c.overshoot.toFixed(1)}° over${end}`;
  });
  parts.push(`gyro-noise activity ${detail.noise.toFixed(1)}× stock`);
  return parts.map((p) => `<span>${p}</span>`).join('');
}

/**
 * @param controls  initControls() API (refresh)
 * @param pins      createPins() API (add)
 * @param onChange  re-run the simulation
 */
export function initTune({ controls, pins, onChange }) {
  let worker = null;
  let effort = 'quick';
  const goBtn = $('tuneGo');
  const effortBtns = [...document.querySelectorAll('#tuneEffort .seg-btn')];

  function updateBlurb() {
    $('tune-goal').textContent = state.scenario === 'piro'
      ? `Goal: stop a ${Math.abs(state.piroRate)}°/s piro quickly, both ways, with little bounce-back.`
      : `Goal: land on the ${state.step}° yaw angle quickly, both ways, with little overshoot (stick ${state.flickRate}°/s).`;
  }

  effortBtns.forEach((b) => b.addEventListener('click', () => {
    effort = b.dataset.effort;
    effortBtns.forEach((x) => x.classList.toggle('active', x === b));
  }));

  function setRunning(on) {
    goBtn.textContent = on ? 'Cancel' : 'Find best gains';
    goBtn.classList.toggle('btn-primary', !on);
    $('tuneProgress').hidden = !on;
    effortBtns.forEach((b) => { b.disabled = on; });
  }

  function stop() {
    if (worker) worker.terminate();
    worker = null;
    setRunning(false);
  }

  function showError(msg) {
    $('tuneResults').hidden = false;
    $('tuneResults').innerHTML = `<p class="cfg-error">${esc(msg)}</p>`;
  }

  function start() {
    const keys = [...document.querySelectorAll('#tuneKeys input:checked')].map((i) => i.dataset.key);
    if (!keys.length) { showError('Tick at least one gain to tune.'); return; }
    const scenario = state.scenario;
    const setup = $('tune-goal').textContent;
    try {
      worker = new Worker(new URL('./tuneWorker.js', import.meta.url), { type: 'module' });
    } catch {
      showError("This browser can't run the search in the background (module workers aren't supported).");
      return;
    }
    $('tuneResults').hidden = true;
    $('tuneBar').style.width = '0%';
    $('tuneProgressTxt').textContent = 'Starting…';
    setRunning(true);
    worker.onmessage = ({ data }) => {
      if (data.type === 'progress') {
        const pct = Math.round((100 * data.done) / data.total);
        $('tuneBar').style.width = `${pct}%`;
        $('tuneProgressTxt').textContent = `${pct}% · best score so far ${data.bestJ.toFixed(3)}`;
      } else if (data.type === 'done') {
        stop();
        render(data.result, scenario, setup);
      } else if (data.type === 'error') {
        stop();
        showError(`The search failed: ${data.message}`);
      }
    };
    worker.onerror = (e) => { stop(); showError(`The search failed: ${e.message || 'worker error'}`); };
    worker.postMessage({
      base: simParams(), start: { ...state.rf }, keys,
      robust: $('tuneRobust').checked, effort, seed: 1,
    });
  }

  goBtn.addEventListener('click', () => (worker ? stop() : start()));

  function render(result, scenario, setup) {
    const cur = result.current;
    const box = $('tuneResults');
    const maxEffect = Math.max(1e-9, ...result.effects.map((e) => e.worseBy));
    const better = result.results.filter((r) => r.detail.J < cur.detail.J - 1e-6);

    let html = `<p class="tune-setup">${esc(setup)}<br><span class="muted">${result.evaluations} gain sets tried. Score: lower is better.</span></p>`;
    html += row('Current gains', cur, null, scenario, null);
    if (!better.length) {
      html += '<p class="tune-none">Nothing found that beats the current gains for this setup.</p>';
    } else {
      better.forEach((r, i) => { html += row(i === 0 ? 'Best' : `Alternative ${i}`, r, cur.rf, scenario, i); });
      if (result.effects.length) {
        html += '<p class="tune-sub">What made the difference <span class="muted">(how much worse the best gets if just that gain goes back)</span></p><ul class="tune-effects">';
        for (const e of result.effects) {
          html += `<li><span class="eff-name">${LABEL[e.key]} ${e.from} → ${e.to}</span>` +
            `<span class="eff-bar"><span style="width:${Math.max(2, (100 * e.worseBy) / maxEffect)}%"></span></span>` +
            `<span class="eff-val">${e.worseBy > 0.0005 ? `+${e.worseBy.toFixed(3)}` : '≈ 0'}</span></li>`;
        }
        html += '</ul>';
      }
      html += `<p class="tune-note">These are the best gains <em>for this simulated heli</em>. On a real heli, try them in a spare PID profile, change one gain at a time and check for tail wag before trusting them.</p>`;
    }
    box.innerHTML = html;
    box.hidden = false;
    box.querySelectorAll('[data-apply]').forEach((b) => b.addEventListener('click', () => {
      const r = better[+b.dataset.apply];
      if (TUNE_KEYS.some((k) => state.rf[k] !== r.rf[k])) pins.add('Before');
      for (const k of TUNE_KEYS) state.rf[k] = r.rf[k];
      controls.refresh();
      onChange();
      box.querySelectorAll('[data-apply]').forEach((x) => { x.textContent = 'Apply'; });
      b.textContent = 'Applied ✓';
    }));
  }

  function row(name, r, ref, scenario, applyIndex) {
    return `<div class="tune-row${applyIndex === null ? ' tune-current' : ''}">` +
      `<div class="tune-head"><span class="tune-name">${name}</span><span class="tune-score" title="Lower is better">score ${r.detail.J.toFixed(3)}</span>` +
      (applyIndex !== null ? `<button class="btn btn-small" data-apply="${applyIndex}" title="Use these gains (the current run is pinned first, so you can compare)">Apply</button>` : '') +
      `</div><div class="tune-gains">${gainsHtml(r.rf, ref)}</div>` +
      `<div class="tune-metrics">${metricsHtml(r.detail, scenario)}</div></div>`;
  }

  return { updateBlurb };
}
