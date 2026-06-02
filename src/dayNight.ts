import { Scene } from "@babylonjs/core/scene";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";

export const CYCLE_SECONDS = 180; // 3-minute full day

// ── Colour keyframes ──────────────────────────────────────────────────────────
// t=0 midnight, t=0.5 noon, t=1 midnight again

type RGB = readonly [number, number, number];

interface Key {
  t: number;
  sky: RGB; fog: RGB; fogDensity: number;
  sunCol: RGB; sunInt: number;
  ambDiff: RGB; ambGround: RGB; ambInt: number;
}

const KEYS: Key[] = [
  { t:0.00, sky:[0.01,0.01,0.06], fog:[0.03,0.04,0.10], fogDensity:0.008,
    sunCol:[0.55,0.65,1.00], sunInt:0.07,
    ambDiff:[0.24,0.27,0.54], ambGround:[0.04,0.05,0.11], ambInt:0.10 },
  { t:0.18, sky:[0.26,0.13,0.11], fog:[0.24,0.14,0.13], fogDensity:0.010,
    sunCol:[0.90,0.56,0.38], sunInt:0.20,
    ambDiff:[0.50,0.33,0.28], ambGround:[0.16,0.09,0.07], ambInt:0.23 },
  { t:0.26, sky:[0.94,0.50,0.26], fog:[0.86,0.50,0.33], fogDensity:0.009,
    sunCol:[1.00,0.66,0.30], sunInt:0.58,
    ambDiff:[0.86,0.58,0.42], ambGround:[0.33,0.20,0.10], ambInt:0.38 },
  { t:0.36, sky:[0.53,0.81,0.98], fog:[0.70,0.87,0.96], fogDensity:0.006,
    sunCol:[1.00,0.97,0.90], sunInt:1.00,
    ambDiff:[0.90,0.95,1.00], ambGround:[0.28,0.48,0.18], ambInt:0.55 },
  { t:0.50, sky:[0.44,0.74,0.97], fog:[0.62,0.83,0.95], fogDensity:0.005,
    sunCol:[1.00,1.00,0.95], sunInt:1.30,
    ambDiff:[0.92,0.97,1.00], ambGround:[0.30,0.52,0.20], ambInt:0.62 },
  { t:0.66, sky:[0.50,0.78,0.95], fog:[0.65,0.84,0.94], fogDensity:0.006,
    sunCol:[1.00,0.95,0.82], sunInt:1.00,
    ambDiff:[0.90,0.93,0.98], ambGround:[0.28,0.48,0.18], ambInt:0.55 },
  { t:0.76, sky:[0.88,0.38,0.13], fog:[0.82,0.42,0.19], fogDensity:0.009,
    sunCol:[1.00,0.50,0.18], sunInt:0.52,
    ambDiff:[0.80,0.46,0.28], ambGround:[0.20,0.12,0.07], ambInt:0.34 },
  { t:0.86, sky:[0.09,0.06,0.20], fog:[0.11,0.08,0.22], fogDensity:0.010,
    sunCol:[0.50,0.54,0.92], sunInt:0.09,
    ambDiff:[0.28,0.25,0.52], ambGround:[0.05,0.05,0.12], ambInt:0.13 },
  { t:1.00, sky:[0.01,0.01,0.06], fog:[0.03,0.04,0.10], fogDensity:0.008,
    sunCol:[0.55,0.65,1.00], sunInt:0.07,
    ambDiff:[0.24,0.27,0.54], ambGround:[0.04,0.05,0.11], ambInt:0.10 },
];

function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }

function sample(tod: number): Key {
  let lo = KEYS[0], hi = KEYS[KEYS.length - 1];
  for (let i = 0; i < KEYS.length - 1; i++) {
    if (tod >= KEYS[i].t && tod <= KEYS[i + 1].t) { lo = KEYS[i]; hi = KEYS[i + 1]; break; }
  }
  const a = hi.t > lo.t ? (tod - lo.t) / (hi.t - lo.t) : 0;
  const lv = (c0: RGB, c1: RGB): RGB =>
    [lerp(c0[0],c1[0],a), lerp(c0[1],c1[1],a), lerp(c0[2],c1[2],a)];
  return {
    t: tod,
    sky: lv(lo.sky, hi.sky), fog: lv(lo.fog, hi.fog),
    fogDensity: lerp(lo.fogDensity, hi.fogDensity, a),
    sunCol: lv(lo.sunCol, hi.sunCol), sunInt: lerp(lo.sunInt, hi.sunInt, a),
    ambDiff: lv(lo.ambDiff, hi.ambDiff), ambGround: lv(lo.ambGround, hi.ambGround),
    ambInt: lerp(lo.ambInt, hi.ambInt, a),
  };
}

// ── Sun / moon direction ───────────────────────────────────────────────────────

function calcSunDir(tod: number): Vector3 {
  const RISE = 0.22, SET = 0.78;
  if (tod < RISE || tod > SET) {
    // Moon — fixed position in sky
    return new Vector3(0.30, -0.80, 0.50).normalize();
  }
  const p = (tod - RISE) / (SET - RISE);
  const angle = p * Math.PI;
  return new Vector3(
    -Math.cos(angle) * 0.80,
    -Math.sin(angle) - 0.05,
    -0.40,
  ).normalize();
}

// ── Visibility helpers ────────────────────────────────────────────────────────

function fade(x: number, lo: number, hi: number) {
  return Math.max(0, Math.min(1, (x - lo) / (hi - lo)));
}

function sunVis(tod: number) {
  if (tod < 0.22 || tod > 0.80) return 0;
  return Math.min(fade(tod, 0.22, 0.28), 1 - fade(tod, 0.74, 0.80));
}

function moonVis(tod: number) {
  if (tod < 0.22) return 1;
  if (tod < 0.30) return 1 - fade(tod, 0.22, 0.30);
  if (tod > 0.80) return fade(tod, 0.80, 0.88);
  return 0;
}

// ── Public helpers ────────────────────────────────────────────────────────────

export function periodLabel(tod: number): string {
  if (tod < 0.22 || tod > 0.86) return "NIGHT";
  if (tod < 0.30) return "DAWN";
  if (tod < 0.44) return "MORNING";
  if (tod < 0.56) return "NOON";
  if (tod < 0.72) return "AFTERNOON";
  return "DUSK";
}

export function formatClock(tod: number): string {
  const mins = Math.floor(tod * 24 * 60);
  const h = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// ── Main cycle ────────────────────────────────────────────────────────────────

export function createDayNightCycle(scene: Scene): { getTimeOfDay: () => number } {
  const sun     = scene.getLightByName("sun")     as DirectionalLight;
  const ambient = scene.getLightByName("ambient") as HemisphericLight;

  // ── Sun disc ──────────────────────────────────────────────────
  const sunDisc = MeshBuilder.CreateSphere("sunDisc", { diameter: 9, segments: 8 }, scene);
  const sunMat  = new StandardMaterial("sunDiscMat", scene);
  sunMat.disableLighting = true;
  sunMat.emissiveColor   = new Color3(1, 0.95, 0.6);
  sunDisc.material       = sunDisc.material = sunMat;
  sunDisc.applyFog       = false;
  sunDisc.isPickable     = false;

  // ── Moon disc ─────────────────────────────────────────────────
  const moonDisc = MeshBuilder.CreateSphere("moonDisc", { diameter: 6, segments: 8 }, scene);
  const moonMat  = new StandardMaterial("moonDiscMat", scene);
  moonMat.disableLighting = true;
  moonMat.emissiveColor   = new Color3(0.82, 0.88, 0.95);
  moonDisc.material       = moonMat;
  moonDisc.applyFog       = false;
  moonDisc.isPickable     = false;
  // Fixed moon position in the sky (matches night light direction)
  moonDisc.position.set(-70, 188, -118);

  let timeOfDay = 0.33;

  function apply(tod: number) {
    const k   = sample(tod);
    const dir = calcSunDir(tod);

    // Sky + fog
    scene.clearColor = new Color4(k.sky[0], k.sky[1], k.sky[2], 1);
    scene.fogColor   = new Color3(k.fog[0], k.fog[1], k.fog[2]);
    scene.fogDensity = k.fogDensity;

    // Sun light (doubles as moonlight at night)
    sun.direction = dir;
    sun.diffuse   = new Color3(k.sunCol[0], k.sunCol[1], k.sunCol[2]);
    sun.intensity = k.sunInt;

    // Ambient
    ambient.diffuse     = new Color3(k.ambDiff[0],   k.ambDiff[1],   k.ambDiff[2]);
    ambient.groundColor = new Color3(k.ambGround[0], k.ambGround[1], k.ambGround[2]);
    ambient.intensity   = k.ambInt;

    // Sun disc — opposite of light direction = where sun lives in sky
    const sv = sunVis(tod);
    sunDisc.position = dir.negate().scaleInPlace(260);
    sunMat.emissiveColor = new Color3(
      k.sunCol[0] * sv,
      k.sunCol[1] * sv,
      k.sunCol[2] * sv * 0.7,
    );
    sunDisc.isVisible = sv > 0.01;

    // Moon disc
    const mv = moonVis(tod);
    moonMat.emissiveColor = new Color3(0.82 * mv, 0.88 * mv, 0.95 * mv);
    moonDisc.isVisible = mv > 0.01;
  }

  apply(timeOfDay); // set correct state before first render

  scene.onBeforeRenderObservable.add(() => {
    const dt = scene.getEngine().getDeltaTime() / 1000;
    timeOfDay = (timeOfDay + dt / CYCLE_SECONDS) % 1;
    apply(timeOfDay);
  });

  return { getTimeOfDay: () => timeOfDay };
}
