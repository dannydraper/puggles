import { defineConfig } from "vite";

export default defineConfig({
  optimizeDeps: {
    // Prevent Vite pre-bundling Havok — its WASM file would be left behind in the
    // deps cache and the module would fetch an HTML 404 instead of the binary.
    exclude: ["@babylonjs/havok"],
    // Force this side-effect module into the same pre-bundle as @babylonjs/core/scene
    // so it patches the same Scene prototype instance rather than a /@fs/ copy.
    include: ["@babylonjs/core/Physics/joinedPhysicsEngineComponent"],
  },
});
