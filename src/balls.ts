import { Scene } from "@babylonjs/core/scene";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { PhysicsAggregate } from "@babylonjs/core/Physics/v2/physicsAggregate";
import { PhysicsShapeType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { groundHeight } from "./environment";

const BALL_D      = 0.55;
const BALL_R      = BALL_D / 2;
// Minimum speed² before we apply a nudge — avoids micro-vibrations at rest

const SPAWN_XZ: [number, number][] = [
  [  5,  5 ], [ -5,  5 ], [  5, -5 ], [ -5, -5 ],
  [  0, 14 ], [ 14,  0 ], [-11,  4 ], [  4, -11 ],
];

interface Ball {
  aggregate: PhysicsAggregate;
  mesh:      TransformNode;
}

export function createBalls(
  scene: Scene,
  pugRoot: TransformNode,
  dogRoots: TransformNode[],
): void {
  // Each park ball gets its own vivid colour — clearly not footballs
  const COLORS: [number,number,number][] = [
    [0.92, 0.18, 0.18],  // red
    [0.18, 0.42, 0.95],  // blue
    [0.95, 0.75, 0.08],  // yellow
    [0.18, 0.82, 0.30],  // green
    [0.95, 0.48, 0.12],  // orange
    [0.62, 0.18, 0.95],  // purple
    [0.12, 0.88, 0.88],  // cyan
    [0.95, 0.22, 0.68],  // pink
  ];

  const balls: Ball[] = SPAWN_XZ.map(([x, z], i) => {
    const gy  = groundHeight(x, z);
    const [r, g, b] = COLORS[i % COLORS.length];

    const mat = new StandardMaterial(`ballMat_${i}`, scene);
    mat.diffuseColor  = new Color3(r, g, b);
    mat.specularColor = new Color3(0.5, 0.5, 0.5);
    mat.specularPower = 40;

    const mesh = MeshBuilder.CreateSphere(`ball_${i}`, { diameter: BALL_D, segments: 8 }, scene);
    mesh.position.set(x, gy + BALL_R + 0.6, z);
    mesh.material = mat;

    // Dynamic physics body — bouncy football
    const aggregate = new PhysicsAggregate(
      mesh,
      PhysicsShapeType.SPHERE,
      { mass: 0.8, restitution: 0.62, friction: 0.45 },
      scene,
    );
    aggregate.body.setLinearDamping(0.25);
    aggregate.body.setAngularDamping(0.40);

    return { aggregate, mesh };
  });

  // Manual nudge pass — applied on top of whatever Havok's character-strength
  // push gives us, so balls feel snappy even if the CC push is subtle.
  const NUDGE_DIST   = BALL_R + 0.45;   // contact radius (ball + character)
  const NUDGE_FORCE  = 7.0;
  const upVec        = new Vector3(0, 0.18, 0);
  const _impulse     = new Vector3();              // reused — avoids allocation per contact

  const characters: TransformNode[] = [pugRoot, ...dogRoots];

  scene.onBeforeRenderObservable.add(() => {
    const dt = scene.getEngine().getDeltaTime() / 1000;
    if (dt <= 0) return;

    for (const ball of balls) {
      const bp = ball.mesh.position;
      // getLinearVelocity() was here but its result was unused (charSpd was always 1.0)
      // so the 8 WASM calls/frame have been removed

      for (const char of characters) {
        const cp = char.position;
        const dx = bp.x - cp.x;
        const dz = bp.z - cp.z;
        const dist2 = dx * dx + dz * dz;

        if (dist2 < NUDGE_DIST * NUDGE_DIST && dist2 > 0.0001) {
          const dist = Math.sqrt(dist2);
          _impulse.set(
            (dx / dist) * NUDGE_FORCE + upVec.x,
            upVec.y * NUDGE_FORCE,
            (dz / dist) * NUDGE_FORCE + upVec.z,
          );
          ball.aggregate.body.applyImpulse(_impulse, bp);
          break;
        }
      }
    }
  });
}
