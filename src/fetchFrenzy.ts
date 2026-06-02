import { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { groundHeight } from "./environment";

// ── Constants ──────────────────────────────────────────────────────────────────
const CATCH_RADIUS    = 1.8;
const RETURN_RADIUS   = 2.8;
const BASE_DESPAWN    = 12;    // seconds before uncaught ring vanishes
const BETWEEN_ROUNDS  = 2.2;   // seconds between rounds

const OWNER_SLOTS: [number, number][] = [
  [ 52,   0], [-52,   0], [  0,  52], [  0, -52],
  [ 38,  38], [-38,  38], [ 38, -38], [-38, -38],
];

const SHIRT_COLORS = [
  new Color3(0.92, 0.18, 0.18),
  new Color3(0.18, 0.55, 0.95),
  new Color3(0.18, 0.82, 0.32),
  new Color3(0.95, 0.72, 0.08),
  new Color3(0.75, 0.18, 0.95),
];

const RING_COLORS = [
  new Color3(1.0, 0.45, 0.0),
  new Color3(0.0, 0.85, 1.0),
  new Color3(1.0, 0.15, 0.75),
  new Color3(0.45, 1.0, 0.0),
];

// ── Types ──────────────────────────────────────────────────────────────────────
type OwnerState = 'spawning' | 'windingUp' | 'throwing' | 'waiting' | 'celebrating' | 'leaving';
type RingState  = 'arc' | 'ground' | 'carried' | 'despawning';

interface OwnerNPC {
  root:        TransformNode;
  armPivot:    TransformNode;
  idleClock:   number;
  state:       OwnerState;
  stateT:      number;
  ringLaunched: boolean;
  throwOrigin: Vector3;
  returnPos:   Vector3;
  colorIdx:    number;
}

interface FetchRing {
  mesh:          Mesh;
  mat:           StandardMaterial;
  state:         RingState;
  arcT:          number;
  arcStart:      Vector3;
  arcEnd:        Vector3;
  arcHeight:     number;
  arcDuration:   number;
  despawnTimer:  number;
  maxDespawn:    number;   // cached at spawn time — avoids recomputing per frame
  landTime:      number;   // timestamp when ring hit the ground
  owner:         OwnerNPC;
}

// ── Game state ─────────────────────────────────────────────────────────────────
let score         = 0;
let combo         = 0;
let highScore     = parseInt(localStorage.getItem("pugglesHighScore") ?? "0");
let catchCount    = 0;
let roundPhase:   'idle' | 'active' | 'cooldown' = 'idle';
let roundTimer    = BETWEEN_ROUNDS;
let activeOwner:  OwnerNPC | null = null;
let activeRing:   FetchRing | null = null;

// ── Helpers ────────────────────────────────────────────────────────────────────
function pickLandingSpot(): Vector3 {
  for (let i = 0; i < 30; i++) {
    const angle = Math.random() * Math.PI * 2;
    const r     = 6 + Math.random() * 20;
    const lx    = Math.cos(angle) * r;
    const lz    = Math.sin(angle) * r;
    if (Math.abs(lx) > 54 || Math.abs(lz) > 54) continue;
    const pdx = lx - 22, pdz = lz - 18;
    if (pdx * pdx + pdz * pdz < 90) continue;        // skip pond
    return new Vector3(lx, groundHeight(lx, lz) + 0.14, lz);
  }
  return new Vector3(8, groundHeight(8, 8) + 0.14, 8);
}

const _arcTmp = new Vector3();
function arcPos(start: Vector3, end: Vector3, height: number, t: number): Vector3 {
  _arcTmp.x = start.x + (end.x - start.x) * t;
  _arcTmp.y = start.y + (end.y - start.y) * t + height * Math.sin(Math.PI * t);
  _arcTmp.z = start.z + (end.z - start.z) * t;
  return _arcTmp;
}

function despawnTime(): number {
  return Math.max(6, BASE_DESPAWN - Math.floor(catchCount / 4));
}

// ── Owner builder ──────────────────────────────────────────────────────────────
function buildOwner(scene: Scene, x: number, z: number, colorIdx: number): OwnerNPC {
  const gy      = groundHeight(x, z);
  const facingY = Math.atan2(-x, -z);   // face toward park centre
  const fwdX    = Math.sin(facingY);
  const fwdZ    = Math.cos(facingY);

  const shirt = new StandardMaterial(`oShirt_${colorIdx}`, scene);
  shirt.diffuseColor = SHIRT_COLORS[colorIdx % SHIRT_COLORS.length];
  const skin  = new StandardMaterial(`oSkin_${colorIdx}`, scene);
  skin.diffuseColor  = new Color3(0.90, 0.73, 0.58);
  const pants = new StandardMaterial(`oPants_${colorIdx}`, scene);
  pants.diffuseColor = new Color3(0.24, 0.24, 0.44);
  const hair  = new StandardMaterial(`oHair_${colorIdx}`, scene);
  hair.diffuseColor  = new Color3(0.22, 0.15, 0.10);

  const root = new TransformNode(`owner_${colorIdx}`, scene);
  root.position.set(x, gy, z);
  root.rotation.y = facingY;
  root.scaling.setAll(0.001);  // starts invisible, pops in

  // Legs
  for (const ox of [-0.13, 0.13]) {
    const leg = MeshBuilder.CreateCylinder(`oLeg`, { height: 0.56, diameter: 0.20, tessellation: 7 }, scene);
    leg.position.set(ox, 0.28, 0);
    leg.material = pants;
    leg.parent   = root;
  }
  // Torso
  const torso = MeshBuilder.CreateBox(`oTorso`, { width: 0.54, height: 0.62, depth: 0.30 }, scene);
  torso.position.y = 0.87;
  torso.material   = shirt;
  torso.parent     = root;
  // Head
  const head = MeshBuilder.CreateSphere(`oHead`, { diameter: 0.40, segments: 7 }, scene);
  head.position.y  = 1.40;
  head.material    = skin;
  head.parent      = root;
  // Hair
  const hairMesh = MeshBuilder.CreateSphere(`oHairM`, { diameter: 0.42, segments: 6 }, scene);
  hairMesh.scaling.set(1, 0.52, 1);
  hairMesh.position.y = 1.52;
  hairMesh.material   = hair;
  hairMesh.parent     = root;
  // Left arm (static)
  const lArm = MeshBuilder.CreateCylinder(`oLArm`, { height: 0.55, diameter: 0.13, tessellation: 6 }, scene);
  lArm.position.set(-0.34, 1.06, 0);
  lArm.rotation.z = 0.22;
  lArm.material   = shirt;
  lArm.parent     = root;
  // Throwing arm: pivot at shoulder
  const armPivot = new TransformNode(`oArmPiv_${colorIdx}`, scene);
  armPivot.position.set(0.34, 1.18, 0);
  armPivot.parent = root;
  const uArm = MeshBuilder.CreateCylinder(`oUArm`, { height: 0.28, diameter: 0.14, tessellation: 6 }, scene);
  uArm.position.y = -0.14;
  uArm.material   = shirt;
  uArm.parent     = armPivot;
  const lArmR = MeshBuilder.CreateCylinder(`oLArmR`, { height: 0.26, diameter: 0.12, tessellation: 6 }, scene);
  lArmR.position.y = -0.41;
  lArmR.material   = skin;
  lArmR.parent     = armPivot;

  const throwOrigin = new Vector3(x + fwdX * 0.4, gy + 1.7, z + fwdZ * 0.4);
  const returnPos   = new Vector3(x + fwdX * 2.2, gy,       z + fwdZ * 2.2);

  return { root, armPivot, idleClock: 0, state: 'spawning', stateT: 0, ringLaunched: false, throwOrigin, returnPos, colorIdx };
}

// ── Ring builder ───────────────────────────────────────────────────────────────
function spawnRing(scene: Scene, owner: OwnerNPC, colorIdx: number): FetchRing {
  const mat = new StandardMaterial(`ring_mat_${Date.now()}`, scene);
  const col = RING_COLORS[colorIdx % RING_COLORS.length];
  mat.diffuseColor  = col;
  mat.emissiveColor = col.scale(0.5);
  mat.backFaceCulling = false;

  const mesh = MeshBuilder.CreateTorus(`ring_${Date.now()}`, { diameter: 0.7, thickness: 0.12, tessellation: 28 }, scene);
  mesh.material   = mat;
  mesh.isPickable = false;
  mesh.position.copyFrom(owner.throwOrigin);

  const end = pickLandingSpot();
  const dt  = despawnTime();
  return {
    mesh, mat,
    state:       'arc',
    arcT:        0,
    arcStart:    owner.throwOrigin.clone(),
    arcEnd:      end,
    arcHeight:   5.5,
    arcDuration: 1.6,
    despawnTimer: dt,
    maxDespawn:   dt,
    landTime:    0,
    owner,
  };
}

// ── Score HUD ──────────────────────────────────────────────────────────────────
function createGameHUD(): {
  updateScore:    (s: number, c: number, h: number) => void;
  showStatus:     (msg: string, color?: string) => void;
  startTimer:     (duration: number) => void;
  setTimerColor:  (frac: number) => void;
  hideTimer:      () => void;
} {
  const wrap = document.createElement("div");
  Object.assign(wrap.style, {
    position:      "fixed",
    top:           "16px",
    left:          "16px",
    pointerEvents: "none",
    fontFamily:    "system-ui, -apple-system, sans-serif",
    userSelect:    "none",
  });

  const card = document.createElement("div");
  Object.assign(card.style, {
    background:     "rgba(8,12,20,0.62)",
    color:          "#fff",
    padding:        "10px 20px 12px",
    borderRadius:   "20px",
    backdropFilter: "blur(6px)",
    border:         "1px solid rgba(255,255,255,0.16)",
    minWidth:       "130px",
  });
  card.innerHTML = `
    <div style="font-size:9px;letter-spacing:3px;opacity:.55;margin-bottom:2px">SCORE</div>
    <div id="fz-score" style="font-size:28px;font-weight:800;letter-spacing:1px">0</div>
    <div id="fz-combo" style="font-size:11px;letter-spacing:1.5px;margin-top:4px;opacity:.80">COMBO ×1</div>
    <div id="fz-best"  style="font-size:9px;letter-spacing:2px;opacity:.45;margin-top:3px">BEST ${highScore.toLocaleString()}</div>
  `;

  const status = document.createElement("div");
  Object.assign(status.style, {
    marginTop:    "8px",
    background:   "rgba(8,12,20,0.55)",
    color:        "#fff",
    padding:      "5px 14px 6px",
    borderRadius: "14px",
    fontSize:     "12px",
    letterSpacing:"1px",
    textAlign:    "center",
    transition:   "opacity .3s",
    display:      "none",
  });

  // Inject CSS keyframes once — the animation runs entirely on the GPU,
  // no JS writes to the DOM during the render loop.
  const kfStyle = document.createElement("style");
  kfStyle.textContent = `
    @keyframes fz-drain { from { transform:scaleX(1); } to { transform:scaleX(0); } }
  `;
  document.head.appendChild(kfStyle);

  const timerBar = document.createElement("div");
  Object.assign(timerBar.style, {
    marginTop:    "8px",
    height:       "5px",
    borderRadius: "3px",
    background:   "rgba(255,255,255,0.15)",
    display:      "none",
    overflow:     "hidden",
  });
  const timerFill = document.createElement("div");
  Object.assign(timerFill.style, {
    height:          "100%",
    width:           "100%",
    borderRadius:    "3px",
    transformOrigin: "left center",
    background:      "#44dd66",
  });
  timerBar.appendChild(timerFill);

  // Track the last color phase so we only write background on threshold crossings
  let timerColorPhase = 0;

  wrap.appendChild(card);
  wrap.appendChild(status);
  wrap.appendChild(timerBar);
  document.body.appendChild(wrap);

  let statusTimeout = 0;

  return {
    updateScore(s, c, h) {
      (card.querySelector("#fz-score") as HTMLElement).textContent = s.toLocaleString();
      (card.querySelector("#fz-combo") as HTMLElement).textContent = `COMBO ×${c}`;
      (card.querySelector("#fz-best")  as HTMLElement).textContent = `BEST ${h.toLocaleString()}`;
    },
    showStatus(msg, color = "#fff") {
      status.style.display = "block";
      status.style.opacity = "1";
      status.style.color   = color;
      status.textContent   = msg;
      clearTimeout(statusTimeout);
      statusTimeout = window.setTimeout(() => { status.style.opacity = "0"; }, 2000);
    },
    startTimer(duration: number) {
      timerColorPhase = 0;
      timerFill.style.background = "#44dd66";
      // Restart the CSS animation: clear it, force a reflow, then re-apply.
      timerFill.style.animation = "none";
      timerFill.offsetHeight;   // eslint-disable-line @typescript-eslint/no-unused-expressions
      timerFill.style.animation = `fz-drain ${duration}s linear forwards`;
      timerBar.style.display = "block";
    },
    // Called only at the two color-threshold crossings per ring — not per frame
    setTimerColor(frac: number) {
      if (frac <= 0.25 && timerColorPhase < 2) {
        timerColorPhase = 2;
        timerFill.style.background = "#ff4422";
      } else if (frac <= 0.5 && timerColorPhase < 1) {
        timerColorPhase = 1;
        timerFill.style.background = "#ffcc22";
      }
    },
    hideTimer() {
      timerFill.style.animation = "none";
      if (timerBar.style.display !== "none") timerBar.style.display = "none";
    },
  };
}

// ── Main entry ─────────────────────────────────────────────────────────────────
export function startFetchFrenzy(scene: Scene, pugRoot: TransformNode): void {
  const hud = createGameHUD();
  hud.updateScore(0, 1, highScore);
  hud.showStatus("FETCH FRENZY — run to the ring!", "#ffdd44");

  let colorCursor = Math.floor(Math.random() * SHIRT_COLORS.length);

  function startRound() {
    // Pick a random owner slot far from pug
    const candidates = OWNER_SLOTS.filter(([x, z]) => {
      const dx = x - pugRoot.position.x, dz = z - pugRoot.position.z;
      return dx * dx + dz * dz > 400;
    });
    const slot = candidates.length
      ? candidates[Math.floor(Math.random() * candidates.length)]
      : OWNER_SLOTS[Math.floor(Math.random() * OWNER_SLOTS.length)];

    colorCursor = (colorCursor + 1) % SHIRT_COLORS.length;
    activeOwner = buildOwner(scene, slot[0], slot[1], colorCursor);
    activeRing  = null;
    roundPhase  = 'active';
    hud.showStatus("INCOMING!", "#ffdd44");
  }

  function cleanupRound(missed: boolean) {
    if (missed) {
      combo = 0;
      hud.showStatus("MISSED! Combo reset.", "#ff6644");
    }
    if (activeRing) {
      activeRing.mesh.dispose();
      activeRing.mat.dispose();
      activeRing = null;
    }
    if (activeOwner) {
      activeOwner.state = 'leaving';
      activeOwner.stateT = 0;
    }
    hud.hideTimer();
    roundPhase = 'cooldown';
    roundTimer = BETWEEN_ROUNDS;
  }

  function doScore(ring: FetchRing) {
    const elapsed = (Date.now() - ring.landTime) / 1000;
    const speedMult = elapsed < 4 ? 5 : elapsed < 7 ? 4 : elapsed < 10 ? 3 : elapsed < 14 ? 2 : 1;
    combo++;
    catchCount++;
    const comboMult = Math.min(combo, 10);
    const gained    = 100 * speedMult * comboMult;
    score += gained;
    if (score > highScore) {
      highScore = score;
      localStorage.setItem("pugglesHighScore", String(highScore));
    }
    hud.updateScore(score, combo, highScore);
    hud.showStatus(`+${gained.toLocaleString()}  ×${speedMult} Speed  ×${comboMult} Combo`, "#44ffaa");
    ring.owner.state  = 'celebrating';
    ring.owner.stateT = 0;
    ring.mesh.dispose();
    ring.mat.dispose();
    activeRing = null;
    hud.hideTimer();
    roundPhase = 'cooldown';
    roundTimer = BETWEEN_ROUNDS + 0.8;  // slightly longer to enjoy the celebration
  }

  scene.onBeforeRenderObservable.add(() => {
    const dt  = scene.getEngine().getDeltaTime() / 1000;
    const now = Date.now();

    // ── Round state machine ──────────────────────────────────────────────────
    if (roundPhase === 'idle') {
      roundTimer -= dt;
      if (roundTimer <= 0) startRound();
    } else if (roundPhase === 'cooldown') {
      roundTimer -= dt;
      if (roundTimer <= 0 && (!activeOwner || activeOwner.state === 'leaving' || activeOwner.stateT > 0.5)) {
        roundPhase = 'idle';
        roundTimer = 0.5;
      }
    }

    // ── Owner animation ──────────────────────────────────────────────────────
    if (activeOwner) {
      const o = activeOwner;
      o.stateT    += dt;
      o.idleClock += dt;

      switch (o.state) {
        case 'spawning':
          o.root.scaling.setAll(Math.min(o.stateT / 0.45, 1));
          if (o.stateT >= 0.45) { o.state = 'windingUp'; o.stateT = 0; }
          break;

        case 'windingUp': {
          const t = Math.min(o.stateT / 0.55, 1);
          o.armPivot.rotation.x = -1.6 * t;
          if (o.stateT >= 0.55) { o.state = 'throwing'; o.stateT = 0; }
          break;
        }

        case 'throwing': {
          const t = Math.min(o.stateT / 0.18, 1);
          o.armPivot.rotation.x = -1.6 + 2.8 * t;
          // Launch ring when arm passes midpoint
          if (!o.ringLaunched && o.stateT >= 0.05) {
            o.ringLaunched = true;
            activeRing = spawnRing(scene, o, colorCursor);
            hud.showStatus("FETCH!", "#ffdd44");
          }
          if (o.stateT >= 0.18) { o.state = 'waiting'; o.stateT = 0; }
          break;
        }

        case 'waiting':
          o.armPivot.rotation.x = 0.35 + Math.sin(o.idleClock * 1.8) * 0.18;
          break;

        case 'celebrating': {
          const t = o.stateT / 0.9;
          o.armPivot.rotation.x = -1.0 * Math.sin(t * Math.PI * 3.5);
          // Bounce body
          o.root.position.y = groundHeight(o.root.position.x, o.root.position.z)
            + Math.max(0, Math.sin(t * Math.PI * 4) * 0.12);
          if (o.stateT >= 0.9) { o.state = 'leaving'; o.stateT = 0; }
          break;
        }

        case 'leaving': {
          const s = Math.max(0, 1 - o.stateT / 0.4);
          o.root.scaling.setAll(s);
          if (o.stateT >= 0.5) {
            // Dispose materials to prevent accumulation across rounds
            o.root.getChildMeshes().forEach(m => m.material?.dispose());
            o.root.dispose();
            activeOwner = null;
          }
          break;
        }
      }
    }

    // ── Ring animation ───────────────────────────────────────────────────────
    if (activeRing) {
      const r = activeRing;

      switch (r.state) {
        case 'arc': {
          r.arcT += dt / r.arcDuration;
          const t = Math.min(r.arcT, 1);
          r.mesh.position.copyFrom(arcPos(r.arcStart, r.arcEnd, r.arcHeight, t));
          // Spin like a frisbee while in flight
          r.mesh.rotation.y += dt * 6;
          if (r.arcT >= 1) {
            r.state        = 'ground';
            r.landTime     = Date.now();
            r.despawnTimer = despawnTime();
            r.mesh.rotation.x = 0;
            hud.startTimer(r.maxDespawn);   // CSS animation — no JS per frame
            hud.showStatus("FETCH!", "#ffdd44");
          }
          break;
        }

        case 'ground': {
          r.despawnTimer -= dt;
          // Bob gently
          r.mesh.position.y = r.arcEnd.y + Math.sin(now * 0.003) * 0.06;
          r.mesh.rotation.y += dt * 1.8;
          // Colour: green → yellow → red
          const urgency = 1 - Math.max(0, r.despawnTimer) / r.maxDespawn;
          r.mat.emissiveColor.r = Math.min(1, urgency * 2);
          r.mat.emissiveColor.g = Math.max(0, 1 - urgency * 1.2);
          r.mat.emissiveColor.b = 0;
          // Pulse faster when urgent
          if (r.despawnTimer < 3) {
            const pulse = (Math.sin(now * 0.018 * (4 - r.despawnTimer)) + 1) * 0.5;
            r.mesh.scaling.setAll(0.8 + pulse * 0.4);
          }
          // Only write to DOM at the two color crossings — not every frame
          hud.setTimerColor(Math.max(0, r.despawnTimer) / r.maxDespawn);

          // Check catch
          const dx = r.mesh.position.x - pugRoot.position.x;
          const dz = r.mesh.position.z - pugRoot.position.z;
          if (dx * dx + dz * dz < CATCH_RADIUS * CATCH_RADIUS) {
            r.state = 'carried';
            r.mesh.scaling.setAll(0.85);
            r.mat.emissiveColor = new Color3(0.2, 1.0, 0.3);
            hud.hideTimer();
            hud.showStatus("RETURN TO OWNER!", "#44ffaa");
          }
          // Despawn
          if (r.despawnTimer <= 0) {
            r.state = 'despawning';
            hud.showStatus("TOO SLOW!", "#ff4422");
            cleanupRound(true);
          }
          break;
        }

        case 'carried':
          // Ring floats above pug as a halo
          r.mesh.position.set(
            pugRoot.position.x,
            pugRoot.position.y + 1.85,
            pugRoot.position.z,
          );
          r.mesh.rotation.y += dt * 2.5;

          // Check return to owner
          if (activeOwner && activeOwner.state === 'waiting') {
            const rp = activeOwner.returnPos;
            const dx = pugRoot.position.x - rp.x;
            const dz = pugRoot.position.z - rp.z;
            if (dx * dx + dz * dz < RETURN_RADIUS * RETURN_RADIUS) {
              doScore(r);
            }
          }
          break;

        case 'despawning':
          break;
      }
    }
  });
}
