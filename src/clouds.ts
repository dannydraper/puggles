import { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";

// ── Helpers ───────────────────────────────────────────────────────────────────
function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }
function fade(x: number, lo: number, hi: number) {
  return Math.max(0, Math.min(1, (x - lo) / (hi - lo)));
}

// ── Cloud definitions ──────────────────────────────────────────────────────────
// Each cloud is a root TransformNode with several overlapping ellipsoid puffs.
// speed = units/sec drift; dir = angle of drift (radians).

type Puff = { ox: number; oy: number; oz: number; w: number; h: number; d: number };
interface CloudDef { x: number; z: number; y: number; speed: number; dir: number; puffs: Puff[] }

const DEFS: CloudDef[] = [
  { x: -44, z:  38, y: 14, speed: 1.0, dir: 0.35, puffs: [
    { ox:  0, oy: 0, oz:  0, w: 13, h: 4, d:  9 },
    { ox:  6, oy: 1, oz:  0, w:  9, h: 3, d:  7 },
    { ox: -6, oy: 1, oz:  0, w:  8, h: 3, d:  6 },
    { ox:  1, oy: 3, oz:  0, w:  7, h: 3, d:  6 },
    { ox: -9, oy: 0, oz: -1, w:  6, h: 2, d:  5 },
  ]},
  { x:  52, z: -28, y: 13, speed: 1.3, dir: 0.28, puffs: [
    { ox:  0, oy: 0, oz:  0, w: 10, h: 3, d:  7 },
    { ox:  5, oy: 1, oz:  0, w:  7, h: 3, d:  6 },
    { ox: -4, oy: 1, oz:  0, w:  6, h: 3, d:  5 },
    { ox:  1, oy: 2, oz:  0, w:  6, h: 3, d:  5 },
  ]},
  { x:  20, z:  58, y: 16, speed: 0.7, dir: 0.15, puffs: [
    { ox:  0, oy: 0, oz:  0, w:  8, h: 2, d:  6 },
    { ox:  4, oy: 1, oz:  0, w:  5, h: 2, d:  5 },
    { ox: -3, oy: 0, oz:  0, w:  5, h: 2, d:  4 },
  ]},
  { x: -38, z: -50, y: 12, speed: 1.5, dir: 0.45, puffs: [
    { ox:  0, oy: 0, oz:  0, w: 14, h: 5, d: 10 },
    { ox:  7, oy: 2, oz:  0, w: 10, h: 4, d:  8 },
    { ox: -7, oy: 1, oz:  0, w:  8, h: 3, d:  7 },
    { ox:  2, oy: 3, oz:  0, w:  8, h: 3, d:  6 },
    { ox:-10, oy: 0, oz: -2, w:  6, h: 2, d:  6 },
    { ox: 10, oy: 1, oz:  1, w:  6, h: 2, d:  5 },
  ]},
  { x:  58, z:  42, y: 15, speed: 0.8, dir: 0.22, puffs: [
    { ox:  0, oy: 0, oz:  0, w:  9, h: 3, d:  7 },
    { ox:  4, oy: 1, oz:  0, w:  6, h: 2, d:  5 },
    { ox: -4, oy: 0, oz:  0, w:  5, h: 2, d:  5 },
  ]},
  { x:  30, z: -58, y: 13, speed: 1.1, dir: 0.32, puffs: [
    { ox:  0, oy: 0, oz:  0, w: 12, h: 4, d:  8 },
    { ox:  6, oy: 2, oz:  0, w:  8, h: 3, d:  7 },
    { ox: -5, oy: 1, oz:  0, w:  7, h: 3, d:  6 },
    { ox:  1, oy: 3, oz:  0, w:  6, h: 3, d:  6 },
    { ox:  8, oy: 0, oz:  1, w:  6, h: 2, d:  5 },
  ]},
  { x: -60, z: -30, y: 17, speed: 0.6, dir: 0.18, puffs: [
    { ox:  0, oy: 0, oz:  0, w:  7, h: 2, d:  5 },
    { ox:  3, oy: 1, oz:  0, w:  5, h: 2, d:  4 },
    { ox: -2, oy: 0, oz:  0, w:  4, h: 2, d:  4 },
  ]},
  { x: -18, z:  55, y: 12, speed: 1.4, dir: 0.38, puffs: [
    { ox:  0, oy: 0, oz:  0, w: 10, h: 3, d:  8 },
    { ox:  5, oy: 1, oz:  0, w:  7, h: 3, d:  6 },
    { ox: -5, oy: 1, oz:  0, w:  6, h: 3, d:  5 },
    { ox:  1, oy: 2, oz:  0, w:  6, h: 3, d:  5 },
  ]},
  { x: -55, z:  22, y: 11, speed: 0.75, dir: 0.42, puffs: [
    { ox:  0, oy: 0, oz:  0, w: 15, h: 5, d: 10 },
    { ox:  8, oy: 2, oz:  0, w: 10, h: 4, d:  8 },
    { ox: -7, oy: 1, oz:  0, w:  9, h: 4, d:  7 },
    { ox:  2, oy: 4, oz:  0, w:  8, h: 3, d:  7 },
    { ox:-10, oy: 0, oz: -2, w:  7, h: 3, d:  6 },
    { ox: 11, oy: 1, oz:  2, w:  7, h: 3, d:  6 },
  ]},
  { x:  38, z:  40, y: 15, speed: 1.6, dir: 0.12, puffs: [
    { ox:  0, oy: 0, oz:  0, w:  7, h: 2, d:  5 },
    { ox:  3, oy: 1, oz:  0, w:  5, h: 2, d:  4 },
  ]},
  { x: -35, z: -55, y: 13, speed: 1.2, dir: 0.26, puffs: [
    { ox:  0, oy: 0, oz:  0, w: 11, h: 4, d:  8 },
    { ox:  5, oy: 2, oz:  0, w:  7, h: 3, d:  6 },
    { ox: -5, oy: 1, oz:  0, w:  6, h: 3, d:  5 },
    { ox:  1, oy: 2, oz:  0, w:  6, h: 2, d:  5 },
  ]},
  { x:  62, z: -40, y: 14, speed: 0.9, dir: 0.35, puffs: [
    { ox:  0, oy: 0, oz:  0, w: 12, h: 4, d:  8 },
    { ox:  6, oy: 2, oz:  0, w:  8, h: 3, d:  7 },
    { ox: -6, oy: 1, oz:  0, w:  8, h: 3, d:  6 },
    { ox:  1, oy: 3, oz:  0, w:  6, h: 3, d:  6 },
  ]},
];

// ── Colour keyed to time-of-day (fully opaque — no alpha tricks) ───────────────

function cloudColor(tod: number): Color3 {
  if (tod < 0.18 || tod > 0.86) return new Color3(0.08, 0.09, 0.22);   // night: dark blue
  if (tod < 0.26) {                                                      // dawn
    const t = fade(tod, 0.18, 0.26);
    return new Color3(lerp(0.08, 1.00, t), lerp(0.09, 0.70, t), lerp(0.22, 0.52, t));
  }
  if (tod > 0.76) {                                                      // dusk
    const t = fade(tod, 0.76, 0.86);
    return new Color3(lerp(1.00, 0.08, t), lerp(0.68, 0.09, t), lerp(0.42, 0.22, t));
  }
  return new Color3(1.0, 1.0, 1.0);                                     // day: pure white
}

// ── Public entry point ─────────────────────────────────────────────────────────

export function createClouds(scene: Scene, getTimeOfDay: () => number): void {
  // Fully opaque + disableLighting so the colour is always exactly cloudColor().
  // Transparency was causing clouds to sort behind the sky clear and disappear.
  const mat = new StandardMaterial("cloudMat", scene);
  mat.disableLighting = true;
  mat.emissiveColor   = new Color3(1, 1, 1);
  mat.fogEnabled      = false;

  const roots: TransformNode[] = DEFS.map((def, ci) => {
    const root = new TransformNode(`cloud_${ci}`, scene);
    root.position.set(def.x, def.y, def.z);
    def.puffs.forEach((p, pi) => {
      const s = MeshBuilder.CreateSphere(`cloud_${ci}_${pi}`, { diameter: 1, segments: 5 }, scene);
      s.scaling.set(p.w, p.h, p.d);
      s.position.set(p.ox, p.oy, p.oz);
      s.material   = mat;
      s.isPickable = false;
      s.parent     = root;
    });
    return root;
  });

  scene.onBeforeRenderObservable.add(() => {
    const dt  = scene.getEngine().getDeltaTime() / 1000;
    const tod = getTimeOfDay();

    mat.emissiveColor = cloudColor(tod);

    for (let i = 0; i < roots.length; i++) {
      const r = roots[i];
      r.position.x += Math.sin(DEFS[i].dir) * DEFS[i].speed * dt;
      r.position.z += Math.cos(DEFS[i].dir) * DEFS[i].speed * dt;
      if (r.position.x >  90) r.position.x = -90;
      if (r.position.x < -90) r.position.x =  90;
      if (r.position.z >  90) r.position.z = -90;
      if (r.position.z < -90) r.position.z =  90;
    }
  });
}
