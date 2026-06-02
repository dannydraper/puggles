import { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { formatClock, periodLabel } from "./dayNight";

const MAP_SIZE  = 180;
const PARK_HALF = 65;
const SCALE     = MAP_SIZE / (PARK_HALF * 2);
const CX        = MAP_SIZE / 2;
const CY        = MAP_SIZE / 2;

const TREE_XZ: [number, number][] = [
  [-14, 8],  [-18, -6],  [-12, -22], [-26, 14],  [-32, -8],
  [-22, 26], [-36, 2],   [-10, 32],  [-30, -26], [-6,  -32],
  [32, -12], [36,  4],   [30,  -28], [42,  -20], [26,  -32],
  [-42, 10], [16,  -32], [-24, -36], [40,  28],  [-40, 28],
  [10,  38], [-10, -40], [32,  -40], [46,  8],   [-46, -16],
  [6,   46], [-6,  -46], [22,  44],  [-22, 44],  [44,  -4],
  [-16, 40], [40,  -38], [14,  -44], [-44, 18],  [36,  38],
];

function toMap(wx: number, wz: number): [number, number] {
  return [CX + wx * SCALE, CY - wz * SCALE];
}

// Clock tint colour — warm by day, cool by night
function clockTint(tod: number): string {
  if (tod < 0.22 || tod > 0.86) return "rgba(10,14,40,0.68)";
  if (tod < 0.30 || tod > 0.76) return "rgba(60,22,8,0.62)";
  return "rgba(8,12,20,0.58)";
}

export function createHUD(
  scene: Scene,
  pugRoot: TransformNode,
  getTimeOfDay: () => number,
): void {
  // ── Root overlay ───────────────────────────────────────────────
  const hud = document.createElement("div");
  Object.assign(hud.style, {
    position:      "fixed",
    inset:         "0",
    pointerEvents: "none",
    fontFamily:    "system-ui, -apple-system, sans-serif",
    userSelect:    "none",
  });

  // ── Name plate ─────────────────────────────────────────────────
  const nameplate = document.createElement("div");
  nameplate.innerHTML = [
    `<span style="display:block;text-align:center;font-size:11px;`,
    `letter-spacing:3px;opacity:0.65;margin-bottom:3px">PLAYING AS</span>`,
    `<span style="font-size:26px;font-weight:800;letter-spacing:4px">PUGGLES</span>`,
  ].join("");
  Object.assign(nameplate.style, {
    position:       "absolute",
    top:            "16px",
    left:           "50%",
    transform:      "translateX(-50%)",
    background:     "rgba(8,12,20,0.58)",
    color:          "#fff",
    padding:        "8px 28px 10px",
    borderRadius:   "28px",
    backdropFilter: "blur(6px)",
    border:         "1px solid rgba(255,255,255,0.16)",
    textAlign:      "center",
    lineHeight:     "1.2",
    whiteSpace:     "nowrap",
  });

  // ── Clock (top-right) ──────────────────────────────────────────
  const clock = document.createElement("div");
  Object.assign(clock.style, {
    position:       "absolute",
    top:            "16px",
    right:          "16px",
    background:     "rgba(8,12,20,0.58)",
    color:          "#fff",
    padding:        "8px 18px 10px",
    borderRadius:   "20px",
    backdropFilter: "blur(6px)",
    border:         "1px solid rgba(255,255,255,0.16)",
    textAlign:      "center",
    minWidth:       "86px",
    lineHeight:     "1.2",
    transition:     "background 1s ease",
  });

  // ── Day arc strip (inside clock) ───────────────────────────────
  // A thin progress arc drawn on a small canvas inside the clock card
  const arcCanvas = document.createElement("canvas");
  arcCanvas.width  = 60;
  arcCanvas.height = 8;
  Object.assign(arcCanvas.style, {
    display:      "block",
    margin:       "5px auto 0",
    borderRadius: "4px",
    overflow:     "hidden",
  });

  clock.innerHTML = "";  // will be built in update loop
  clock.appendChild(arcCanvas);

  // ── Controls hint ──────────────────────────────────────────────
  const hint = document.createElement("div");
  hint.textContent = "WASD · move      SHIFT · run      SPACE · jump      B · bark";
  Object.assign(hint.style, {
    position:      "absolute",
    bottom:        "14px",
    left:          "50%",
    transform:     "translateX(-50%)",
    color:         "rgba(255,255,255,0.38)",
    fontSize:      "11px",
    letterSpacing: "1.5px",
  });

  // ── Mini-map ───────────────────────────────────────────────────
  const mapWrap = document.createElement("div");
  Object.assign(mapWrap.style, {
    position:     "absolute",
    bottom:       "16px",
    right:        "16px",
    borderRadius: "14px",
    overflow:     "hidden",
    border:       "2px solid rgba(255,255,255,0.20)",
    boxShadow:    "0 4px 24px rgba(0,0,0,0.55)",
  });

  const mapCanvas = document.createElement("canvas");
  mapCanvas.width  = MAP_SIZE;
  mapCanvas.height = MAP_SIZE;
  mapWrap.appendChild(mapCanvas);

  hud.appendChild(nameplate);
  hud.appendChild(clock);
  hud.appendChild(hint);
  hud.appendChild(mapWrap);
  document.body.appendChild(hud);

  // Pre-render static map layer
  const staticCanvas = document.createElement("canvas");
  staticCanvas.width  = MAP_SIZE;
  staticCanvas.height = MAP_SIZE;
  drawStaticLayer(staticCanvas.getContext("2d")!);

  const mapCtx = mapCanvas.getContext("2d")!;
  const arcCtx = arcCanvas.getContext("2d")!;

  scene.onAfterRenderObservable.add(() => {
    const tod = getTimeOfDay();

    // ── Update clock ────────────────────────────────────────────
    const timeStr   = formatClock(tod);
    const periodStr = periodLabel(tod);
    clock.style.background = clockTint(tod);
    // Rebuild inner HTML preserving the arc canvas
    const textDiv = clock.querySelector(".clock-text") as HTMLElement | null;
    if (!textDiv) {
      const d = document.createElement("div");
      d.className = "clock-text";
      clock.insertBefore(d, arcCanvas);
    }
    const td = clock.querySelector(".clock-text") as HTMLElement;
    td.innerHTML = [
      `<span style="font-size:20px;font-weight:800;letter-spacing:2px">${timeStr}</span>`,
      `<span style="display:block;font-size:9px;letter-spacing:2.5px;opacity:0.65;margin-top:2px">${periodStr}</span>`,
    ].join("");

    // ── Arc progress bar ───────────────────────────────────────
    const W = arcCanvas.width, H = arcCanvas.height;
    arcCtx.clearRect(0, 0, W, H);
    arcCtx.fillStyle = "rgba(255,255,255,0.12)";
    arcCtx.beginPath();
    arcCtx.roundRect(0, 0, W, H, 4);
    arcCtx.fill();
    const isDay = tod >= 0.22 && tod <= 0.80;
    arcCtx.fillStyle = isDay ? "rgba(255,210,60,0.75)" : "rgba(140,160,220,0.70)";
    const fillW = Math.round(tod * W);
    arcCtx.beginPath();
    arcCtx.roundRect(0, 0, fillW, H, 4);
    arcCtx.fill();

    // ── Mini-map ────────────────────────────────────────────────
    mapCtx.drawImage(staticCanvas, 0, 0);

    // Night tint overlay on map
    if (tod < 0.26 || tod > 0.76) {
      const nightAlpha = tod < 0.26
        ? 0.45 * (1 - tod / 0.26)
        : 0.45 * ((tod - 0.76) / 0.24);
      mapCtx.fillStyle = `rgba(5,8,28,${Math.min(0.45, nightAlpha)})`;
      mapCtx.fillRect(0, 0, MAP_SIZE, MAP_SIZE);
    }

    drawPug(mapCtx, pugRoot.position.x, pugRoot.position.z, pugRoot.rotation.y);
  });
}

function drawStaticLayer(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = "#2c4d17";
  ctx.fillRect(0, 0, MAP_SIZE, MAP_SIZE);

  const vignette = ctx.createRadialGradient(CX, CY, MAP_SIZE * 0.3, CX, CY, MAP_SIZE * 0.72);
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(1, "rgba(0,0,0,0.35)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, MAP_SIZE, MAP_SIZE);

  ctx.strokeStyle = "rgba(195,180,135,0.55)";
  ctx.lineWidth   = 3.5 * SCALE;
  ctx.lineCap     = "square";
  for (const [x0, y0, x1, y1] of [[CX, 0, CX, MAP_SIZE], [0, CY, MAP_SIZE, CY]]) {
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
  }

  const [px, pz] = toMap(22, 18);
  ctx.fillStyle   = "rgba(50,115,210,0.82)";
  ctx.strokeStyle = "rgba(150,190,230,0.50)";
  ctx.lineWidth   = 1;
  ctx.beginPath(); ctx.arc(px, pz, 7 * SCALE, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

  for (const [tx, tz] of TREE_XZ) {
    const [mx, mz] = toMap(tx, tz);
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.beginPath(); ctx.arc(mx + 0.5, mz + 0.5, 2.4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "rgba(20,78,12,0.95)";
    ctx.beginPath(); ctx.arc(mx, mz, 2.4, 0, Math.PI * 2); ctx.fill();
  }

  ctx.fillStyle    = "rgba(255,255,255,0.40)";
  ctx.font         = "bold 9px system-ui";
  ctx.textAlign    = "right";
  ctx.textBaseline = "top";
  ctx.fillText("N", MAP_SIZE - 5, 5);
}

function drawPug(ctx: CanvasRenderingContext2D, wx: number, wz: number, ry: number): void {
  const [mx, mz] = toMap(wx, wz);
  ctx.strokeStyle = "rgba(255,205,70,0.90)";
  ctx.lineWidth   = 2;
  ctx.lineCap     = "round";
  ctx.beginPath();
  ctx.moveTo(mx, mz);
  ctx.lineTo(mx + Math.sin(ry) * 10, mz - Math.cos(ry) * 10);
  ctx.stroke();
  ctx.fillStyle = "rgba(245,175,50,0.30)";
  ctx.beginPath(); ctx.arc(mx, mz, 8, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle   = "#f5b030";
  ctx.strokeStyle = "#fff";
  ctx.lineWidth   = 1.5;
  ctx.beginPath(); ctx.arc(mx, mz, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
}
