import { Scene } from "@babylonjs/core/scene";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { PugParts } from "./pug";

// ── Sound-wave rings ───────────────────────────────────────────────────────────
const WAVE_DURATION  = 0.55;
const WAVE_STAGGER   = 0.11;
const WAVES_PER_BARK = 3;
const MAX_DIAMETER   = 0.72;
const RING_THICKNESS = 0.032;
const FORWARD_TRAVEL = 0.46;

// ── Body-animation parameters ─────────────────────────────────────────────────
const ANIM_DURATION  = 0.28;   // total bark-pose duration (seconds)
const HEAD_DIP       = 0.40;   // how far headPivot.rotation.x dips (radians)
const BUM_BACK       = 0.10;   // how far body slides back along its local Z
const BUM_TILT       = 0.08;   // how much body.rotation.x tilts (bum lifts)

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
  let cooldown  = 0;
  let barkAnimT = -1;   // < 0 means inactive

  scene.onBeforeRenderObservable.add(() => {
    const dt = scene.getEngine().getDeltaTime() / 1000;
    cooldown = Math.max(0, cooldown - dt);

    // ── Body animation ────────────────────────────────────────────────────────
    if (barkAnimT >= 0) {
      barkAnimT += dt;
      if (barkAnimT < ANIM_DURATION) {
        // Single-pulse sine: peaks at t=0.5, zero at t=0 and t=1
        const pulse = Math.sin(Math.PI * (barkAnimT / ANIM_DURATION));

        // Head bops sharply downward
        pug.headPivot.rotation.x += HEAD_DIP * pulse;

        // Bum bops outward: body slides back and tilts so the rear lifts
        // body.position.z is in body-local space (–Z = back/bum direction for the pug)
        pug.body.position.z -= BUM_BACK * pulse;
        pug.body.rotation.x -= BUM_TILT * pulse;   // negative = front rises, bum lifts
      } else {
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

      const t    = elapsed / WAVE_DURATION;
      const ease = t * (2 - t);   // ease-out

      w.mesh.scaling.setAll(Math.max(0.001, MAX_DIAMETER * ease));
      w.mesh.position.set(
        w.originX + w.fwdX * FORWARD_TRAVEL * ease,
        w.originY + t * 0.08,
        w.originZ + w.fwdZ * FORWARD_TRAVEL * ease,
      );
      w.mat.alpha = (1 - t) * 0.82;
    }
  });

  // ── Trigger ────────────────────────────────────────────────────────────────

  return function triggerBark(): void {
    if (cooldown > 0) return;
    cooldown  = 0.45;
    barkAnimT = 0;   // start body animation

    const snoutLocal = new Vector3(0, -0.02, 0.40);
    const snoutWorld = Vector3.TransformCoordinates(snoutLocal, pug.headPivot.getWorldMatrix());

    const ry   = pug.root.rotation.y;
    const fwdX = Math.sin(ry);
    const fwdZ = Math.cos(ry);

    for (let i = 0; i < WAVES_PER_BARK; i++) {
      const mat = new StandardMaterial(`barkMat_${Date.now()}_${i}`, scene);
      mat.diffuseColor    = new Color3(1.00, 0.86, 0.18);
      mat.emissiveColor   = new Color3(0.80, 0.60, 0.00);
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
