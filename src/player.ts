import { Scene } from "@babylonjs/core/scene";
import { UniversalCamera } from "@babylonjs/core/Cameras/universalCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { KeyboardEventTypes } from "@babylonjs/core/Events/keyboardEvents";
import { PhysicsCharacterController, CharacterSupportedState } from "@babylonjs/core/Physics/v2/characterController";
import { PugParts } from "./pug";
import { groundHeight } from "./environment";

// Movement (units per second)
const WALK_SPEED  = 4.5;
const TURN_SPEED  = 1.9;   // rad/s
const RUN_MULT    = 2.2;
const GRAVITY     = 9.81;

// Camera spring
const CAM_SPRING  = 8;
const CAM_DIST    = 7;
const CAM_HEIGHT  = 3.2;

// Pose constants (must match pug.ts)
const BACK_HIP_REST  = -0.08;
const BACK_KNEE_REST =  0.24;
const BODY_BASE_Y    =  0.54;
const BODY_BASE_SX   =  0.90;
const BODY_BASE_SY   =  0.78;
const BODY_BASE_SZ   =  1.12;
const LEG_PIVOT_Y    =  0.44;

// Capsule dimensions — cylindrical section + hemisphere caps
const CAP_RADIUS = 0.30;
const CAP_HEIGHT = 0.50;
// Distance from capsule centre to feet (bottom of lower hemisphere)
const CAP_OFFSET = CAP_RADIUS + CAP_HEIGHT / 2;  // 0.55

export function createPlayer(scene: Scene, pug: PugParts): UniversalCamera {
  const camera = new UniversalCamera("camera", new Vector3(0, CAM_HEIGHT, -CAM_DIST), scene);
  camera.minZ = 0.1;

  // Character controller — starts slightly above flat centre so it settles onto the ground
  const cc = new PhysicsCharacterController(
    new Vector3(0, CAP_OFFSET + 0.2, 0),
    { capsuleHeight: CAP_HEIGHT, capsuleRadius: CAP_RADIUS },
    scene,
  );

  const keys = new Set<string>();
  scene.onKeyboardObservable.add((info) => {
    const k = info.event.key.toLowerCase();
    if (info.type === KeyboardEventTypes.KEYDOWN) keys.add(k);
    else keys.delete(k);
  });

  let velocity  = 0;
  let gravityVel = 0;
  let walkClock = 0;
  let wagClock  = 0;
  let idleClock = 0;

  // Rest pose for jointed legs before first frame
  pug.backLeft.joint.rotation.x  = BACK_KNEE_REST;
  pug.backRight.joint.rotation.x = BACK_KNEE_REST;
  pug.backLeft.pivot.rotation.x  = BACK_HIP_REST;
  pug.backRight.pivot.rotation.x = BACK_HIP_REST;

  const gravity = new Vector3(0, -GRAVITY, 0);
  const downDir = new Vector3(0, -1, 0);

  scene.onBeforeRenderObservable.add(() => {
    const dt = scene.getEngine().getDeltaTime() / 1000;
    const isRunning = keys.has("shift");

    // ── Turning ────────────────────────────────────────────────
    if (keys.has("a") || keys.has("arrowleft"))  pug.root.rotation.y -= TURN_SPEED * dt;
    if (keys.has("d") || keys.has("arrowright")) pug.root.rotation.y += TURN_SPEED * dt;

    // ── Velocity with smooth accel / decel ─────────────────────
    let moveDir = 0;
    if      (keys.has("w") || keys.has("arrowup"))   moveDir =  1;
    else if (keys.has("s") || keys.has("arrowdown")) moveDir = -1;

    const topSpeed   = WALK_SPEED * (isRunning ? RUN_MULT : 1);
    const targetVel  = moveDir !== 0 ? topSpeed : 0;
    const rampFactor = moveDir !== 0
      ? 1 - Math.exp(-dt * 10)
      : 1 - Math.exp(-dt * 16);
    velocity += (targetVel - velocity) * rampFactor;

    const moving     = velocity > 0.01;
    const speedRatio = velocity / WALK_SPEED;   // 0 → ~2.2

    // ── Physics movement ────────────────────────────────────────
    const support = cc.checkSupport(dt, downDir);
    if (support.supportedState >= CharacterSupportedState.SLIDING) {
      gravityVel = 0;
    } else {
      gravityVel -= GRAVITY * dt;
    }

    const ry   = pug.root.rotation.y;
    const fwdX = Math.sin(ry);
    const fwdZ = Math.cos(ry);
    const hSpd = velocity * moveDir;

    cc.setVelocity(new Vector3(fwdX * hSpd, gravityVel, fwdZ * hSpd));
    cc.integrate(dt, support, gravity);

    // Sync visual root to physics body
    const pos = cc.getPosition();
    pug.root.position.x = pos.x;
    pug.root.position.y = pos.y - CAP_OFFSET;
    pug.root.position.z = pos.z;

    // ── Slope pitch (visual — sample terrain analytically) ──────
    const px = pos.x, pz = pos.z;
    const STEP  = 1.0;
    const slope = (groundHeight(px + fwdX * STEP, pz + fwdZ * STEP)
                 - groundHeight(px - fwdX * STEP, pz - fwdZ * STEP)) / (2 * STEP);
    pug.root.rotation.x += (Math.atan(slope) - pug.root.rotation.x) * (1 - Math.exp(-dt * 5));

    // ── Clocks ─────────────────────────────────────────────────
    walkClock += dt * speedRatio * 11;
    wagClock  += dt * (moving ? (isRunning ? 10 : 6.5) : 2.2);
    idleClock += dt * 1.4;

    // ── Leg swing + joint bend ─────────────────────────────────
    const sw      = Math.sin(walkClock);
    const posw    = Math.max(0,  sw);
    const negw    = Math.max(0, -sw);
    const legAmp  = Math.min(speedRatio, 2.0) * (isRunning ? 0.36 : 0.28);
    const legDamp = 1 - Math.exp(-dt * 14);

    const tFL = moving ?  legAmp * sw : 0;
    const tFR = moving ? -legAmp * sw : 0;
    const tBL = moving ? -legAmp * sw + BACK_HIP_REST : BACK_HIP_REST;
    const tBR = moving ?  legAmp * sw + BACK_HIP_REST : BACK_HIP_REST;
    pug.frontLeft.pivot.rotation.x  += (tFL - pug.frontLeft.pivot.rotation.x)  * (moving ? 1 : legDamp);
    pug.frontRight.pivot.rotation.x += (tFR - pug.frontRight.pivot.rotation.x) * (moving ? 1 : legDamp);
    pug.backLeft.pivot.rotation.x   += (tBL - pug.backLeft.pivot.rotation.x)   * legDamp;
    pug.backRight.pivot.rotation.x  += (tBR - pug.backRight.pivot.rotation.x)  * legDamp;

    const liftAmp = moving ? Math.min(speedRatio, 2.0) * (isRunning ? 0.13 : 0.08) : 0;
    pug.frontLeft.pivot.position.y  += (LEG_PIVOT_Y + posw * liftAmp        - pug.frontLeft.pivot.position.y)  * legDamp;
    pug.frontRight.pivot.position.y += (LEG_PIVOT_Y + negw * liftAmp        - pug.frontRight.pivot.position.y) * legDamp;
    pug.backLeft.pivot.position.y   += (LEG_PIVOT_Y + negw * liftAmp * 0.85 - pug.backLeft.pivot.position.y)   * legDamp;
    pug.backRight.pivot.position.y  += (LEG_PIVOT_Y + posw * liftAmp * 0.85 - pug.backRight.pivot.position.y)  * legDamp;

    const elbowAmp = Math.min(speedRatio, 2.0) * (isRunning ? 0.52 : 0.38);
    pug.frontLeft.joint.rotation.x  += (posw * elbowAmp - pug.frontLeft.joint.rotation.x)  * legDamp;
    pug.frontRight.joint.rotation.x += (negw * elbowAmp - pug.frontRight.joint.rotation.x) * legDamp;

    const kneeFold = Math.min(speedRatio, 2.0) * (isRunning ? 0.58 : 0.44);
    pug.backLeft.joint.rotation.x  += (BACK_KNEE_REST + (moving ? negw * kneeFold : 0) - pug.backLeft.joint.rotation.x)  * legDamp;
    pug.backRight.joint.rotation.x += (BACK_KNEE_REST + (moving ? posw * kneeFold : 0) - pug.backRight.joint.rotation.x) * legDamp;

    // ── Body bounce ────────────────────────────────────────────
    const bounceT     = Math.min(speedRatio, 2.0);
    const bounceCurve = sw * sw;
    const bounceAmp   = moving ? bounceT * (isRunning ? 0.080 : 0.058) : 0;
    const breathe     = moving ? 0 : Math.sin(idleClock) * 0.005;
    const targetBodyY = BODY_BASE_Y + bounceCurve * bounceAmp + breathe;
    pug.body.position.y += (targetBodyY - pug.body.position.y) * (1 - Math.exp(-dt * 24));

    const lateralAmp  = moving ? bounceT * (isRunning ? 0.055 : 0.032) : 0;
    const targetBodyX = sw * lateralAmp;
    pug.body.position.x += (targetBodyX - pug.body.position.x) * (1 - Math.exp(-dt * 20));

    const squash = bounceCurve * bounceT * 0.028;
    pug.body.scaling.set(
      BODY_BASE_SX * (1 - squash * 0.30),
      BODY_BASE_SY * (1 + squash * 0.55),
      BODY_BASE_SZ * (1 - squash * 0.20),
    );

    const swayAmp    = moving ? bounceT * (isRunning ? 0.052 : 0.034) : 0;
    const targetSway = Math.sin(walkClock) * swayAmp;
    pug.body.rotation.z += (targetSway - pug.body.rotation.z) * (1 - Math.exp(-dt * 18));

    const leanTarget = moving ? -0.09 * Math.min(speedRatio, 2) : 0;
    pug.body.rotation.x += (leanTarget - pug.body.rotation.x) * (1 - Math.exp(-dt * 7));

    // ── Head nod + roll ────────────────────────────────────────
    const nodAmp  = moving ? Math.min(speedRatio, 2.0) * (isRunning ? 0.10 : 0.065) : 0;
    const idleNod = moving ? 0 : Math.sin(idleClock * 0.6) * 0.016;
    pug.headPivot.rotation.x += (Math.sin(walkClock) * nodAmp + idleNod - pug.headPivot.rotation.x)
                                * (1 - Math.exp(-dt * 20));
    pug.headPivot.rotation.z += (pug.body.rotation.z * 0.75 - pug.headPivot.rotation.z)
                                * (1 - Math.exp(-dt * 20));

    // ── Ear flop ────────────────────────────────────────────────
    const earAmp  = moving ? Math.min(speedRatio, 2.0) * (isRunning ? 0.28 : 0.20) : 0.04;
    const earFlop = Math.cos(walkClock * 2) * earAmp;
    const earDamp = 1 - Math.exp(-dt * 9);
    pug.leftEarPivot.rotation.x  += (earFlop - pug.leftEarPivot.rotation.x)  * earDamp;
    pug.rightEarPivot.rotation.x += (earFlop - pug.rightEarPivot.rotation.x) * earDamp;
    pug.leftEarPivot.rotation.z  += (-pug.body.rotation.z * 0.35 - pug.leftEarPivot.rotation.z)  * earDamp;
    pug.rightEarPivot.rotation.z += (-pug.body.rotation.z * 0.35 - pug.rightEarPivot.rotation.z) * earDamp;

    // ── Tail wag ───────────────────────────────────────────────
    const wagAmp = moving ? (isRunning ? 0.54 : 0.36) : 0.18;
    pug.tailPivot.rotation.y = Math.sin(wagClock) * wagAmp;

    // ── Chase camera ───────────────────────────────────────────
    const targetCamPos = new Vector3(
      pug.root.position.x - fwdX * CAM_DIST,
      pug.root.position.y + CAM_HEIGHT,
      pug.root.position.z - fwdZ * CAM_DIST,
    );
    const camT = 1 - Math.exp(-dt * CAM_SPRING);
    camera.position.x += (targetCamPos.x - camera.position.x) * camT;
    camera.position.y += (targetCamPos.y - camera.position.y) * camT;
    camera.position.z += (targetCamPos.z - camera.position.z) * camT;
    camera.setTarget(new Vector3(
      pug.root.position.x,
      pug.root.position.y + 1.80,
      pug.root.position.z,
    ));
  });

  return camera;
}
