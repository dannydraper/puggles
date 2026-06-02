import { Scene } from "@babylonjs/core/scene";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { PugParts } from "./pug";

// Each ring lives for WAVE_DURATION seconds, delayed by its index * WAVE_STAGGER
const WAVE_DURATION = 0.55;
const WAVE_STAGGER  = 0.11;   // seconds between successive rings
const WAVES_PER_BARK = 3;
const MAX_DIAMETER  = 0.72;   // fully expanded ring diameter
const RING_THICKNESS = 0.032;
const FORWARD_TRAVEL = 0.46;  // how far forward the ring drifts while expanding

interface Wave {
  mesh:     Mesh;
  mat:      StandardMaterial;
  age:      number;
  delay:    number;
  originX:  number;  // snout world position at birth
  originY:  number;
  originZ:  number;
  fwdX:     number;  // pug facing direction at birth
  fwdZ:     number;
  facingY:  number;  // pug rotation.y at birth (for ring orientation)
}

export function createBarkSystem(scene: Scene, pug: PugParts): () => void {
  const waves: Wave[] = [];
  let cooldown = 0;

  scene.onBeforeRenderObservable.add(() => {
    const dt = scene.getEngine().getDeltaTime() / 1000;
    cooldown = Math.max(0, cooldown - dt);

    for (let i = waves.length - 1; i >= 0; i--) {
      const w = waves[i];
      w.age += dt;

      const elapsed = w.age - w.delay;
      if (elapsed < 0) continue; // not started yet

      if (elapsed >= WAVE_DURATION) {
        w.mesh.dispose();
        w.mat.dispose();
        waves.splice(i, 1);
        continue;
      }

      const t    = elapsed / WAVE_DURATION;
      const ease = t * (2 - t);             // ease-out: fast start, slow end

      const d      = MAX_DIAMETER * ease;
      const fwd    = FORWARD_TRAVEL * ease;
      const alpha  = (1 - t) * 0.82;

      w.mesh.scaling.setAll(d < 0.001 ? 0.001 : d);
      w.mesh.position.set(
        w.originX + w.fwdX * fwd,
        w.originY + t * 0.08,  // tiny float upward for charm
        w.originZ + w.fwdZ * fwd,
      );
      w.mat.alpha = alpha;
    }
  });

  // ── Trigger function ───────────────────────────────────────────────────────

  return function triggerBark(): void {
    if (cooldown > 0) return;
    cooldown = 0.45;

    // Sample snout world position from headPivot + forward offset in local space
    const snoutLocal  = new Vector3(0, -0.02, 0.40);
    const snoutWorld  = Vector3.TransformCoordinates(snoutLocal, pug.headPivot.getWorldMatrix());

    const ry   = pug.root.rotation.y;
    const fwdX = Math.sin(ry);
    const fwdZ = Math.cos(ry);

    for (let i = 0; i < WAVES_PER_BARK; i++) {
      const mat = new StandardMaterial(`barkMat_${Date.now()}_${i}`, scene);
      mat.diffuseColor   = new Color3(1.00, 0.86, 0.18);
      mat.emissiveColor  = new Color3(0.80, 0.60, 0.00);
      mat.backFaceCulling = false;
      mat.alpha = 0;

      const mesh = MeshBuilder.CreateTorus(
        `barkRing_${Date.now()}_${i}`,
        { diameter: 1, thickness: RING_THICKNESS, tessellation: 28 },
        scene,
      );
      // Rotate so the ring stands upright and faces the pug's forward direction:
      // default torus lies flat (normal = +Y); rotate X by -90° → normal = +Z;
      // then rotate Y by facingY → normal points in the pug's forward direction.
      mesh.rotation.x = -Math.PI / 2;
      mesh.rotation.y = ry;
      mesh.scaling.setAll(0.001);
      mesh.material   = mat;
      mesh.isPickable = false;

      waves.push({
        mesh,
        mat,
        age:     0,
        delay:   i * WAVE_STAGGER,
        originX: snoutWorld.x,
        originY: snoutWorld.y,
        originZ: snoutWorld.z,
        fwdX,
        fwdZ,
        facingY: ry,
      });
    }
  };
}
