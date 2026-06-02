import { Scene } from "@babylonjs/core/scene";
import { UniversalCamera } from "@babylonjs/core/Cameras/universalCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { KeyboardEventTypes } from "@babylonjs/core/Events/keyboardEvents";
import { PugParts } from "./pug";
import { groundHeight, pushOutOfObstacles } from "./environment";

const WALK_SPEED    = 0.075;
const TURN_SPEED    = 0.032;
const RUN_MULT      = 2.2;
const CAM_SPRING    = 8;
const CAM_DIST      = 7;
const CAM_HEIGHT    = 3.2;
const BACK_HIP_REST = -0.08;  // back hips tilt slightly back at rest
const BACK_KNEE_REST = 0.24;  // back knees always slightly bent

// Layout constants (must match pug.ts)
const BODY_BASE_Y  = 0.54;
const BODY_BASE_SX = 0.90;
const BODY_BASE_SY = 0.78;
const BODY_BASE_SZ = 1.12;
const LEG_PIVOT_Y  = 0.44;   // pivot rest height for all four legs

export function createPlayer(scene: Scene, pug: PugParts): UniversalCamera {
  const camera = new UniversalCamera("camera", new Vector3(0, CAM_HEIGHT, -CAM_DIST), scene);
  camera.minZ = 0.1;

  const keys = new Set<string>();
  scene.onKeyboardObservable.add((info) => {
    const k = info.event.key.toLowerCase();
    if (info.type === KeyboardEventTypes.KEYDOWN) keys.add(k);
    else keys.delete(k);
  });

  let velocity  = 0;   // current move speed (smoothed)
  let walkClock = 0;   // drives legs, bounce, sway
  let wagClock  = 0;   // independent tail wag — runs even at idle
  let idleClock = 0;   // slow breathing / head-bob at rest

  // Establish rest pose for jointed legs before first frame
  pug.backLeft.joint.rotation.x  = BACK_KNEE_REST;
  pug.backRight.joint.rotation.x = BACK_KNEE_REST;
  pug.backLeft.pivot.rotation.x  = BACK_HIP_REST;
  pug.backRight.pivot.rotation.x = BACK_HIP_REST;

  scene.onBeforeRenderObservable.add(() => {
    const dt = scene.getEngine().getDeltaTime() / 1000;
    const isRunning = keys.has("shift");

    // ── Turning ────────────────────────────────────────────────
    if (keys.has("a") || keys.has("arrowleft"))  pug.root.rotation.y -= TURN_SPEED;
    if (keys.has("d") || keys.has("arrowright")) pug.root.rotation.y += TURN_SPEED;

    // ── Velocity with smooth accel / decel ─────────────────────
    let moveDir = 0;
    if      (keys.has("w") || keys.has("arrowup"))   moveDir =  1;
    else if (keys.has("s") || keys.has("arrowdown")) moveDir = -1;

    const topSpeed   = WALK_SPEED * (isRunning ? RUN_MULT : 1);
    const targetVel  = moveDir !== 0 ? topSpeed : 0;
    const rampFactor = moveDir !== 0
      ? 1 - Math.exp(-dt * 10)   // ease in
      : 1 - Math.exp(-dt * 16);  // ease out slightly faster
    velocity += (targetVel - velocity) * rampFactor;

    const moving     = velocity > 0.001;
    const speedRatio = velocity / WALK_SPEED;   // 0 → ~2.2

    // ── Position ───────────────────────────────────────────────
    const ry   = pug.root.rotation.y;
    const fwdX = Math.sin(ry);
    const fwdZ = Math.cos(ry);
    pug.root.position.x  = Math.max(-58, Math.min(58, pug.root.position.x + fwdX * velocity * moveDir));
    pug.root.position.z  = Math.max(-58, Math.min(58, pug.root.position.z + fwdZ * velocity * moveDir));

    // ── Obstacle collision ────────────────────────────────────
    {
      const [cx, cz, hit] = pushOutOfObstacles(pug.root.position.x, pug.root.position.z, 0.55);
      pug.root.position.x = cx;
      pug.root.position.z = cz;
      if (hit) velocity *= 0.15;  // thud — kill most of the momentum
    }

    // ── Terrain following ─────────────────────────────────────
    const px = pug.root.position.x, pz = pug.root.position.z;
    pug.root.position.y = groundHeight(px, pz);

    // Pitch root to match slope in the forward direction
    const STEP  = 1.0;
    const slope = (groundHeight(px + fwdX * STEP, pz + fwdZ * STEP)
                 - groundHeight(px - fwdX * STEP, pz - fwdZ * STEP)) / (2 * STEP);
    pug.root.rotation.x += (Math.atan(slope) - pug.root.rotation.x) * (1 - Math.exp(-dt * 5));

    // ── Clocks ─────────────────────────────────────────────────
    walkClock += dt * speedRatio * 11;                       // stride rate
    wagClock  += dt * (moving ? (isRunning ? 10 : 6.5) : 2.2); // tail: happy at run, gentle at idle
    idleClock += dt * 1.4;

    // ── Leg swing + joint bend + ground bounce ─────────────────
    const sw      = Math.sin(walkClock);
    const posw    = Math.max(0,  sw);   // positive half — FL / BR swing phase
    const negw    = Math.max(0, -sw);   // negative half — FR / BL swing phase
    const legAmp  = Math.min(speedRatio, 2.0) * (isRunning ? 0.36 : 0.28);
    const legDamp = 1 - Math.exp(-dt * 14);

    // Shoulder / hip pivots — diagonal pairs in opposite phase
    const tFL = moving ?  legAmp * sw + 0 : 0;
    const tFR = moving ? -legAmp * sw + 0 : 0;
    const tBL = moving ? -legAmp * sw + BACK_HIP_REST : BACK_HIP_REST;
    const tBR = moving ?  legAmp * sw + BACK_HIP_REST : BACK_HIP_REST;
    pug.frontLeft.pivot.rotation.x  += (tFL - pug.frontLeft.pivot.rotation.x)  * (moving ? 1 : legDamp);
    pug.frontRight.pivot.rotation.x += (tFR - pug.frontRight.pivot.rotation.x) * (moving ? 1 : legDamp);
    pug.backLeft.pivot.rotation.x   += (tBL - pug.backLeft.pivot.rotation.x)   * legDamp;
    pug.backRight.pivot.rotation.x  += (tBR - pug.backRight.pivot.rotation.x)  * legDamp;

    // Pivot lift — raise the shoulder/hip while the leg is in its swing (airborne) phase.
    // posw > 0 means FL is swinging; negw > 0 means FR is swinging.
    const liftAmp = moving ? Math.min(speedRatio, 2.0) * (isRunning ? 0.13 : 0.08) : 0;
    pug.frontLeft.pivot.position.y  += (LEG_PIVOT_Y + posw * liftAmp        - pug.frontLeft.pivot.position.y)  * legDamp;
    pug.frontRight.pivot.position.y += (LEG_PIVOT_Y + negw * liftAmp        - pug.frontRight.pivot.position.y) * legDamp;
    pug.backLeft.pivot.position.y   += (LEG_PIVOT_Y + negw * liftAmp * 0.85 - pug.backLeft.pivot.position.y)   * legDamp;
    pug.backRight.pivot.position.y  += (LEG_PIVOT_Y + posw * liftAmp * 0.85 - pug.backRight.pivot.position.y)  * legDamp;

    // Elbow bends forward during forward swing phase
    const elbowAmp = Math.min(speedRatio, 2.0) * (isRunning ? 0.52 : 0.38);
    pug.frontLeft.joint.rotation.x  += (posw * elbowAmp - pug.frontLeft.joint.rotation.x)  * legDamp;
    pug.frontRight.joint.rotation.x += (negw * elbowAmp - pug.frontRight.joint.rotation.x) * legDamp;

    // Knee folds further during swing (back knees always slightly bent at rest)
    const kneeFold = Math.min(speedRatio, 2.0) * (isRunning ? 0.58 : 0.44);
    pug.backLeft.joint.rotation.x  += (BACK_KNEE_REST + (moving ? negw * kneeFold : 0) - pug.backLeft.joint.rotation.x)  * legDamp;
    pug.backRight.joint.rotation.x += (BACK_KNEE_REST + (moving ? posw * kneeFold : 0) - pug.backRight.joint.rotation.x) * legDamp;

    // ── Body bounce ────────────────────────────────────────────
    // sin² spends more time near 0 (planted) then pops to peak — push-off feel.
    // Still gives 2 peaks per stride (symmetric to abs-sin but sharper).
    const bounceT     = Math.min(speedRatio, 2.0);
    const bounceCurve = sw * sw;                 // 0→1, 2 peaks per stride, stays near 0 longer
    const bounceAmp  = moving ? bounceT * (isRunning ? 0.080 : 0.058) : 0;
    const breathe    = moving ? 0 : Math.sin(idleClock) * 0.005;
    const targetBodyY = BODY_BASE_Y + bounceCurve * bounceAmp + breathe;
    pug.body.position.y += (targetBodyY - pug.body.position.y) * (1 - Math.exp(-dt * 24));

    // ── Lateral hop — each half-stride pushes opposite direction ──
    // sin(walkClock) alternates sign every half-stride → body hops left then right.
    const lateralAmp  = moving ? bounceT * (isRunning ? 0.055 : 0.032) : 0;
    const targetBodyX = sw * lateralAmp;
    pug.body.position.x += (targetBodyX - pug.body.position.x) * (1 - Math.exp(-dt * 20));

    // ── Squash + stretch on the bounce (subtle) ────────────────
    const squash = bounceCurve * bounceT * 0.028;
    pug.body.scaling.set(
      BODY_BASE_SX * (1 - squash * 0.30),
      BODY_BASE_SY * (1 + squash * 0.55),
      BODY_BASE_SZ * (1 - squash * 0.20),
    );

    // ── Body sway — rolling left/right ─────────────────────────
    const swayAmp    = moving ? bounceT * (isRunning ? 0.052 : 0.034) : 0;
    const targetSway = Math.sin(walkClock) * swayAmp;
    pug.body.rotation.z += (targetSway - pug.body.rotation.z) * (1 - Math.exp(-dt * 18));

    // ── Forward lean — pug leans into the trot ─────────────────
    const leanTarget = moving ? -0.09 * Math.min(speedRatio, 2) : 0;
    pug.body.rotation.x += (leanTarget - pug.body.rotation.x) * (1 - Math.exp(-dt * 7));

    // ── Head nod + roll ────────────────────────────────────────
    // Nod in sync with strides; ears flop because headPivot rolls with body sway.
    const nodAmp  = moving ? Math.min(speedRatio, 2.0) * (isRunning ? 0.10 : 0.065) : 0;
    const idleNod = moving ? 0 : Math.sin(idleClock * 0.6) * 0.016;
    pug.headPivot.rotation.x += (Math.sin(walkClock) * nodAmp + idleNod - pug.headPivot.rotation.x)
                                * (1 - Math.exp(-dt * 20));
    // Head rolls in sympathy with body sway so floppy ears swing outward
    pug.headPivot.rotation.z += (pug.body.rotation.z * 0.75 - pug.headPivot.rotation.z)
                                * (1 - Math.exp(-dt * 20));

    // ── Ear flop ────────────────────────────────────────────────
    // cos(2*walkClock) peaks negative at bounce peaks (inertia: ears lag as body launches up)
    // and positive at bounce troughs (ears swing forward as body drops). ~12° amplitude at walk.
    const earAmp  = moving ? Math.min(speedRatio, 2.0) * (isRunning ? 0.28 : 0.20) : 0.04;
    const earFlop = Math.cos(walkClock * 2) * earAmp;
    const earDamp = 1 - Math.exp(-dt * 9);
    pug.leftEarPivot.rotation.x  += (earFlop - pug.leftEarPivot.rotation.x)  * earDamp;
    pug.rightEarPivot.rotation.x += (earFlop - pug.rightEarPivot.rotation.x) * earDamp;
    // Ears also splay outward slightly when body rolls to that side
    pug.leftEarPivot.rotation.z  += (-pug.body.rotation.z * 0.35 - pug.leftEarPivot.rotation.z)  * earDamp;
    pug.rightEarPivot.rotation.z += (-pug.body.rotation.z * 0.35 - pug.rightEarPivot.rotation.z) * earDamp;

    // ── Tail wag — always going, scales with excitement ────────
    const wagAmp = moving
      ? (isRunning ? 0.54 : 0.36)
      : 0.18;   // gentle idle wag
    pug.tailPivot.rotation.y = Math.sin(wagClock) * wagAmp;

    // ── Chase camera ───────────────────────────────────────────
    const targetPos = new Vector3(
      pug.root.position.x - fwdX * CAM_DIST,
      pug.root.position.y + CAM_HEIGHT,
      pug.root.position.z - fwdZ * CAM_DIST,
    );
    const camT = 1 - Math.exp(-dt * CAM_SPRING);
    camera.position.x += (targetPos.x - camera.position.x) * camT;
    camera.position.y += (targetPos.y - camera.position.y) * camT;
    camera.position.z += (targetPos.z - camera.position.z) * camT;
    camera.setTarget(new Vector3(
      pug.root.position.x,
      pug.root.position.y + 1.80,   // higher aim = less nose-down = more sky visible
      pug.root.position.z,
    ));
  });

  return camera;
}
