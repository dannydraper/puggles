let _ctx: AudioContext | null = null;
let _barkBuffer: AudioBuffer | null = null;
let _loading = false;

function ctx(): AudioContext {
  if (!_ctx) _ctx = new AudioContext();
  if (_ctx.state === "suspended") _ctx.resume();
  return _ctx;
}

async function loadBark(): Promise<void> {
  if (_barkBuffer || _loading) return;
  _loading = true;
  try {
    const ac       = ctx();
    const response = await fetch("/bark.mp3");
    const bytes    = await response.arrayBuffer();
    _barkBuffer    = await ac.decodeAudioData(bytes);
  } catch (e) {
    console.warn("bark.mp3 failed to load", e);
  }
  _loading = false;
}

export function playBark(): void {
  const ac = ctx();
  // Kick off load on first call (no-ops if already loading/loaded)
  loadBark();
  if (!_barkBuffer) return;
  const src = ac.createBufferSource();
  src.buffer = _barkBuffer;
  src.playbackRate.value = 1.6;
  src.connect(ac.destination);
  src.start();
}

// Pre-load as soon as the module is imported so there's no delay on first bark
loadBark();
