import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { createEnvironment } from "./environment";
import { createPug } from "./pug";
import { createPlayer } from "./player";
import { createHUD } from "./hud";
import { createAllDogs } from "./dogs";
import { createDayNightCycle } from "./dayNight";
import { createClouds } from "./clouds";

export function createScene(engine: Engine): Scene {
  const scene = new Scene(engine);

  scene.fogMode = Scene.FOGMODE_EXP2;

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
