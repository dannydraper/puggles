let _ctx: AudioContext | null = null;

function ctx(): AudioContext {
  if (!_ctx) _ctx = new AudioContext();
  if (_ctx.state === "suspended") _ctx.resume();
  return _ctx;
}

// Build a short white-noise buffer (reused across layers).
function makeNoise(ac: AudioContext, duration: number): AudioBuffer {
  const len  = Math.ceil(ac.sampleRate * duration);
  const buf  = ac.createBuffer(1, len, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

// ── Bark / yap ─────────────────────────────────────────────────────────────────
// Real dog yap = very short noise burst shaped by a fast-sweeping resonant
// bandpass.  Two parallel resonant modes (formants) give it the characteristic
// double-peaked spectral shape.  A dynamics compressor adds punch.

export function playBark(): void {
  const ac  = ctx();
  const now = ac.currentTime;

  const noise = makeNoise(ac, 0.18);

  // Shared compressor → destination
  const comp = ac.createDynamicsCompressor();
  comp.threshold.value = -10;
  comp.knee.value      =   2;
  comp.ratio.value     =  10;
  comp.attack.value    = 0.0005;
  comp.release.value   = 0.08;
  comp.connect(ac.destination);

  // ── Formant 1: main yap body  (sweeps 2800 → 420 Hz, high Q) ─────────────
  const n1  = ac.createBufferSource();
  n1.buffer = noise;
  const bp1 = ac.createBiquadFilter();
  bp1.type  = "bandpass";
  bp1.Q.value = 18;
  bp1.frequency.setValueAtTime(2800, now);
  bp1.frequency.exponentialRampToValueAtTime(420, now + 0.07);
  const g1 = ac.createGain();
  g1.gain.setValueAtTime(0.001, now);
  g1.gain.linearRampToValueAtTime(3.5, now + 0.002);
  g1.gain.exponentialRampToValueAtTime(0.001, now + 0.10);
  n1.connect(bp1); bp1.connect(g1); g1.connect(comp);
  n1.start(now); n1.stop(now + 0.14);

  // ── Formant 2: lower resonance adds body  (800 → 220 Hz) ─────────────────
  const n2  = ac.createBufferSource();
  n2.buffer = noise;
  const bp2 = ac.createBiquadFilter();
  bp2.type  = "bandpass";
  bp2.Q.value = 10;
  bp2.frequency.setValueAtTime(800, now);
  bp2.frequency.exponentialRampToValueAtTime(220, now + 0.08);
  const g2 = ac.createGain();
  g2.gain.setValueAtTime(0.001, now);
  g2.gain.linearRampToValueAtTime(1.8, now + 0.003);
  g2.gain.exponentialRampToValueAtTime(0.001, now + 0.11);
  n2.connect(bp2); bp2.connect(g2); g2.connect(comp);
  n2.start(now); n2.stop(now + 0.14);

  // ── Attack click: very brief high-pass burst gives the hard onset ─────────
  const n3  = ac.createBufferSource();
  n3.buffer = noise;
  const hp  = ac.createBiquadFilter();
  hp.type   = "highpass";
  hp.frequency.value = 5000;
  const g3  = ac.createGain();
  g3.gain.setValueAtTime(0.001, now);
  g3.gain.linearRampToValueAtTime(2.0, now + 0.001);
  g3.gain.exponentialRampToValueAtTime(0.001, now + 0.012);
  n3.connect(hp); hp.connect(g3); g3.connect(comp);
  n3.start(now); n3.stop(now + 0.015);
}
