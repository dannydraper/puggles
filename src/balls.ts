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
const REST_SPD2   = 0.04;

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
  const whiteMat = new StandardMaterial("ballWhite", scene);
  whiteMat.diffuseColor  = new Color3(0.96, 0.94, 0.90);
  whiteMat.specularColor = new Color3(0.55, 0.55, 0.55);
  whiteMat.specularPower = 48;

  const patchMat = new StandardMaterial("ballPatch", scene);
  patchMat.diffuseColor  = new Color3(0.10, 0.10, 0.10);
  patchMat.specularColor = new Color3(0.15, 0.15, 0.15);

  // Six patch directions — top, bottom, +x, −x, +z, −z
  const patchDirs: [number, number, number][] = [
    [ 0,  1,  0 ], [  0, -1,  0 ],
    [ 1,  0,  0 ], [ -1,  0,  0 ],
    [ 0,  0,  1 ], [  0,  0, -1 ],
  ];

  const balls: Ball[] = SPAWN_XZ.map(([x, z], i) => {
    const gy = groundHeight(x, z);

    // Main ball sphere
    const mesh = MeshBuilder.CreateSphere(`ball_${i}`, { diameter: BALL_D, segments: 8 }, scene);
    mesh.position.set(x, gy + BALL_R + 0.6, z); // drop in from slightly above
    mesh.material = whiteMat;

    // Flat pentagon-ish patches for football look
    patchDirs.forEach((dir, pi) => {
      const patch = MeshBuilder.CreateSphere(
        `ball_${i}_p${pi}`,
        { diameter: BALL_D * 0.42, segments: 5 },
        scene,
      );
      const o = BALL_R * 0.88;
      patch.position.set(dir[0] * o, dir[1] * o, dir[2] * o);
      patch.scaling.set(1.0, 0.14, 1.0); // squash into a disc
      patch.material = patchMat;
      patch.parent   = mesh;
    });

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
  const NUDGE_FORCE  = 7.0;             // impulse magnitude
  const upVec        = new Vector3(0, 0.18, 0); // tiny upward component = slight loft

  const characters: TransformNode[] = [pugRoot, ...dogRoots];

  scene.onBeforeRenderObservable.add(() => {
    const dt = scene.getEngine().getDeltaTime() / 1000;
    if (dt <= 0) return;

    for (const ball of balls) {
      const bp = ball.mesh.position;
      const vel = ball.aggregate.body.getLinearVelocity();
      const spd2 = vel.x * vel.x + vel.z * vel.z;

      for (const char of characters) {
        const cp = char.position;
        const dx = bp.x - cp.x;
        const dz = bp.z - cp.z;
        const dist2 = dx * dx + dz * dz;

        if (dist2 < NUDGE_DIST * NUDGE_DIST && dist2 > 0.0001) {
          const dist = Math.sqrt(dist2);
          // Impulse proportional to how fast the character is moving
          const charSpd = spd2 < REST_SPD2 ? 1.0 : 1.0; // always nudge on contact
          const mag = NUDGE_FORCE * charSpd;
          const impulse = new Vector3(
            (dx / dist) * mag + upVec.x,
            upVec.y * mag,
            (dz / dist) * mag + upVec.z,
          );
          ball.aggregate.body.applyImpulse(impulse, bp);
          break; // one nudge per ball per frame is enough
        }
      }
    }
  });
}
