import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HavokPlugin } from "@babylonjs/core/Physics/v2/Plugins/havokPlugin";
import { PhysicsEngine as PhysicsEngineV2 } from "@babylonjs/core/Physics/v2/physicsEngine";
import { PhysicsEngineSceneComponent } from "@babylonjs/core/Physics/joinedPhysicsEngineComponent";
import { createEnvironment } from "./environment";
import { createPug } from "./pug";
import { createPlayer } from "./player";
import { createHUD } from "./hud";
import { createAllDogs } from "./dogs";
import { createDayNightCycle } from "./dayNight";
import { createClouds } from "./clouds";

export function createScene(engine: Engine, havokInstance: unknown): Scene {
  const scene = new Scene(engine);
  scene.fogMode = Scene.FOGMODE_EXP2;

  // Set up Havok physics v2 directly, bypassing scene.enablePhysics so we
  // don't rely on the side-effect prototype patch surviving Vite pre-bundling.
  const havokPlugin = new HavokPlugin(true, havokInstance);
  const physicsEngine = new PhysicsEngineV2(new Vector3(0, -9.81, 0), havokPlugin);
  const physicsComponent = new PhysicsEngineSceneComponent(scene);
  scene._addComponent(physicsComponent);
  (scene as any)._physicsEngine = physicsEngine;

  // Lights — dayNight.ts will override colours/intensity each frame
  new HemisphericLight("ambient", new Vector3(0, 1, 0), scene);
  new DirectionalLight("sun", new Vector3(-0.5, -1, -0.5).normalize(), scene);

  createEnvironment(scene);

  const pugParts = createPug(scene);
  const camera   = createPlayer(scene, pugParts);
  scene.activeCamera = camera;

  createAllDogs(scene);

  const { getTimeOfDay } = createDayNightCycle(scene);
  createClouds(scene, getTimeOfDay);
  createHUD(scene, pugParts.root, getTimeOfDay);

  return scene;
}
