import { Scene } from "@babylonjs/core/scene";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { PhysicsAggregate } from "@babylonjs/core/Physics/v2/physicsAggregate";
import { PhysicsShapeType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin";

// ── Terrain height function ────────────────────────────────────────────────────
// Gaussian hills in the outer ring; center (paths) and pond area stay flat.

const HILLS = [
  { cx: -36, cz:  26, h: 4.2, s: 18 },
  { cx:  40, cz: -22, h: 4.8, s: 16 },
  { cx: -22, cz: -38, h: 3.6, s: 15 },
  { cx:  44, cz:  20, h: 4.0, s: 14 },
  { cx:  14, cz:  44, h: 3.4, s: 16 },
  { cx: -44, cz:  -8, h: 3.8, s: 17 },
  { cx:  -8, cz: -46, h: 3.2, s: 14 },
  { cx:  28, cz:  38, h: 3.0, s: 13 },
  { cx: -30, cz: -28, h: 2.8, s: 13 },
  { cx:   2, cz:  48, h: 2.4, s: 14 },
];

export function groundHeight(x: number, z: number): number {
  // Flat centre fades out; fully flat at r < 12, full hills at r > 32
  const r = Math.sqrt(x * x + z * z);
  const centerFade = Math.max(0, Math.min(1, (r - 12) / 20));

  // Keep pond basin flat
  const pdx = x - 22, pdz = z - 18;
  const pondFade = Math.max(0, Math.min(1, (Math.sqrt(pdx * pdx + pdz * pdz) - 8) / 6));

  const fade = centerFade * pondFade;
  if (fade < 0.001) return 0;

  let h = 0;
  for (const { cx, cz, h: hh, s } of HILLS) {
    const dx = x - cx, dz = z - cz;
    h += hh * Math.exp(-(dx * dx + dz * dz) / (2 * s * s));
  }
  return h * fade;
}

// ── Entry point ────────────────────────────────────────────────────────────────

export function createEnvironment(scene: Scene): void {
  const m = buildMaterials(scene);
  buildGround(scene, m);
  buildPaths(scene, m);
  buildPond(scene, m);
  buildTrees(scene, m);
  buildBushes(scene, m);
  buildFlowers(scene, m);
  buildBenches(scene, m);
  buildBorderWalls(scene);
}

function buildMaterials(scene: Scene) {
  const grass = new StandardMaterial("mGrass", scene);
  grass.diffuseColor = new Color3(0.32, 0.60, 0.22);
  grass.specularColor = new Color3(0.05, 0.05, 0.05);

  const path = new StandardMaterial("mPath", scene);
  path.diffuseColor = new Color3(0.80, 0.74, 0.58);
  path.specularColor = Color3.Black();

  const water = new StandardMaterial("mWater", scene);
  water.diffuseColor = new Color3(0.22, 0.52, 0.88);
  water.specularColor = new Color3(0.5, 0.7, 1.0);
  water.alpha = 0.84;

  const trunk = new StandardMaterial("mTrunk", scene);
  trunk.diffuseColor = new Color3(0.42, 0.26, 0.10);
  trunk.specularColor = Color3.Black();

  const foliageA = new StandardMaterial("mFoliageA", scene);
  foliageA.diffuseColor = new Color3(0.18, 0.52, 0.14);
  foliageA.specularColor = new Color3(0.02, 0.08, 0.02);

  const foliageB = new StandardMaterial("mFoliageB", scene);
  foliageB.diffuseColor = new Color3(0.13, 0.44, 0.10);
  foliageB.specularColor = Color3.Black();

  const foliageC = new StandardMaterial("mFoliageC", scene);
  foliageC.diffuseColor = new Color3(0.25, 0.60, 0.14);
  foliageC.specularColor = new Color3(0.02, 0.08, 0.02);

  const bush = new StandardMaterial("mBush", scene);
  bush.diffuseColor = new Color3(0.15, 0.40, 0.10);
  bush.specularColor = Color3.Black();

  const wood = new StandardMaterial("mWood", scene);
  wood.diffuseColor = new Color3(0.55, 0.38, 0.18);

  const stone = new StandardMaterial("mStone", scene);
  stone.diffuseColor = new Color3(0.62, 0.60, 0.56);
  stone.specularColor = new Color3(0.1, 0.1, 0.1);

  return { grass, path, water, trunk, foliageA, foliageB, foliageC, bush, wood, stone };
}

type Mats = ReturnType<typeof buildMaterials>;

function buildGround(scene: Scene, m: Mats) {
  const SIZE   = 130;
  const SUBDIV = 80;
  const g = MeshBuilder.CreateGround("ground", { width: SIZE, height: SIZE, subdivisions: SUBDIV, updatable: true }, scene);
  g.material = m.grass;

  // Apply terrain height to each vertex
  const pos = g.getVerticesData("position") as Float32Array;
  for (let i = 0; i < pos.length; i += 3) {
    pos[i + 1] = groundHeight(pos[i], pos[i + 2]);
  }
  g.updateVerticesData("position", pos);

  // Recompute normals so lighting is correct on slopes
  const indices = g.getIndices()!;
  const normals = new Float32Array(pos.length);
  VertexData.ComputeNormals(pos, indices, normals);
  g.updateVerticesData("normal", normals);

  // Physics triangle-mesh collider (static) — reads vertex data set above
  new PhysicsAggregate(g, PhysicsShapeType.MESH, { mass: 0, restitution: 0.1, friction: 0.8 }, scene);
}

function buildPaths(scene: Scene, m: Mats) {
  const a = MeshBuilder.CreateGround("pathN", { width: 3.5, height: 90 }, scene);
  a.material = m.path;
  a.position.y = 0.01;

  const b = MeshBuilder.CreateGround("pathE", { width: 90, height: 3.5 }, scene);
  b.material = m.path;
  b.position.y = 0.01;
}

function buildPond(scene: Scene, m: Mats) {
  const pond = MeshBuilder.CreateDisc("pond", { radius: 7, tessellation: 36 }, scene);
  pond.rotation.x = Math.PI / 2;
  pond.position.set(22, 0.02, 18);
  pond.material = m.water;

  const rim = MeshBuilder.CreateTorus("pondRim", { diameter: 15.4, thickness: 0.55, tessellation: 36 }, scene);
  rim.rotation.x = Math.PI / 2;
  rim.position.set(22, 0.12, 18);
  rim.material = m.stone;

  // Solid disc collider so characters can't wade into the pond
  const pondCol = MeshBuilder.CreateCylinder("pondCol", { height: 0.4, diameter: 14.5, tessellation: 24 }, scene);
  pondCol.position.set(22, -0.2, 18);
  pondCol.isVisible = false;
  new PhysicsAggregate(pondCol, PhysicsShapeType.CYLINDER, { mass: 0 }, scene);
}

const TREE_POSITIONS: [number, number][] = [
  [-14, 8], [-18, -6], [-12, -22], [-26, 14], [-32, -8],
  [-22, 26], [-36, 2], [-10, 32], [-30, -26], [-6, -32],
  [32, -12], [36, 4], [30, -28], [42, -20], [26, -32],
  [-42, 10], [16, -32], [-24, -36], [40, 28], [-40, 28],
  [10, 38], [-10, -40], [32, -40], [46, 8], [-46, -16],
  [6, 46], [-6, -46], [22, 44], [-22, 44], [44, -4],
  [-16, 40], [40, -38], [14, -44], [-44, 18], [36, 38],
];

// Broad deciduous tree — tapered trunk, 3 angled branches, multi-sphere crown
function buildBroadTree(scene: Scene, m: Mats, x: number, z: number, s: number, i: number) {
  const gy        = groundHeight(x, z);
  const trunkH    = 3.8 * s;
  const trunkBase = 0.38 * s;
  const trunkTop  = 0.16 * s;

  const trunk = MeshBuilder.CreateCylinder(`bTrunk_${i}`, {
    height: trunkH, diameterBottom: trunkBase * 2, diameterTop: trunkTop * 2, tessellation: 8,
  }, scene);
  trunk.material = m.trunk;
  trunk.position.set(x, gy + trunkH / 2, z);

  // 3 angled branches at upper third of trunk
  const branchDirs = [0, Math.PI * 0.65, Math.PI * 1.35];
  branchDirs.forEach((dir, bi) => {
    const upTilt  = 0.42 + Math.random() * 0.22;
    const bLen    = (1.6 + Math.random() * 1.0) * s;
    const branch  = MeshBuilder.CreateCylinder(`bBranch_${i}_${bi}`, {
      height: bLen, diameterBottom: 0.18 * s, diameterTop: 0.06 * s, tessellation: 6,
    }, scene);
    branch.material = m.trunk;
    branch.rotation.z = Math.PI / 2 - upTilt;
    branch.rotation.y = dir;
    const attachY   = gy + trunkH * 0.72;
    const branchMid = bLen / 2;
    branch.position.set(
      x + Math.cos(dir) * Math.cos(upTilt) * branchMid,
      attachY + Math.sin(upTilt) * branchMid,
      z + Math.sin(dir) * Math.cos(upTilt) * branchMid,
    );
  });

  // Crown: central sphere + ring of 5
  const crownY    = gy + trunkH + 1.2 * s;
  const crownMats = [m.foliageA, m.foliageB, m.foliageC];
  const centralD  = (3.6 + Math.random() * 1.2) * s;
  const central   = MeshBuilder.CreateSphere(`bCrown_${i}_c`, { diameter: centralD, segments: 5 }, scene);
  central.material = crownMats[i % crownMats.length];
  central.scaling.y = 0.78 + Math.random() * 0.22;
  central.position.set(x, crownY, z);

  for (let ri = 0; ri < 5; ri++) {
    const angle  = (ri / 5) * Math.PI * 2 + Math.random() * 0.4;
    const radius = (1.4 + Math.random() * 0.8) * s;
    const d      = (2.2 + Math.random() * 1.0) * s;
    const ring   = MeshBuilder.CreateSphere(`bCrown_${i}_r${ri}`, { diameter: d, segments: 5 }, scene);
    ring.material = crownMats[(i + ri + 1) % crownMats.length];
    ring.position.set(
      x + Math.cos(angle) * radius,
      crownY - (0.2 + Math.random() * 0.5) * s,
      z + Math.sin(angle) * radius,
    );
  }
}

// Conifer — slender trunk + 4 layered flat ellipsoid tiers + top spike
function buildConiferTree(scene: Scene, m: Mats, x: number, z: number, s: number, i: number) {
  const gy     = groundHeight(x, z);
  const trunkH = 5.0 * s;

  const trunk = MeshBuilder.CreateCylinder(`cTrunk_${i}`, {
    height: trunkH, diameterBottom: 0.28 * s, diameterTop: 0.10 * s, tessellation: 7,
  }, scene);
  trunk.material = m.trunk;
  trunk.position.set(x, gy + trunkH / 2, z);

  const tierMats = [m.foliageB, m.foliageA, m.foliageC];
  const tierCount = 4;
  for (let ti = 0; ti < tierCount; ti++) {
    const frac  = ti / (tierCount - 1);
    const tierY = gy + trunkH * (0.30 + frac * 0.55);
    const w     = (3.8 - frac * 2.0) * s;
    const h     = (0.9 + frac * 0.3) * s;

    const tier = MeshBuilder.CreateSphere(`cTier_${i}_${ti}`, { diameter: 1, segments: 5 }, scene);
    tier.material = tierMats[ti % tierMats.length];
    tier.scaling.set(w, h, w);
    tier.position.set(x, tierY, z);
  }

  const top = MeshBuilder.CreateSphere(`cTop_${i}`, { diameter: 0.9 * s, segments: 4 }, scene);
  top.material = m.foliageB;
  top.position.set(x, gy + trunkH + 0.3 * s, z);
}

// Bushy round tree — short thick trunk + wide dome of 9 overlapping spheres
function buildBushyTree(scene: Scene, m: Mats, x: number, z: number, s: number, i: number) {
  const gy     = groundHeight(x, z);
  const trunkH = 2.2 * s;

  const trunk = MeshBuilder.CreateCylinder(`uTrunk_${i}`, {
    height: trunkH, diameterBottom: 0.50 * s, diameterTop: 0.28 * s, tessellation: 8,
  }, scene);
  trunk.material = m.trunk;
  trunk.position.set(x, gy + trunkH / 2, z);

  const crownY   = gy + trunkH + 0.4 * s;
  const domeD    = (4.2 + Math.random() * 1.0) * s;
  const domeMats = [m.foliageA, m.foliageB, m.foliageC];

  const center = MeshBuilder.CreateSphere(`uDome_${i}_c`, { diameter: domeD, segments: 5 }, scene);
  center.material = domeMats[i % domeMats.length];
  center.scaling.set(1, 0.72, 1);
  center.position.set(x, crownY, z);

  for (let ri = 0; ri < 8; ri++) {
    const angle  = (ri / 8) * Math.PI * 2;
    const radius = domeD * 0.36;
    const d      = domeD * (0.62 + Math.random() * 0.22);
    const sp     = MeshBuilder.CreateSphere(`uDome_${i}_r${ri}`, { diameter: d, segments: 5 }, scene);
    sp.material = domeMats[(i + ri) % domeMats.length];
    sp.scaling.y = 0.68 + Math.random() * 0.18;
    sp.position.set(
      x + Math.cos(angle) * radius,
      crownY - (0.1 + Math.random() * 0.3) * s,
      z + Math.sin(angle) * radius,
    );
  }
}

function buildTrees(scene: Scene, m: Mats) {
  TREE_POSITIONS.forEach(([x, z], i) => {
    const s    = 0.7 + Math.random() * 0.7;
    const roll = Math.random();
    if      (roll < 0.45) buildBroadTree(scene, m, x, z, s, i);
    else if (roll < 0.72) buildConiferTree(scene, m, x, z, s, i);
    else                  buildBushyTree(scene, m, x, z, s, i);

    // Physics trunk collider — one capsule per tree regardless of type
    const gy  = groundHeight(x, z);
    const col = MeshBuilder.CreateCylinder(`tCol_${i}`, { height: 6, diameter: 0.55, tessellation: 8 }, scene);
    col.position.set(x, gy + 3, z);
    col.isVisible = false;
    new PhysicsAggregate(col, PhysicsShapeType.CYLINDER, { mass: 0 }, scene);
  });
}

function buildBushes(scene: Scene, m: Mats) {
  const master = MeshBuilder.CreateSphere("bushM", { diameter: 1.8, segments: 5 }, scene);
  master.material = m.bush;
  master.isVisible = false;

  const positions: [number, number][] = [
    [-7, 7], [7, 7], [-7, -7], [7, -7],
    [-11, 0], [11, 0], /* (0, 11) removed — in penalty corridor */ [0, -11],
    [-18, 10], [18, -10], [-14, -18], [18, 14],
    [24, 4], [-24, -4], [4, 24], [-4, -24],
    [-26, 20], [26, -18], [-8, 28], [8, -28],
  ];

  positions.forEach(([x, z], i) => {
    const s  = 0.55 + Math.random() * 0.50;
    const gy = groundHeight(x, z);
    const b  = master.createInstance(`bush_${i}`);
    b.position.set(x, gy + 0.55 * s, z);
    b.scaling.setAll(s);
  });
}

function buildFlowers(scene: Scene, _m: Mats) {
  const palette: Color3[] = [
    new Color3(1.0, 0.30, 0.50),
    new Color3(1.0, 0.90, 0.20),
    new Color3(0.75, 0.28, 1.0),
    new Color3(1.0, 0.50, 0.14),
    new Color3(0.90, 0.90, 1.0),
  ];

  const masters = palette.map((color, i) => {
    const mat = new StandardMaterial(`mFlower_${i}`, scene);
    mat.diffuseColor = color;
    mat.emissiveColor = color.scale(0.22);
    mat.specularColor = Color3.Black();
    const sphere = MeshBuilder.CreateSphere(`flowerM_${i}`, { diameter: 0.20, segments: 4 }, scene);
    sphere.material = mat;
    sphere.isVisible = false;
    return sphere;
  });

  for (let i = 0; i < 100; i++) {
    const master = masters[Math.floor(Math.random() * masters.length)];
    const f = master.createInstance(`fl_${i}`);
    const angle = Math.random() * Math.PI * 2;
    const r = 4 + Math.random() * 52;
    const fx = Math.cos(angle) * r;
    const fz = Math.sin(angle) * r;
    f.position.set(fx, groundHeight(fx, fz) + 0.10, fz);
  }
}

function buildBenches(scene: Scene, m: Mats) {
  const configs = [
    { x: 8,   z: 0,   ry: Math.PI / 2 },
    { x: -8,  z: 0,   ry: -Math.PI / 2 },
    // (0, 8) removed — sits in the penalty corridor in front of the goal
    { x: 0,   z: -8,  ry: Math.PI },
    { x: 20,  z: -6,  ry: 0.6 },
    { x: -20, z: 6,   ry: -0.6 },
  ];

  configs.forEach(({ x, z, ry }, i) => {
    const gy   = groundHeight(x, z);
    const root = new TransformNode(`bench_${i}`, scene);
    root.position.set(x, gy, z);
    root.rotation.y = ry;

    const seat = MeshBuilder.CreateBox(`bSeat_${i}`, { width: 1.8, height: 0.08, depth: 0.50 }, scene);
    seat.position.y = 0.46;
    seat.material = m.wood;
    seat.parent = root;

    const back = MeshBuilder.CreateBox(`bBack_${i}`, { width: 1.8, height: 0.48, depth: 0.06 }, scene);
    back.position.set(0, 0.74, -0.22);
    back.material = m.wood;
    back.parent = root;

    [-0.72, 0.72].forEach((xOff, j) => {
      const leg = MeshBuilder.CreateBox(`bLeg_${i}_${j}`, { width: 0.07, height: 0.46, depth: 0.46 }, scene);
      leg.position.set(xOff, 0.23, 0);
      leg.material = m.stone;
      leg.parent = root;
    });

    // Single box physics collider approximating the whole bench
    const col = MeshBuilder.CreateBox(`bCol_${i}`, { width: 1.9, height: 0.85, depth: 0.55 }, scene);
    col.position.set(x, gy + 0.43, z);
    col.rotation.y = ry;
    col.isVisible = false;
    new PhysicsAggregate(col, PhysicsShapeType.BOX, { mass: 0 }, scene);
  });
}

function buildBorderWalls(scene: Scene) {
  const BORDER = 66;
  const WALL_H = 12;
  const walls = [
    { x: 0,       z:  BORDER, w: BORDER * 2 + 4, d: 2 },
    { x: 0,       z: -BORDER, w: BORDER * 2 + 4, d: 2 },
    { x:  BORDER, z: 0,       w: 2, d: BORDER * 2 + 4 },
    { x: -BORDER, z: 0,       w: 2, d: BORDER * 2 + 4 },
  ];
  walls.forEach(({ x, z, w, d }, i) => {
    const wall = MeshBuilder.CreateBox(`bWall_${i}`, { width: w, height: WALL_H, depth: d }, scene);
    wall.position.set(x, WALL_H / 2 - 1, z);
    wall.isVisible = false;
    new PhysicsAggregate(wall, PhysicsShapeType.BOX, { mass: 0 }, scene);
  });
}
