import { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Mesh } from "@babylonjs/core/Meshes/mesh";

// Each leg: hip/shoulder pivot → upper segment → joint pivot → lower segment + paw
export interface LegPair {
  pivot: TransformNode;  // shoulder (front) or hip (back) — swings forward/back
  joint: TransformNode;  // elbow (front) or knee/hock (back) — bends during lift
}

export interface PugParts {
  root:          TransformNode;
  body:          Mesh;
  headPivot:     TransformNode;
  tailPivot:     TransformNode;
  leftEarPivot:  TransformNode;
  rightEarPivot: TransformNode;
  frontLeft:     LegPair;
  frontRight:    LegPair;
  backLeft:      LegPair;
  backRight:     LegPair;
}

export function createPug(scene: Scene): PugParts {
  const fawn = new StandardMaterial("pugFawn", scene);
  fawn.diffuseColor  = new Color3(0.86, 0.72, 0.52);
  fawn.specularColor = new Color3(0.10, 0.08, 0.06);

  const black = new StandardMaterial("pugBlack", scene);
  black.diffuseColor  = new Color3(0.12, 0.09, 0.09);
  black.specularColor = new Color3(0.18, 0.12, 0.08);

  const dark = new StandardMaterial("pugDark", scene);
  dark.diffuseColor = new Color3(0.20, 0.14, 0.10);

  // Slightly darker fawn for joint balls — makes the bend visible
  const jointMat = new StandardMaterial("pugJointMat", scene);
  jointMat.diffuseColor  = new Color3(0.68, 0.54, 0.36);
  jointMat.specularColor = new Color3(0.12, 0.10, 0.08);

  const eyeMat = new StandardMaterial("pugEye", scene);
  eyeMat.diffuseColor  = new Color3(0.04, 0.04, 0.04);
  eyeMat.emissiveColor = new Color3(0.12, 0.08, 0.04);
  eyeMat.specularColor = new Color3(0.90, 0.90, 0.90);
  eyeMat.specularPower = 64;

  const root = new TransformNode("pugRoot", scene);

  // ── Body ──────────────────────────────────────────────────────
  const body = MeshBuilder.CreateSphere("pugBody", { diameter: 1.0, segments: 8 }, scene);
  body.scaling.set(0.90, 0.78, 1.12);
  body.position.set(0, 0.54, 0);
  body.material = fawn;
  body.parent   = root;

  // ── Head meshes (re-parented to headPivot below) ───────────────
  const head = MeshBuilder.CreateSphere("pugHead", { diameter: 0.72, segments: 8 }, scene);
  head.position.set(0, 0.92, 0.44);  head.material = fawn;  head.parent = root;

  const mask = MeshBuilder.CreateSphere("pugMask", { diameter: 0.55, segments: 6 }, scene);
  mask.scaling.set(1.0, 0.76, 0.70);
  mask.position.set(0, 0.88, 0.60);  mask.material = black;  mask.parent = root;

  const snout = MeshBuilder.CreateSphere("pugSnout", { diameter: 0.36, segments: 6 }, scene);
  snout.scaling.set(1.0, 0.72, 0.58);
  snout.position.set(0, 0.84, 0.76);  snout.material = black;  snout.parent = root;

  const nose = MeshBuilder.CreateSphere("pugNose", { diameter: 0.10, segments: 5 }, scene);
  nose.position.set(0, 0.89, 0.80);  nose.material = black;  nose.parent = root;

  const leftEye = MeshBuilder.CreateSphere("pugLeftEye", { diameter: 0.13, segments: 5 }, scene);
  leftEye.position.set(-0.17, 0.96, 0.68);  leftEye.material = eyeMat;  leftEye.parent = root;

  const rightEye = MeshBuilder.CreateSphere("pugRightEye", { diameter: 0.13, segments: 5 }, scene);
  rightEye.position.set(0.17, 0.96, 0.68);  rightEye.material = eyeMat;  rightEye.parent = root;

  const leftEar = MeshBuilder.CreateSphere("pugLeftEar", { diameter: 0.28, segments: 5 }, scene);
  leftEar.scaling.set(0.9, 0.34, 0.9);
  leftEar.position.set(-0.30, 1.10, 0.38);  leftEar.rotation.z = 0.42;
  leftEar.material = black;  leftEar.parent = root;

  const rightEar = MeshBuilder.CreateSphere("pugRightEar", { diameter: 0.28, segments: 5 }, scene);
  rightEar.scaling.set(0.9, 0.34, 0.9);
  rightEar.position.set(0.30, 1.10, 0.38);  rightEar.rotation.z = -0.42;
  rightEar.material = black;  rightEar.parent = root;

  // Ear pivots — sit at each ear's attachment point so they can flop independently.
  // setParent preserves world position, so the ear ends up at local (0,0,0) on its pivot.
  const leftEarPivot = new TransformNode("pugLeftEarPiv", scene);
  leftEarPivot.position.set(-0.30, 1.10, 0.38);
  leftEarPivot.parent = root;
  leftEar.setParent(leftEarPivot);

  const rightEarPivot = new TransformNode("pugRightEarPiv", scene);
  rightEarPivot.position.set(0.30, 1.10, 0.38);
  rightEarPivot.parent = root;
  rightEar.setParent(rightEarPivot);

  // Head pivot at neck — group lets nod & roll carry all head parts together
  const headPivot = new TransformNode("pugHeadPivot", scene);
  headPivot.position.set(0, 0.85, 0.42);
  headPivot.parent = root;
  for (const m of [head, mask, snout, nose, leftEye, rightEye, leftEarPivot, rightEarPivot]) {
    m.setParent(headPivot);
  }

  // ── Tail ──────────────────────────────────────────────────────
  const tail = MeshBuilder.CreateTorus("pugTail", { diameter: 0.28, thickness: 0.10, tessellation: 14 }, scene);
  tail.position.set(0, 0.74, -0.52);
  tail.rotation.x = 0.6;
  tail.material   = fawn;
  tail.parent     = root;

  const tailPivot = new TransformNode("pugTailPivot", scene);
  tailPivot.position.set(0, 0.68, -0.44);
  tailPivot.parent = root;
  tail.setParent(tailPivot);

  // ── Two-segment jointed legs ───────────────────────────────────
  //
  //  pivot (hip/shoulder)
  //    └─ upper cylinder  (slightly tapered)
  //    └─ joint TransformNode   ← elbow / knee
  //         └─ joint ball  (tonal sphere, makes bend visible)
  //         └─ lower cylinder  (slightly thinner)
  //         └─ paw sphere
  //
  // Front legs: narrower, lighter build (shoulder mechanics)
  // Back legs:  chunkier thigh, larger joint ball (hip / hock mechanics)

  function makeLeg(
    id:        string,
    x:         number,
    z:         number,
    upperTopD: number,   // top diameter of upper segment
    upperBotD: number,   // bottom diameter of upper segment
    lowerD:    number,   // diameter of lower segment
    jointD:    number,   // diameter of joint ball
  ): LegPair {
    const UPPER = 0.22;
    const LOWER = 0.22;

    const pivot = new TransformNode(`${id}Piv`, scene);
    pivot.position.set(x, 0.44, z);
    pivot.parent = root;

    // Upper segment — tapered for organic look
    const upper = MeshBuilder.CreateCylinder(`${id}U`, {
      height: UPPER, diameterTop: upperTopD, diameterBottom: upperBotD, tessellation: 8,
    }, scene);
    upper.position.y = -UPPER * 0.5;
    upper.material   = fawn;
    upper.parent     = pivot;

    // Joint pivot sits at bottom of upper segment
    const joint = new TransformNode(`${id}J`, scene);
    joint.position.y = -UPPER;
    joint.parent     = pivot;

    // Visible joint ball — subtly darker tone, slightly squashed
    const ball = MeshBuilder.CreateSphere(`${id}JB`, { diameter: jointD, segments: 5 }, scene);
    ball.scaling.set(1.0, 0.84, 1.0);
    ball.material = jointMat;
    ball.parent   = joint;   // sits at joint origin = elbow/knee world position

    // Lower segment — thinner, tapered toward paw
    const lower = MeshBuilder.CreateCylinder(`${id}L`, {
      height: LOWER, diameterTop: lowerD, diameterBottom: lowerD * 0.82, tessellation: 8,
    }, scene);
    lower.position.y = -LOWER * 0.5;
    lower.material   = fawn;
    lower.parent     = joint;

    // Paw
    const paw = MeshBuilder.CreateSphere(`${id}P`, { diameter: 0.22, segments: 5 }, scene);
    paw.scaling.set(1.0, 0.55, 1.2);
    paw.position.y = -LOWER;
    paw.material   = dark;
    paw.parent     = joint;

    return { pivot, joint };
  }

  return {
    root, body, headPivot, tailPivot, leftEarPivot, rightEarPivot,
    frontLeft:  makeLeg("pugFL", -0.28,  0.30, 0.19, 0.16, 0.15, 0.19),
    frontRight: makeLeg("pugFR",  0.28,  0.30, 0.19, 0.16, 0.15, 0.19),
    backLeft:   makeLeg("pugBL", -0.28, -0.28, 0.20, 0.17, 0.15, 0.21),
    backRight:  makeLeg("pugBR",  0.28, -0.28, 0.20, 0.17, 0.15, 0.21),
  };
}
