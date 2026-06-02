import { Engine } from "@babylonjs/core/Engines/engine";
import HavokPhysics from "@babylonjs/havok";
import { createScene } from "./scene";

const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement;
const engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });

// HavokPhysics.wasm is served from /public so it always resolves regardless
// of how Vite transforms the package's own script URL.
HavokPhysics({ locateFile: () => "/HavokPhysics.wasm" }).then((havok) => {
  const scene = createScene(engine, havok);
  engine.runRenderLoop(() => scene.render());
  window.addEventListener("resize", () => engine.resize());
});
