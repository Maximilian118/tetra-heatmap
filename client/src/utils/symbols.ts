/* Symbol type definitions and icon atlas builder for DeckGL IconLayer.
   Uses lucide icon path data rendered onto a canvas atlas.

   Two atlas layers are used:
   - Background atlas: circle fills (omni or wedge). The wedge rotates via getAngle.
   - Icon atlas: the white lucide icons. These never rotate — always upright. */

/* Supported symbol types */
export type SymbolType = "base-station" | "repeater-omni" | "repeater-directional";

/* Metadata for each symbol type — used by the sidebar palette and icon atlas */
export interface SymbolTypeDef {
  type: SymbolType;
  label: string;
  color: string;
  category: string;
}

/* Available symbol types with display metadata.
   Both repeater types share the same green colour — they're both repeaters. */
export const SYMBOL_TYPES: SymbolTypeDef[] = [
  { type: "base-station",         label: "Base Station",         color: "#589cdc", category: "Base Station" },
  { type: "repeater-omni",        label: "Repeater\n(Omni)",     color: "#4ade80", category: "Repeater" },
  { type: "repeater-directional", label: "Repeater\n(Directional)", color: "#4ade80", category: "Repeater" },
];

/* Size of each icon cell in the atlas (px) */
const ICON_SIZE = 96;

/* Centre of each icon cell */
const CY = ICON_SIZE / 2;

/* Background circle radius */
const BG_RADIUS = 30;

/* Icon mapping for DeckGL IconLayer — maps symbol type to atlas region.
   All icons use centre anchor so rotation pivots around the icon centre. */
/* Number of atlas columns (3 primary + 3 backup variants) */
const ATLAS_COLS = 6;

export const ICON_MAPPING: Record<string, { x: number; y: number; width: number; height: number; anchorY: number }> = {
  "base-station":                  { x: 0,              y: 0, width: ICON_SIZE, height: ICON_SIZE, anchorY: CY },
  "repeater-omni":                 { x: ICON_SIZE,      y: 0, width: ICON_SIZE, height: ICON_SIZE, anchorY: CY },
  "repeater-directional":          { x: ICON_SIZE * 2,  y: 0, width: ICON_SIZE, height: ICON_SIZE, anchorY: CY },
  "base-station-backup":           { x: ICON_SIZE * 3,  y: 0, width: ICON_SIZE, height: ICON_SIZE, anchorY: CY },
  "repeater-omni-backup":          { x: ICON_SIZE * 4,  y: 0, width: ICON_SIZE, height: ICON_SIZE, anchorY: CY },
  "repeater-directional-backup":   { x: ICON_SIZE * 5,  y: 0, width: ICON_SIZE, height: ICON_SIZE, anchorY: CY },
};

/* ── Lucide icon path data (from lucide-react v1.7.0) ─────────────── */

type SvgElement = ["path", { d: string }] | ["circle", { cx: string; cy: string; r: string }];

/* RadioTower icon — classic cell tower with signal arcs */
const RADIO_TOWER_PATHS: SvgElement[] = [
  ["path", { d: "M4.9 16.1C1 12.2 1 5.8 4.9 1.9" }],
  ["path", { d: "M7.8 4.7a6.14 6.14 0 0 0-.8 7.5" }],
  ["circle", { cx: "12", cy: "9", r: "2" }],
  ["path", { d: "M16.2 4.8c2 2 2.26 5.11.8 7.47" }],
  ["path", { d: "M19.1 1.9a9.96 9.96 0 0 1 0 14.1" }],
  ["path", { d: "M9.5 18h5" }],
  ["path", { d: "m8 22 4-11 4 11" }],
];

/* Antenna icon — yagi-style directional antenna array */
const ANTENNA_PATHS: SvgElement[] = [
  ["path", { d: "M2 12 7 2" }],
  ["path", { d: "m7 12 5-10" }],
  ["path", { d: "m12 12 5-10" }],
  ["path", { d: "m17 12 5-10" }],
  ["path", { d: "M4.5 7h15" }],
  ["path", { d: "M12 16v6" }],
];

/* ── Drawing helpers ───────────────────────────────────────────────── */

/* Draw the dark filled circle background with a bright outer ring */
const drawBackground = (ctx: CanvasRenderingContext2D, cx: number) => {
  ctx.fillStyle = "#202020";
  ctx.beginPath();
  ctx.arc(cx, CY, BG_RADIUS, 0, Math.PI * 2);
  ctx.fill();

  /* Bright white outer ring to pop off the map */
  ctx.strokeStyle = "rgba(255, 255, 255, 0.7)";
  ctx.lineWidth = 2.5;
  ctx.stroke();
};

/* Draw a full 360° coverage fill (omni) — vivid colour */
const drawOmniFill = (ctx: CanvasRenderingContext2D, cx: number, color: string) => {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(cx, CY, BG_RADIUS - 1.5, 0, Math.PI * 2);
  ctx.fill();
};

/* Draw a 90° directional wedge fill pointing UP — vivid colour */
const drawWedgeFill = (ctx: CanvasRenderingContext2D, cx: number, color: string) => {
  const wedgeAngle = Math.PI / 2;
  const startAngle = -Math.PI / 2 - wedgeAngle / 2;
  const endAngle = -Math.PI / 2 + wedgeAngle / 2;

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(cx, CY);
  ctx.arc(cx, CY, BG_RADIUS - 1.5, startAngle, endAngle);
  ctx.closePath();
  ctx.fill();
};

/* Render lucide SVG path data onto a canvas context.
   Transforms from the 24x24 lucide viewbox to fit centred within the circle. */
const drawLucideIcon = (
  ctx: CanvasRenderingContext2D,
  cx: number,
  elements: SvgElement[],
  scale = 1.35,
) => {
  ctx.save();

  const iconSize = 24 * scale;
  ctx.translate(cx - iconSize / 2, CY - iconSize / 2);
  ctx.scale(scale, scale);

  ctx.strokeStyle = "rgba(255, 255, 255, 0.95)";
  ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  for (const el of elements) {
    if (el[0] === "path") {
      const p = new Path2D(el[1].d);
      ctx.stroke(p);
    } else if (el[0] === "circle") {
      const r = Number(el[1].r);
      ctx.beginPath();
      ctx.arc(Number(el[1].cx), Number(el[1].cy), r, 0, Math.PI * 2);
      ctx.stroke();
      if (r <= 2.5) ctx.fill();
    }
  }

  ctx.restore();
};

/* ── Background atlas (rotatable — wedge rotates for directional) ── */

/* Base station background — dark circle + vivid blue omni fill */
const drawBaseStationBg = (ctx: CanvasRenderingContext2D, ox: number) => {
  const cx = ox + ICON_SIZE / 2;
  drawBackground(ctx, cx);
  drawOmniFill(ctx, cx, "rgba(88, 156, 220, 0.85)");
};

/* Draw the dark filled circle background with a dashed outer ring (backup indicator) */
const drawBackgroundDashed = (ctx: CanvasRenderingContext2D, cx: number) => {
  ctx.fillStyle = "#202020";
  ctx.beginPath();
  ctx.arc(cx, CY, BG_RADIUS, 0, Math.PI * 2);
  ctx.fill();

  /* Dashed white outer ring to indicate backup */
  ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
  ctx.lineWidth = 3;
  ctx.setLineDash([12, 8]);
  ctx.stroke();
  ctx.setLineDash([]);
};

/* Backup base station background — dark circle + blue fill + dashed ring */
const drawBaseStationBackupBg = (ctx: CanvasRenderingContext2D, ox: number) => {
  const cx = ox + ICON_SIZE / 2;
  drawBackgroundDashed(ctx, cx);
  drawOmniFill(ctx, cx, "rgba(88, 156, 220, 0.85)");
};

/* Backup omni repeater background — dark circle + green fill + dashed ring */
const drawRepeaterOmniBackupBg = (ctx: CanvasRenderingContext2D, ox: number) => {
  const cx = ox + ICON_SIZE / 2;
  drawBackgroundDashed(ctx, cx);
  drawOmniFill(ctx, cx, "rgba(74, 222, 128, 0.85)");
};

/* Backup directional repeater background — dark circle + green wedge + dashed ring */
const drawRepeaterDirectionalBackupBg = (ctx: CanvasRenderingContext2D, ox: number) => {
  const cx = ox + ICON_SIZE / 2;
  drawBackgroundDashed(ctx, cx);
  drawWedgeFill(ctx, cx, "rgba(74, 222, 128, 0.85)");
};

/* Omni repeater background — dark circle + vivid green omni fill */
const drawRepeaterOmniBg = (ctx: CanvasRenderingContext2D, ox: number) => {
  const cx = ox + ICON_SIZE / 2;
  drawBackground(ctx, cx);
  drawOmniFill(ctx, cx, "rgba(74, 222, 128, 0.85)");
};

/* Directional repeater background — dark circle + vivid green wedge pointing UP */
const drawRepeaterDirectionalBg = (ctx: CanvasRenderingContext2D, ox: number) => {
  const cx = ox + ICON_SIZE / 2;
  drawBackground(ctx, cx);
  drawWedgeFill(ctx, cx, "rgba(74, 222, 128, 0.85)");
};

/* ── Icon atlas (never rotates — always upright) ───────────────────── */

/* Base station icon — RadioTower */
const drawBaseStationIcon = (ctx: CanvasRenderingContext2D, ox: number) => {
  drawLucideIcon(ctx, ox + ICON_SIZE / 2, RADIO_TOWER_PATHS);
};

/* Repeater icon — Antenna (same for omni and directional) */
const drawRepeaterIcon = (ctx: CanvasRenderingContext2D, ox: number) => {
  drawLucideIcon(ctx, ox + ICON_SIZE / 2, ANTENNA_PATHS);
};

/* ── Composite atlas (for sidebar previews — bg + icon combined) ──── */

const drawBaseStation = (ctx: CanvasRenderingContext2D, ox: number) => {
  drawBaseStationBg(ctx, ox);
  drawBaseStationIcon(ctx, ox);
};

const drawBaseStationBackup = (ctx: CanvasRenderingContext2D, ox: number) => {
  drawBaseStationBackupBg(ctx, ox);
  drawBaseStationIcon(ctx, ox);
};

const drawRepeaterOmniBackup = (ctx: CanvasRenderingContext2D, ox: number) => {
  drawRepeaterOmniBackupBg(ctx, ox);
  drawRepeaterIcon(ctx, ox);
};

const drawRepeaterDirectionalBackup = (ctx: CanvasRenderingContext2D, ox: number) => {
  drawRepeaterDirectionalBackupBg(ctx, ox);
  drawRepeaterIcon(ctx, ox);
};

const drawRepeaterOmni = (ctx: CanvasRenderingContext2D, ox: number) => {
  drawRepeaterOmniBg(ctx, ox);
  drawRepeaterIcon(ctx, ox);
};

const drawRepeaterDirectional = (ctx: CanvasRenderingContext2D, ox: number) => {
  drawRepeaterDirectionalBg(ctx, ox);
  drawRepeaterIcon(ctx, ox);
};

/* ── Public API ────────────────────────────────────────────────────── */

/* Convert degrees to compass label */
export const degreesToCompass = (deg: number): string => {
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const index = Math.round(((deg % 360) + 360) % 360 / 45) % 8;
  return dirs[index];
};

/* Build the composite atlas for sidebar previews (bg + icon in one image) */
export const buildIconAtlas = (): HTMLCanvasElement => {
  const canvas = document.createElement("canvas");
  canvas.width = ICON_SIZE * ATLAS_COLS;
  canvas.height = ICON_SIZE;

  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  drawBaseStation(ctx, 0);
  drawRepeaterOmni(ctx, ICON_SIZE);
  drawRepeaterDirectional(ctx, ICON_SIZE * 2);
  drawBaseStationBackup(ctx, ICON_SIZE * 3);
  drawRepeaterOmniBackup(ctx, ICON_SIZE * 4);
  drawRepeaterDirectionalBackup(ctx, ICON_SIZE * 5);

  return canvas;
};

/* Build the background-only atlas (used by the rotatable layer on the map) */
export const buildBgAtlas = (): HTMLCanvasElement => {
  const canvas = document.createElement("canvas");
  canvas.width = ICON_SIZE * ATLAS_COLS;
  canvas.height = ICON_SIZE;

  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  drawBaseStationBg(ctx, 0);
  drawRepeaterOmniBg(ctx, ICON_SIZE);
  drawRepeaterDirectionalBg(ctx, ICON_SIZE * 2);
  drawBaseStationBackupBg(ctx, ICON_SIZE * 3);
  drawRepeaterOmniBackupBg(ctx, ICON_SIZE * 4);
  drawRepeaterDirectionalBackupBg(ctx, ICON_SIZE * 5);

  return canvas;
};

/* Build the icon-only atlas (used by the non-rotating layer on the map) */
export const buildFgAtlas = (): HTMLCanvasElement => {
  const canvas = document.createElement("canvas");
  canvas.width = ICON_SIZE * ATLAS_COLS;
  canvas.height = ICON_SIZE;

  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  drawBaseStationIcon(ctx, 0);
  drawRepeaterIcon(ctx, ICON_SIZE);
  drawRepeaterIcon(ctx, ICON_SIZE * 2);
  drawBaseStationIcon(ctx, ICON_SIZE * 3);
  drawRepeaterIcon(ctx, ICON_SIZE * 4);
  drawRepeaterIcon(ctx, ICON_SIZE * 5);

  return canvas;
};
