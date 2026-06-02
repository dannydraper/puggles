import { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { PhysicsCharacterController, CharacterSupportedState } from "@babylonjs/core/Physics/v2/characterController";
import { groundHeight } from "./environment";

const GRAVITY = 9.81;

// Capsule shared by all dog agents — small enough for the shortest breed (Dachshund)
const DOG_CAP_RADIUS = 0.28;
const DOG_CAP_HEIGHT = 0.36;
const DOG_CAP_OFFSET = DOG_CAP_RADIUS + DOG_CAP_HEIGHT / 2;  // 0.46 — centre to feet

// ── Breed definitions ──────────────────────────────────────────────────────────

interface BreedDef {
  name: string;
  bodyColor: Color3;
  accentColor: Color3;
  legHeight: number;
  legThick: number;
  bodyX: number; bodyY: number; bodyZ: number;
  headSize: number;
  snoutOut: number;
  earType: "floppy" | "pointy";
  earW: number; earH: number;
  tailType: "curly" | "straight" | "stub";
  hasSpots: boolean;
  speed: number;   // units per second
  spawnX: number; spawnZ: number;
}

const BREEDS: BreedDef[] = [
  {
    name: "Dachshund",
    bodyColor: new Color3(0.55, 0.28, 0.08), accentColor: new Color3(0.66, 0.42, 0.20),
    legHeight: 0.26, legThick: 0.13,
    bodyX: 0.70, bodyY: 0.58, bodyZ: 2.00,
    headSize: 0.50, snoutOut: 0.28,
    earType: "floppy", earW: 0.22, earH: 0.34,
    tailType: "straight", hasSpots: false, speed: 2.6,
    spawnX: -14, spawnZ: 6,
  },
  {
    name: "Dalmatian",
    bodyColor: new Color3(0.96, 0.95, 0.94), accentColor: new Color3(0.96, 0.95, 0.94),
    legHeight: 0.56, legThick: 0.16,
    bodyX: 0.90, bodyY: 0.88, bodyZ: 1.12,
    headSize: 0.64, snoutOut: 0.38,
    earType: "floppy", earW: 0.24, earH: 0.30,
    tailType: "straight", hasSpots: true, speed: 4.0,
    spawnX: 10, spawnZ: -18,
  },
  {
    name: "Golden",
    bodyColor: new Color3(0.88, 0.64, 0.22), accentColor: new Color3(0.94, 0.78, 0.40),
    legHeight: 0.52, legThick: 0.18,
    bodyX: 0.95, bodyY: 0.86, bodyZ: 1.20,
    headSize: 0.70, snoutOut: 0.38,
    earType: "floppy", earW: 0.28, earH: 0.34,
    tailType: "straight", hasSpots: false, speed: 3.5,
    spawnX: 14, spawnZ: 22,
  },
  {
    name: "Corgi",
    bodyColor: new Color3(0.88, 0.60, 0.22), accentColor: new Color3(0.94, 0.88, 0.78),
    legHeight: 0.28, legThick: 0.16,
    bodyX: 0.88, bodyY: 0.70, bodyZ: 1.18,
    headSize: 0.72, snoutOut: 0.30,
    earType: "pointy", earW: 0.20, earH: 0.34,
    tailType: "stub", hasSpots: false, speed: 3.3,
    spawnX: -20, spawnZ: -8,
  },
  {
    name: "Husky",
    bodyColor: new Color3(0.52, 0.56, 0.64), accentColor: new Color3(0.92, 0.90, 0.88),
    legHeight: 0.52, legThick: 0.18,
    bodyX: 0.94, bodyY: 0.90, bodyZ: 1.16,
    headSize: 0.72, snoutOut: 0.36,
    earType: "pointy", earW: 0.20, earH: 0.32,
    tailType: "straight", hasSpots: false, speed: 4.2,
    spawnX: 4, spawnZ: -22,
  },
  {
    name: "Beagle",
    bodyColor: new Color3(0.72, 0.48, 0.22), accentColor: new Color3(0.14, 0.11, 0.09),
    legHeight: 0.40, legThick: 0.16,
    bodyX: 0.82, bodyY: 0.78, bodyZ: 1.05,
    headSize: 0.65, snoutOut: 0.34,
    earType: "floppy", earW: 0.28, earH: 0.36,
    tailType: "straight", hasSpots: false, speed: 3.1,
    spawnX: -24, spawnZ: 20,
  },
  {
    name: "Poodle",
    bodyColor: new Color3(0.94, 0.90, 0.84), accentColor: new Color3(0.94, 0.90, 0.84),
    legHeight: 0.56, legThick: 0.13,
    bodyX: 0.76, bodyY: 0.82, bodyZ: 0.96,
    headSize: 0.85, snoutOut: 0.32,
    earType: "floppy", earW: 0.30, earH: 0.38,
    tailType: "curly", hasSpots: false, speed: 2.9,
    spawnX: 24, spawnZ: -20,
  },
  {
    name: "BlackLab",
    bodyColor: new Color3(0.10, 0.09, 0.09), accentColor: new Color3(0.15, 0.13, 0.10),
    legHeight: 0.50, legThick: 0.20,
    bodyX: 1.02, bodyY: 0.92, bodyZ: 1.20,
    headSize: 0.74, snoutOut: 0.38,
    earType: "floppy", earW: 0.28, earH: 0.30,
    tailType: "straight", hasSpots: false, speed: 3.6,
    spawnX: 30, spawnZ: 8,
  },
  {
    name: "Greyhound",
    bodyColor: new Color3(0.62, 0.60, 0.56), accentColor: new Color3(0.75, 0.72, 0.68),
    legHeight: 0.66, legThick: 0.12,
    bodyX: 0.68, bodyY: 0.96, bodyZ: 1.32,
    headSize: 0.54, snoutOut: 0.55,
    earType: "floppy", earW: 0.18, earH: 0.22,
    tailType: "straight", hasSpots: false, speed: 5.4,
    spawnX: -30, spawnZ: -22,
  },
  {
    name: "Collie",
    bodyColor: new Color3(0.12, 0.10, 0.10), accentColor: new Color3(0.94, 0.90, 0.86),
    legHeight: 0.50, legThick: 0.17,
    bodyX: 0.88, bodyY: 0.85, bodyZ: 1.18,
    headSize: 0.68, snoutOut: 0.42,
    earType: "pointy", earW: 0.20, earH: 0.30,
    tailType: "straight", hasSpots: false, speed: 3.7,
    spawnX: 20, spawnZ: -26,
  },
];

// ── Mesh builder ───────────────────────────────────────────────────────────────

interface LegPivots {
  fl: TransformNode; fr: TransformNode;
  bl: TransformNode; br: TransformNode;
}

function buildDog(scene: Scene, b: BreedDef): { root: TransformNode; body: Mesh; legs: LegPivots } {
  const bodyMat = new StandardMaterial(`${b.name}_body`, scene);
  bodyMat.diffuseColor = b.bodyColor;
  bodyMat.specularColor = new Color3(0.08, 0.06, 0.05);

  const accentMat = new StandardMaterial(`${b.name}_accent`, scene);
  accentMat.diffuseColor = b.accentColor;
  accentMat.specularColor = new Color3(0.06, 0.05, 0.04);

  const darkMat = new StandardMaterial(`${b.name}_dark`, scene);
  darkMat.diffuseColor = b.bodyColor.scale(0.3);

  const eyeMat = new StandardMaterial(`${b.name}_eye`, scene);
  eyeMat.diffuseColor = new Color3(0.04, 0.04, 0.04);
  eyeMat.emissiveColor = new Color3(0.10, 0.07, 0.03);
  eyeMat.specularColor = new Color3(0.9, 0.9, 0.9);
  eyeMat.specularPower = 64;

  const root = new TransformNode(`${b.name}_root`, scene);

  const bodyY   = b.legHeight + b.bodyY * 0.28;
  const headZ   = b.bodyZ * 0.44;
  const headY   = bodyY + b.bodyY * 0.36;
  const snoutZ  = headZ + b.headSize * 0.42 + b.snoutOut;
  const snoutY  = headY - b.headSize * 0.07;
  const legX    = b.legThick * 0.9 + 0.08;
  const legFZ   =  b.bodyZ * 0.26;
  const legBZ   = -b.bodyZ * 0.26;

  const body = MeshBuilder.CreateSphere(`${b.name}_body`, { diameter: 1.0, segments: 7 }, scene);
  body.scaling.set(b.bodyX, b.bodyY, b.bodyZ);
  body.position.set(0, bodyY, 0);
  body.material = bodyMat;
  body.parent = root;

  if (!b.bodyColor.equals(b.accentColor)) {
    const chest = MeshBuilder.CreateSphere(`${b.name}_chest`, { diameter: 0.55, segments: 5 }, scene);
    chest.scaling.set(b.bodyX * 0.70, b.bodyY * 0.60, 0.55);
    chest.position.set(0, bodyY - b.bodyY * 0.08, b.bodyZ * 0.30);
    chest.material = accentMat;
    chest.parent = root;
  }

  if (b.hasSpots) {
    const spotMat = new StandardMaterial(`${b.name}_spot`, scene);
    spotMat.diffuseColor = new Color3(0.12, 0.10, 0.10);
    const spotPositions: [number, number, number][] = [
      [0.18, bodyY + 0.25, 0.10], [-0.22, bodyY + 0.20, -0.05],
      [0.10, bodyY + 0.22, 0.32], [-0.14, bodyY + 0.18, -0.28],
      [0.25, bodyY + 0.10, -0.15], [-0.08, bodyY + 0.28, 0.20],
    ];
    for (const [sx, sy, sz] of spotPositions) {
      const spot = MeshBuilder.CreateSphere(`${b.name}_spot_${sx}`, { diameter: 0.13, segments: 4 }, scene);
      spot.position.set(sx, sy, sz);
      spot.material = spotMat;
      spot.parent = root;
    }
  }

  const head = MeshBuilder.CreateSphere(`${b.name}_head`, { diameter: b.headSize, segments: 7 }, scene);
  head.position.set(0, headY, headZ);
  head.material = bodyMat;
  head.parent = root;

  const snout = MeshBuilder.CreateSphere(`${b.name}_snout`, { diameter: b.headSize * 0.52, segments: 6 }, scene);
  snout.scaling.set(0.88, 0.68, 0.55 + b.snoutOut * 0.5);
  snout.position.set(0, snoutY, snoutZ);
  snout.material = accentMat;
  snout.parent = root;

  const nose = MeshBuilder.CreateSphere(`${b.name}_nose`, { diameter: b.headSize * 0.18, segments: 5 }, scene);
  nose.position.set(0, snoutY + b.headSize * 0.06, snoutZ + b.headSize * 0.24 + b.snoutOut * 0.2);
  nose.material = darkMat;
  nose.parent = root;

  const eyeD  = b.headSize * 0.18;
  const eyeXO = b.headSize * 0.28;
  const eyeZO = headZ + b.headSize * 0.30;
  const eyeYO = headY + b.headSize * 0.10;
  for (const xSign of [-1, 1]) {
    const eye = MeshBuilder.CreateSphere(`${b.name}_eye_${xSign}`, { diameter: eyeD, segments: 5 }, scene);
    eye.position.set(xSign * eyeXO, eyeYO, eyeZO);
    eye.material = eyeMat;
    eye.parent = root;
  }

  if (b.earType === "floppy") {
    for (const xSign of [-1, 1]) {
      const ear = MeshBuilder.CreateSphere(`${b.name}_ear_${xSign}`, { diameter: b.earW, segments: 5 }, scene);
      ear.scaling.set(1.0, 0.30, b.earH / b.earW);
      ear.position.set(xSign * (b.headSize * 0.48), headY + b.headSize * 0.15, headZ - b.headSize * 0.10);
      ear.rotation.z = xSign * 0.38;
      ear.material = bodyMat;
      ear.parent = root;
    }
  } else {
    for (const xSign of [-1, 1]) {
      const ear = MeshBuilder.CreateCylinder(`${b.name}_ear_${xSign}`, {
        height: b.earH,
        diameterBottom: b.earW,
        diameterTop: 0.03,
        tessellation: 6,
      }, scene);
      ear.position.set(xSign * (b.headSize * 0.38), headY + b.headSize * 0.36, headZ - b.headSize * 0.08);
      ear.rotation.z = xSign * 0.14;
      ear.material = bodyMat;
      ear.parent = root;
    }
  }

  if (b.tailType === "curly") {
    const tail = MeshBuilder.CreateTorus(`${b.name}_tail`, { diameter: 0.28, thickness: 0.09, tessellation: 12 }, scene);
    tail.position.set(0, bodyY + b.bodyY * 0.12, -b.bodyZ * 0.44);
    tail.rotation.x = 0.55;
    tail.material = bodyMat;
    tail.parent = root;
  } else if (b.tailType === "straight") {
    const tail = MeshBuilder.CreateCylinder(`${b.name}_tail`, { height: b.bodyZ * 0.36, diameter: 0.08, tessellation: 6 }, scene);
    tail.position.set(0, bodyY + b.bodyY * 0.22, -b.bodyZ * 0.50);
    tail.rotation.x = -0.60;
    tail.material = bodyMat;
    tail.parent = root;
  } else {
    const tail = MeshBuilder.CreateSphere(`${b.name}_tail`, { diameter: 0.14, segments: 4 }, scene);
    tail.position.set(0, bodyY + b.bodyY * 0.18, -b.bodyZ * 0.46);
    tail.material = bodyMat;
    tail.parent = root;
  }

  function makeLeg(id: string, x: number, z: number): TransformNode {
    const pivot = new TransformNode(`${b.name}_${id}`, scene);
    pivot.position.set(x, b.legHeight, z);
    pivot.parent = root;

    const cyl = MeshBuilder.CreateCylinder(`${b.name}_${id}_cyl`, {
      height: b.legHeight, diameter: b.legThick, tessellation: 8,
    }, scene);
    cyl.position.y = -b.legHeight * 0.5;
    cyl.material = bodyMat;
    cyl.parent = pivot;

    const paw = MeshBuilder.CreateSphere(`${b.name}_${id}_paw`, { diameter: b.legThick * 1.2, segments: 4 }, scene);
    paw.scaling.set(1.0, 0.55, 1.15);
    paw.position.y = -b.legHeight;
    paw.material = darkMat;
    paw.parent = pivot;

    return pivot;
  }

  const legs: LegPivots = {
    fl: makeLeg("fl", -legX,  legFZ),
    fr: makeLeg("fr",  legX,  legFZ),
    bl: makeLeg("bl", -legX,  legBZ),
    br: makeLeg("br",  legX,  legBZ),
  };

  return { root, body, legs };
}

// ── Wander AI ──────────────────────────────────────────────────────────────────

interface DogAgent {
  root:         TransformNode;
  body:         Mesh;
  legs:         LegPivots;
  breed:        BreedDef;
  cc:           PhysicsCharacterController;
  target:       Vector3;
  state:        "walking" | "paused";
  pauseTimer:   number;
  walkClock:    number;
  gravityVel:   number;
  radius:       number;
  bumpCooldown: number;
}

const POND_X = 22, POND_Z = 18, POND_R2 = 110;

function pickTarget(from: Vector3): Vector3 {
  for (let i = 0; i < 12; i++) {
    const angle = Math.random() * Math.PI * 2;
    const dist  = 8 + Math.random() * 22;
    const x = from.x + Math.cos(angle) * dist;
    const z = from.z + Math.sin(angle) * dist;
    if (Math.abs(x) > 52 || Math.abs(z) > 52) continue;
    const dx = x - POND_X, dz = z - POND_Z;
    if (dx * dx + dz * dz < POND_R2) continue;
    return new Vector3(x, groundHeight(x, z), z);
  }
  const fx = (Math.random() - 0.5) * 30, fz = (Math.random() - 0.5) * 30;
  return new Vector3(fx, groundHeight(fx, fz), fz);
}

const gravity   = new Vector3(0, -GRAVITY, 0);
const downDir   = new Vector3(0, -1, 0);

function updateAgent(a: DogAgent, dt: number): void {
  if (a.bumpCooldown > 0) a.bumpCooldown -= dt;

  if (a.state === "paused") {
    a.pauseTimer -= dt;
    if (a.pauseTimer <= 0) {
      a.target = pickTarget(a.root.position);
      a.state  = "walking";
    }
    // Settle legs to rest
    const damp = 1 - Math.exp(-dt * 8);
    a.legs.fl.rotation.x += (0 - a.legs.fl.rotation.x) * damp;
    a.legs.fr.rotation.x += (0 - a.legs.fr.rotation.x) * damp;
    a.legs.bl.rotation.x += (0 - a.legs.bl.rotation.x) * damp;
    a.legs.br.rotation.x += (0 - a.legs.br.rotation.x) * damp;

    // Let gravity keep the dog on the ground while paused
    const support = a.cc.checkSupport(dt, downDir);
    if (support.supportedState >= CharacterSupportedState.SLIDING) {
      a.gravityVel = 0;
    } else {
      a.gravityVel -= GRAVITY * dt;
    }
    a.cc.setVelocity(new Vector3(0, a.gravityVel, 0));
    a.cc.integrate(dt, support, gravity);
    const p = a.cc.getPosition();
    a.root.position.x = p.x;
    a.root.position.y = p.y - DOG_CAP_OFFSET;
    a.root.position.z = p.z;
    return;
  }

  const dx   = a.target.x - a.root.position.x;
  const dz   = a.target.z - a.root.position.z;
  const dist = Math.sqrt(dx * dx + dz * dz);

  if (dist < 0.6) {
    a.state      = "paused";
    a.pauseTimer = 0.8 + Math.random() * 3.5;
    return;
  }

  // Rotate to face target
  const desired = Math.atan2(dx, dz);
  let   delta   = desired - a.root.rotation.y;
  while (delta >  Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  a.root.rotation.y += delta * Math.min(1, dt * 4);

  // Physics movement
  const support = a.cc.checkSupport(dt, downDir);
  if (support.supportedState >= CharacterSupportedState.SLIDING) {
    a.gravityVel = 0;
  } else {
    a.gravityVel -= GRAVITY * dt;
  }

  const speed  = a.breed.speed;
  const normDx = dx / dist;
  const normDz = dz / dist;

  a.cc.setVelocity(new Vector3(normDx * speed, a.gravityVel, normDz * speed));
  a.cc.integrate(dt, support, gravity);

  const p = a.cc.getPosition();
  a.root.position.x = p.x;
  a.root.position.y = p.y - DOG_CAP_OFFSET;
  a.root.position.z = p.z;

  // Leg animation (diagonal trot)
  a.walkClock += dt * 9;
  const swing = Math.sin(a.walkClock) * 0.42;
  a.legs.fl.rotation.x =  swing;
  a.legs.br.rotation.x =  swing;
  a.legs.fr.rotation.x = -swing;
  a.legs.bl.rotation.x = -swing;

  // Gentle body bob
  a.body.position.y = (a.breed.legHeight + a.breed.bodyY * 0.28)
    + Math.sin(a.walkClock * 2) * 0.012;
}

// ── Public entry point ─────────────────────────────────────────────────────────

export function createAllDogs(scene: Scene): TransformNode[] {
  const agents: DogAgent[] = BREEDS.map((breed) => {
    const { root, body, legs } = buildDog(scene, breed);
    const spawnY = groundHeight(breed.spawnX, breed.spawnZ);
    root.position.set(breed.spawnX, spawnY, breed.spawnZ);

    const cc = new PhysicsCharacterController(
      new Vector3(breed.spawnX, spawnY + DOG_CAP_OFFSET + 0.2, breed.spawnZ),
      { capsuleHeight: DOG_CAP_HEIGHT, capsuleRadius: DOG_CAP_RADIUS },
      scene,
    );

    return {
      root, body, legs, breed, cc,
      target:       pickTarget(root.position),
      state:        "paused" as const,
      pauseTimer:   Math.random() * 2,
      walkClock:    Math.random() * Math.PI * 2,
      gravityVel:   0,
      radius:       breed.bodyX * 0.42 + 0.10,
      bumpCooldown: 0,
    };
  });

  scene.onBeforeRenderObservable.add(() => {
    const dt = scene.getEngine().getDeltaTime() / 1000;

    for (const agent of agents) updateAgent(agent, dt);

    // ── Dog-dog separation (physics CCs don't push each other) ────
    for (let i = 0; i < agents.length; i++) {
      for (let j = i + 1; j < agents.length; j++) {
        const a = agents[i], b = agents[j];
        const dx  = a.root.position.x - b.root.position.x;
        const dz  = a.root.position.z - b.root.position.z;
        const d2  = dx * dx + dz * dz;
        const min = a.radius + b.radius;
        if (d2 < min * min && d2 > 0.0001) {
          const d    = Math.sqrt(d2);
          const push = (min - d) * 0.5 / d;
          const ax   = a.root.position.x + dx * push;
          const az   = a.root.position.z + dz * push;
          const bx   = b.root.position.x - dx * push;
          const bz   = b.root.position.z - dz * push;
          const agy  = groundHeight(ax, az);
          const bgy  = groundHeight(bx, bz);

          a.root.position.set(ax, agy, az);
          b.root.position.set(bx, bgy, bz);
          // PhysicsCharacterController has no public setPosition — write _position directly
          (a.cc as any)._position.set(ax, agy + DOG_CAP_OFFSET, az);
          (b.cc as any)._position.set(bx, bgy + DOG_CAP_OFFSET, bz);

          if (a.state === "walking" && a.bumpCooldown <= 0) {
            a.target = pickTarget(a.root.position);
            a.bumpCooldown = 1.0;
          }
          if (b.state === "walking" && b.bumpCooldown <= 0) {
            b.target = pickTarget(b.root.position);
            b.bumpCooldown = 1.0;
          }
        }
      }
    }
  });

  return agents.map((a) => a.root);
}
