import { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { PhysicsAggregate } from "@babylonjs/core/Physics/v2/physicsAggregate";
import { PhysicsShapeType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin";
import { groundHeight } from "./environment";

// ── Layout ─────────────────────────────────────────────────────────────────────
const GOAL_Z      = 16;         // goal sits on the north leg of the cross-path
const GOAL_HALF   = 2.5;        // half-width of opening
const GOAL_H      = 2.4;        // crossbar height
const GOAL_DEPTH  = 0.7;        // front-to-back depth
const POST_R      = 0.07;
const SPOT_Z      = 4;          // penalty spot
const KEEPER_Z    = GOAL_Z - 0.8;
const KICK_R      = 1.1;        // pug proximity to trigger kick
const KICK_FORCE  = 22;
const BALL_D      = 0.55;
const SAVE_HALF   = 0.90;       // keeper's blocking half-width
const SHOT_TO     = 6;          // seconds before reset if no outcome
const REACT_DELAY = 0.18;       // keeper reaction time after kick detected

// ── Goal ───────────────────────────────────────────────────────────────────────
function buildGoal(scene: Scene): void {
  const gy = groundHeight(0, GOAL_Z);

  const white = new StandardMaterial("goalWhite", scene);
  white.diffuseColor = new Color3(0.96, 0.96, 0.96);
  white.specularColor = new Color3(0.3, 0.3, 0.3);

  const netMat = new StandardMaterial("goalNet", scene);
  netMat.diffuseColor = new Color3(0.9, 0.9, 0.9);
  netMat.alpha = 0.28;
  netMat.backFaceCulling = false;

  function post(name: string, x: number, z: number, h: number) {
    const c = MeshBuilder.CreateCylinder(name, { height: h, diameter: POST_R * 2, tessellation: 10 }, scene);
    c.position.set(x, gy + h / 2, z);
    c.material = white;
    const col = MeshBuilder.CreateBox(name + "Col", { width: POST_R * 2.5, height: h, depth: POST_R * 2.5 }, scene);
    col.position.copyFrom(c.position);
    col.isVisible = false;
    new PhysicsAggregate(col, PhysicsShapeType.BOX, { mass: 0 }, scene);
  }

  function bar(name: string, x1: number, z1: number, x2: number, z2: number, y: number) {
    const cx = (x1 + x2) / 2, cz = (z1 + z2) / 2;
    const len = Math.sqrt((x2 - x1) ** 2 + (z2 - z1) ** 2);
    const angle = Math.atan2(x2 - x1, z2 - z1);
    const c = MeshBuilder.CreateCylinder(name, { height: len, diameter: POST_R * 2, tessellation: 10 }, scene);
    c.rotation.x = Math.PI / 2;
    c.rotation.y = angle;
    c.position.set(cx, gy + y, cz);
    c.material = white;
    const col = MeshBuilder.CreateBox(name + "Col", { width: len, height: POST_R * 2.5, depth: POST_R * 2.5 }, scene);
    col.rotation.copyFrom(c.rotation);
    col.position.copyFrom(c.position);
    col.isVisible = false;
    new PhysicsAggregate(col, PhysicsShapeType.BOX, { mass: 0 }, scene);
  }

  // Front frame
  post("gLP",  -GOAL_HALF, GOAL_Z, GOAL_H);
  post("gRP",   GOAL_HALF, GOAL_Z, GOAL_H);
  bar("gCB",   -GOAL_HALF, GOAL_Z,  GOAL_HALF, GOAL_Z, GOAL_H);
  // Back posts
  post("gLBP", -GOAL_HALF, GOAL_Z + GOAL_DEPTH, GOAL_H);
  post("gRBP",  GOAL_HALF, GOAL_Z + GOAL_DEPTH, GOAL_H);
  // Top side bars
  bar("gLS",   -GOAL_HALF, GOAL_Z, -GOAL_HALF, GOAL_Z + GOAL_DEPTH, GOAL_H);
  bar("gRS",    GOAL_HALF, GOAL_Z,  GOAL_HALF, GOAL_Z + GOAL_DEPTH, GOAL_H);
  // Back crossbar
  bar("gBCB",  -GOAL_HALF, GOAL_Z + GOAL_DEPTH, GOAL_HALF, GOAL_Z + GOAL_DEPTH, GOAL_H);

  // Net backdrop
  const net = MeshBuilder.CreateBox("goalNetMesh", {
    width: GOAL_HALF * 2, height: GOAL_H, depth: 0.04,
  }, scene);
  net.position.set(0, gy + GOAL_H / 2, GOAL_Z + GOAL_DEPTH - 0.02);
  net.material = netMat;

  // Penalty spot marker
  const spot = MeshBuilder.CreateDisc("penaltySpot", { radius: 0.18, tessellation: 16 }, scene);
  spot.rotation.x = Math.PI / 2;
  spot.position.set(0, groundHeight(0, SPOT_Z) + 0.015, SPOT_Z);
  const spotMat = new StandardMaterial("spotMat", scene);
  spotMat.diffuseColor = new Color3(0.95, 0.95, 0.95);
  spot.material = spotMat;
}

// ── Goalkeeper pug ─────────────────────────────────────────────────────────────
interface Keeper {
  root:      TransformNode;
  body:      Mesh;
  headPivot: TransformNode;
  x:         number;
  state:     'idle' | 'reacting' | 'diving' | 'resetting';
  reactT:    number;
  targetX:   number;
  clock:     number;
}

function buildKeeper(scene: Scene): Keeper {
  const gy = groundHeight(0, KEEPER_Z);
  const root = new TransformNode("keeperRoot", scene);
  root.position.set(0, gy, KEEPER_Z);
  root.rotation.y = Math.PI;   // faces south toward player

  const jersey = new StandardMaterial("kjJersey", scene);
  jersey.diffuseColor = new Color3(0.10, 0.72, 0.22);   // goalkeeper green

  const fawn = new StandardMaterial("kjFawn", scene);
  fawn.diffuseColor = new Color3(0.86, 0.72, 0.52);

  const black = new StandardMaterial("kjBlack", scene);
  black.diffuseColor = new Color3(0.12, 0.09, 0.09);

  const eyeMat = new StandardMaterial("kjEye", scene);
  eyeMat.diffuseColor  = new Color3(0.04, 0.04, 0.04);
  eyeMat.emissiveColor = new Color3(0.10, 0.06, 0.02);
  eyeMat.specularColor = new Color3(0.9, 0.9, 0.9);
  eyeMat.specularPower = 64;

  // Body
  const body = MeshBuilder.CreateSphere("kjBody", { diameter: 1.0, segments: 8 }, scene);
  body.scaling.set(0.90, 0.78, 1.12);
  body.position.set(0, 0.54, 0);
  body.material = jersey;
  body.parent   = root;

  // Head pivot
  const headPivot = new TransformNode("kjHeadPivot", scene);
  headPivot.position.set(0, 0.85, 0.42);
  headPivot.parent = root;

  const head = MeshBuilder.CreateSphere("kjHead", { diameter: 0.72, segments: 8 }, scene);
  head.position.set(0, 0.07, 0.02);
  head.material = fawn;
  head.parent   = headPivot;

  const mask = MeshBuilder.CreateSphere("kjMask", { diameter: 0.55, segments: 6 }, scene);
  mask.scaling.set(1.0, 0.76, 0.70);
  mask.position.set(0, 0.03, 0.18);
  mask.material = black;
  mask.parent   = headPivot;

  const nose = MeshBuilder.CreateSphere("kjNose", { diameter: 0.10, segments: 5 }, scene);
  nose.position.set(0, 0.04, 0.38);
  nose.material = black;
  nose.parent   = headPivot;

  for (const xs of [-1, 1]) {
    const eye = MeshBuilder.CreateSphere("kjEye" + xs, { diameter: 0.13, segments: 5 }, scene);
    eye.position.set(xs * 0.17, 0.11, 0.26);
    eye.material = eyeMat;
    eye.parent   = headPivot;

    const ear = MeshBuilder.CreateSphere("kjEar" + xs, { diameter: 0.28, segments: 5 }, scene);
    ear.scaling.set(0.9, 0.34, 0.9);
    ear.position.set(xs * 0.30, 0.25, -0.04);
    ear.rotation.z = xs * 0.42;
    ear.material = black;
    ear.parent   = headPivot;
  }

  // Four stubby legs
  for (const [lx, lz] of [[-0.28, 0.28], [0.28, 0.28], [-0.28, -0.28], [0.28, -0.28]]) {
    const leg = MeshBuilder.CreateCylinder("kjLeg", { height: 0.38, diameter: 0.20, tessellation: 8 }, scene);
    leg.position.set(lx, 0.19, lz);
    leg.material = fawn;
    leg.parent   = root;
  }

  // Tail
  const tail = MeshBuilder.CreateTorus("kjTail", { diameter: 0.28, thickness: 0.10, tessellation: 14 }, scene);
  tail.position.set(0, 0.74, -0.52);
  tail.rotation.x = 0.6;
  tail.material   = fawn;
  tail.parent     = root;

  return { root, body, headPivot, x: 0, state: 'idle', reactT: 0, targetX: 0, clock: 0 };
}

// ── Ball ───────────────────────────────────────────────────────────────────────
interface PenaltyBall { mesh: Mesh; agg: PhysicsAggregate; }

function makeBallMaterials(scene: Scene) {
  const white = new StandardMaterial("pbWhite", scene);
  white.diffuseColor  = new Color3(0.96, 0.94, 0.90);
  white.specularColor = new Color3(0.55, 0.55, 0.55);
  white.specularPower = 48;

  const patch = new StandardMaterial("pbPatch", scene);
  patch.diffuseColor = new Color3(0.08, 0.08, 0.08);

  return { white, patch };
}

function spawnBall(scene: Scene, existingMesh?: Mesh): PenaltyBall {
  const mats = (scene as any).__penaltyBallMats ?? (() => {
    const m = makeBallMaterials(scene);
    (scene as any).__penaltyBallMats = m;
    return m;
  })();

  const gy  = groundHeight(0, SPOT_Z);
  let mesh: Mesh;

  if (existingMesh) {
    mesh = existingMesh;
    mesh.position.set(0, gy + BALL_D / 2 + 0.02, SPOT_Z);
    mesh.rotation.setAll(0);
  } else {
    mesh = MeshBuilder.CreateSphere("penaltyBall", { diameter: BALL_D, segments: 8 }, scene);
    mesh.position.set(0, gy + BALL_D / 2 + 0.02, SPOT_Z);
    mesh.material = mats.white;

    const dirs: [number, number, number][] = [
      [0,1,0],[0,-1,0],[1,0,0],[-1,0,0],[0,0,1],[0,0,-1],
    ];
    dirs.forEach(([dx, dy, dz], i) => {
      const p = MeshBuilder.CreateSphere(`pbPatch${i}`, { diameter: BALL_D * 0.42, segments: 5 }, scene);
      const o = BALL_D * 0.44;
      p.position.set(dx * o, dy * o, dz * o);
      p.scaling.set(1, 0.14, 1);
      p.material = mats.patch;
      p.parent   = mesh;
    });
  }

  const agg = new PhysicsAggregate(mesh, PhysicsShapeType.SPHERE,
    { mass: 0.5, restitution: 0.55, friction: 0.45 }, scene);
  agg.body.setLinearDamping(0.25);
  agg.body.setAngularDamping(0.40);

  return { mesh, agg };
}

// ── Score HUD ──────────────────────────────────────────────────────────────────
function createPenaltyHUD(): {
  setGoals: (n: number) => void;
  flash:    (msg: string, color: string) => void;
} {
  const card = document.createElement("div");
  Object.assign(card.style, {
    position:       "fixed",
    bottom:         "16px",
    left:           "16px",
    background:     "rgba(8,12,20,0.62)",
    color:          "#fff",
    padding:        "8px 18px 10px",
    borderRadius:   "20px",
    border:         "1px solid rgba(255,255,255,0.16)",
    fontFamily:     "system-ui,-apple-system,sans-serif",
    pointerEvents:  "none",
    userSelect:     "none",
    lineHeight:     "1.3",
  });
  card.innerHTML = `
    <div style="font-size:9px;letter-spacing:3px;opacity:.55">PENALTIES</div>
    <div id="pen-goals" style="font-size:26px;font-weight:800;letter-spacing:2px">⚽ 0</div>
  `;
  document.body.appendChild(card);

  const flash = document.createElement("div");
  Object.assign(flash.style, {
    position:   "fixed",
    top:        "50%",
    left:       "50%",
    transform:  "translate(-50%,-50%)",
    fontFamily: "system-ui,-apple-system,sans-serif",
    fontSize:   "56px",
    fontWeight: "900",
    letterSpacing: "4px",
    textShadow: "0 4px 24px rgba(0,0,0,0.7)",
    pointerEvents: "none",
    opacity:    "0",
    transition: "opacity .15s",
    userSelect: "none",
  });
  document.body.appendChild(flash);

  let flashTimeout = 0;

  return {
    setGoals(n) {
      (document.getElementById("pen-goals") as HTMLElement).textContent = `⚽ ${n}`;
    },
    flash(msg, color) {
      flash.textContent = msg;
      flash.style.color   = color;
      flash.style.opacity = "1";
      clearTimeout(flashTimeout);
      flashTimeout = window.setTimeout(() => { flash.style.opacity = "0"; }, 1600);
    },
  };
}

// ── Reusable impulse vector ────────────────────────────────────────────────────
const _kickImpulse = new Vector3();

// ── Main entry ─────────────────────────────────────────────────────────────────
export function startPenalty(scene: Scene, pugRoot: TransformNode): void {
  buildGoal(scene);
  const keeper = buildKeeper(scene);
  const hud    = createPenaltyHUD();

  let ball     = spawnBall(scene);
  let goals    = 0;
  let phase: 'ready' | 'live' | 'outcome' | 'resetting' = 'ready';
  let shotTimer   = 0;
  let resetTimer  = 0;
  let kickCooldown = 0;

  function resetRound() {
    ball.agg.dispose();
    ball = spawnBall(scene, ball.mesh);
    keeper.x       = 0;
    keeper.state   = 'idle';
    keeper.targetX = 0;
    keeper.root.position.x = 0;
    keeper.body.rotation.z = 0;
    keeper.headPivot.rotation.x = 0;
    kickCooldown = 0;
    phase = 'ready';
  }

  scene.onBeforeRenderObservable.add(() => {
    const dt  = scene.getEngine().getDeltaTime() / 1000;
    const bp  = ball.mesh.position;
    keeper.clock += dt;

    // ── Cooldowns ────────────────────────────────────────────────────────────
    if (kickCooldown > 0) kickCooldown -= dt;

    // ── Goalkeeper animation ─────────────────────────────────────────────────
    switch (keeper.state) {
      case 'idle': {
        // Gently track the ball X
        const diff  = bp.x - keeper.x;
        const step  = Math.sign(diff) * Math.min(Math.abs(diff), 1.8 * dt);
        keeper.x    = Math.max(-GOAL_HALF + 0.4, Math.min(GOAL_HALF - 0.4, keeper.x + step));
        keeper.root.position.x = keeper.x;
        // Idle body sway
        keeper.body.rotation.z = Math.sin(keeper.clock * 1.6) * 0.06;
        break;
      }
      case 'reacting':
        keeper.reactT -= dt;
        if (keeper.reactT <= 0) keeper.state = 'diving';
        break;
      case 'diving': {
        const diff = keeper.targetX - keeper.x;
        const step = Math.sign(diff) * Math.min(Math.abs(diff), 6.5 * dt);
        keeper.x   = Math.max(-GOAL_HALF + 0.1, Math.min(GOAL_HALF - 0.1, keeper.x + step));
        keeper.root.position.x = keeper.x;
        // Lean in dive direction
        keeper.body.rotation.z += (-Math.sign(diff) * 0.45 - keeper.body.rotation.z) * (1 - Math.exp(-dt * 12));
        keeper.headPivot.rotation.x += (0.25 - keeper.headPivot.rotation.x) * (1 - Math.exp(-dt * 10));
        break;
      }
      case 'resetting': {
        const diff = -keeper.x;
        const step = Math.sign(diff) * Math.min(Math.abs(diff), 3.5 * dt);
        keeper.x  += step;
        keeper.root.position.x = keeper.x;
        keeper.body.rotation.z += (0 - keeper.body.rotation.z) * (1 - Math.exp(-dt * 6));
        if (Math.abs(keeper.x) < 0.05) { keeper.x = 0; keeper.state = 'idle'; }
        break;
      }
    }

    // ── Kick detection ───────────────────────────────────────────────────────
    if (phase === 'ready' && kickCooldown <= 0) {
      const dx = bp.x - pugRoot.position.x;
      const dz = bp.z - pugRoot.position.z;
      if (dx * dx + dz * dz < KICK_R * KICK_R) {
        const ry = pugRoot.rotation.y;
        _kickImpulse.set(
          Math.sin(ry) * KICK_FORCE,
          KICK_FORCE * 0.15,
          Math.cos(ry) * KICK_FORCE,
        );
        ball.agg.body.applyImpulse(_kickImpulse, bp);

        // Keeper reacts
        const bvx   = ball.agg.body.getLinearVelocity().x;
        const correct = bvx > 0 ? GOAL_HALF * 0.7 : -GOAL_HALF * 0.7;
        const wrong   = -correct;
        keeper.targetX = Math.random() < 0.68 ? correct : wrong;
        keeper.state   = 'reacting';
        keeper.reactT  = REACT_DELAY;

        phase     = 'live';
        shotTimer = SHOT_TO;
        kickCooldown = 1.0;
      }
    }

    // ── Goal / save / miss detection ─────────────────────────────────────────
    if (phase === 'live') {
      shotTimer -= dt;

      // Ball crossed the goal plane
      if (bp.z > GOAL_Z - 0.25 && bp.y < GOAL_H + 0.2 && bp.y > -0.3) {
        if (Math.abs(bp.x) < GOAL_HALF + 0.1) {
          const keeperSaved = Math.abs(bp.x - keeper.x) < SAVE_HALF;
          if (keeperSaved) {
            hud.flash("SAVED! 🧤", "#ff8844");
            keeper.headPivot.rotation.x = -0.35;  // brief head-up celebration
          } else {
            goals++;
            hud.setGoals(goals);
            hud.flash("GOAL! ⚽", "#44ff88");
            keeper.headPivot.rotation.x = 0.35;   // dejected head-down
          }
          phase = 'outcome';
          resetTimer = 2.6;
        }
      }

      // Ball left the play area or timed out — treat as missed
      if (phase === 'live') {
        const missed =
          bp.z < -6 || bp.z > GOAL_Z + 3 ||
          Math.abs(bp.x) > GOAL_HALF + 1.5 ||
          bp.y > GOAL_H + 1.5 ||
          shotTimer <= 0;
        if (missed) {
          hud.flash("MISSED!", "#aaaaaa");
          phase = 'outcome';
          resetTimer = 2.2;
        }
      }
    }

    // ── Reset countdown ───────────────────────────────────────────────────────
    if (phase === 'outcome') {
      resetTimer -= dt;
      if (resetTimer <= 0) {
        resetRound();
        keeper.state = 'resetting';
      }
    }
  });
}
