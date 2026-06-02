// Lazy AudioContext — must be created inside a user gesture (keypress qualifies).
let _ctx: AudioContext | null = null;

function ctx(): AudioContext {
  if (!_ctx) _ctx = new AudioContext();
  if (_ctx.state === "suspended") _ctx.resume();
  return _ctx;
}

// ── Bark sound ─────────────────────────────────────────────────────────────────
// Two-layer synthesis:
//   1. Sawtooth sweep 500 → 90 Hz — the main "woof" body
//   2. Square transient 1800 → 380 Hz, decays in 50 ms — the sharp attack "pop"
// Both run through a low-pass filter to give the muffled pug-nose quality.

export function playBark(): void {
  const ac  = ctx();
  const now = ac.currentTime;

  // ── Layer 1: woof body ────────────────────────────────────────────────────
  const body    = ac.createOscillator();
  const bodyGain = ac.createGain();
  const lpf      = ac.createBiquadFilter();

  body.type = "sawtooth";
  body.frequency.setValueAtTime(500, now);
  body.frequency.exponentialRampToValueAtTime(90, now + 0.18);

  lpf.type = "lowpass";
  lpf.frequency.value = 850;
  lpf.Q.value = 1.8;

  bodyGain.gain.setValueAtTime(0.001, now);
  bodyGain.gain.linearRampToValueAtTime(0.55, now + 0.009);
  bodyGain.gain.exponentialRampToValueAtTime(0.001, now + 0.21);

  body.connect(lpf);
  lpf.connect(bodyGain);
  bodyGain.connect(ac.destination);
  body.start(now);
  body.stop(now + 0.23);

  // ── Layer 2: attack transient ─────────────────────────────────────────────
  const pop     = ac.createOscillator();
  const popGain = ac.createGain();

  pop.type = "square";
  pop.frequency.setValueAtTime(1800, now);
  pop.frequency.exponentialRampToValueAtTime(380, now + 0.038);

  popGain.gain.setValueAtTime(0.001, now);
  popGain.gain.linearRampToValueAtTime(0.28, now + 0.004);
  popGain.gain.exponentialRampToValueAtTime(0.001, now + 0.055);

  pop.connect(popGain);
  popGain.connect(ac.destination);
  pop.start(now);
  pop.stop(now + 0.06);
}
