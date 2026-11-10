// Real-time playback of a run: Play/Pause, 1× / 0.25× speed, and the playhead time.

const ROTOR_REV_PER_S = 6; // visual main-rotor speed (rev per second of sim time)

/**
 * @param opts { button, speedButtons, start(), end(), onFrame(t) }
 *   start()/end() give the playable time range; onFrame is called every animation frame.
 */
export function createPlayback({ button, speedButtons, start, end, onFrame }) {
  let playing = false, t = 0, speed = 1, lastTs = 0, rotorAngle = 0.4;

  function setPlaying(on) {
    playing = on;
    button.textContent = on ? '❚❚ Pause' : '▶ Play';
  }

  function tick(ts) {
    if (!playing) return;
    const dt = Math.min(0.1, (ts - lastTs) / 1000);
    lastTs = ts;
    t += dt * speed;
    rotorAngle += dt * speed * 2 * Math.PI * ROTOR_REV_PER_S;
    if (t >= end()) { t = end(); setPlaying(false); }
    onFrame(t);
    if (playing) requestAnimationFrame(tick);
  }

  button.addEventListener('click', () => {
    if (playing) { setPlaying(false); onFrame(t); return; }
    if (t >= end() - 1e-3) t = start(); // restart from the beginning when at the end
    setPlaying(true);
    lastTs = performance.now();
    requestAnimationFrame(tick);
  });

  speedButtons.forEach((b) => b.addEventListener('click', () => {
    speed = +b.dataset.speed;
    speedButtons.forEach((o) => o.classList.toggle('active', o === b));
  }));

  return {
    get playing() { return playing; },
    get rotorAngle() { return rotorAngle; },
    get t() { return t; },
    set t(v) { t = v; },
  };
}
