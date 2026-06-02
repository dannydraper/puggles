import { Scene } from "@babylonjs/core/scene";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { PugParts } from "./pug";

// ── Sound-wave rings ───────────────────────────────────────────────────────────
const WAVE_DURATION  = 0.42;   // faster travel
const WAVE_STAGGER   = 0.065;  // tight burst spacing
const WAVES_PER_BARK = 4;      // more rings = more weapon-y
const MAX_DIAMETER   = 0.68;
const RING_THICKNESS = 0.044;  // slightly thicker so they read at distance
const FORWARD_TRAVEL = 8.0;    // shoot far forward like a projectile

// ── Body-animation parameters ─────────────────────────────────────────────────
const ANIM_DURATION  = 0.28;
const HEAD_DIP       = 0.72;   // radians — head nods down
const BUM_BACK       = 0.04;   // units  — body slides back (bum bops out a little)
const BUM_TILT       = 0.04;   // radians — body tilts so rear lifts slightly

interface Wave {
  mesh:     Mesh;
  mat:      StandardMaterial;
  age:      number;
  delay:    number;
  originX:  number;
  originY:  number;
  originZ:  number;
  fwdX:     number;
  fwdZ:     number;
}

export function createBarkSystem(scene: Scene, pug: PugParts): () => void {
  const waves: Wave[] = [];
  let cooldown   = 0;
  let barkAnimT  = -1;   // < 0 = inactive
  let lastPulse  = 0;    // pulse value from previous frame — used for delta application

  scene.onBeforeRenderObservable.add(() => {
    const dt = scene.getEngine().getDeltaTime() / 1000;
    cooldown = Math.max(0, cooldown - dt);

    // ── Body animation ────────────────────────────────────────────────────────
    // Delta approach: each frame we apply only the *change* in the sine pulse,
    // so the total accumulated displacement across the full animation is zero —
    // the bum and head always return to exactly where they started.
    if (barkAnimT >= 0) {
      barkAnimT += dt;
      const raw = barkAnimT / ANIM_DURATION;

      if (raw < 1.0) {
        const pulse = Math.sin(Math.PI * raw);
        const delta = pulse - lastPulse;
        lastPulse   = pulse;

        pug.headPivot.rotation.x += HEAD_DIP * delta;
        pug.body.position.z      -= BUM_BACK * delta;
        pug.body.rotation.x      -= BUM_TILT * delta;
      } else {
        // Animation finished — snap out any float-precision residual
        pug.headPivot.rotation.x -= HEAD_DIP * lastPulse;
        pug.body.position.z      += BUM_BACK * lastPulse;
        pug.body.rotation.x      += BUM_TILT * lastPulse;
        lastPulse = 0;
        barkAnimT = -1;
      }
    }

    // ── Sound-wave rings ──────────────────────────────────────────────────────
    for (let i = waves.length - 1; i >= 0; i--) {
      const w = waves[i];
      w.age += dt;

      const elapsed = w.age - w.delay;
      if (elapsed < 0) continue;

      if (elapsed >= WAVE_DURATION) {
        w.mesh.dispose();
        w.mat.dispose();
        waves.splice(i, 1);
        continue;
      }

      const t = elapsed / WAVE_DURATION;

      // Rings snap to full diameter in first 20% then hold — weapon not flower
      const scale = Math.min(t / 0.20, 1.0) * MAX_DIAMETER;
      // Linear forward travel — constant projectile speed
      const fwd   = t * FORWARD_TRAVEL;
      // Stay opaque most of the way, only fade in final 30%
      const alpha = t < 0.70 ? 0.90 : 0.90 * (1 - (t - 0.70) / 0.30);

      w.mesh.scaling.setAll(Math.max(0.001, scale));
      w.mesh.position.set(
        w.originX + w.fwdX * fwd,
        w.originY,
        w.originZ + w.fwdZ * fwd,
      );
      w.mat.alpha = alpha;
    }
  });

  // ── Trigger ────────────────────────────────────────────────────────────────

  return function triggerBark(): void {
    if (cooldown > 0) return;
    cooldown  = 0.45;
    barkAnimT = 0;
    lastPulse = 0;

    const snoutLocal = new Vector3(0, -0.02, 0.40);
    const snoutWorld = Vector3.TransformCoordinates(snoutLocal, pug.headPivot.getWorldMatrix());

    const ry   = pug.root.rotation.y;
    const fwdX = Math.sin(ry);
    const fwdZ = Math.cos(ry);

    for (let i = 0; i < WAVES_PER_BARK; i++) {
      const mat = new StandardMaterial(`barkMat_${Date.now()}_${i}`, scene);
      mat.diffuseColor    = new Color3(1.00, 0.92, 0.30);
      mat.emissiveColor   = new Color3(1.00, 0.75, 0.00);  // full bright emission
      mat.backFaceCulling = false;
      mat.alpha = 0;

      const mesh = MeshBuilder.CreateTorus(
        `barkRing_${Date.now()}_${i}`,
        { diameter: 1, thickness: RING_THICKNESS, tessellation: 28 },
        scene,
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.rotation.y = ry;
      mesh.scaling.setAll(0.001);
      mesh.material   = mat;
      mesh.isPickable = false;

      waves.push({
        mesh, mat,
        age:     0,
        delay:   i * WAVE_STAGGER,
        originX: snoutWorld.x,
        originY: snoutWorld.y,
        originZ: snoutWorld.z,
        fwdX, fwdZ,
      });
    }
  };
}
