import { PolygonLayer, ScatterplotLayer, PathLayer } from "@deck.gl/layers"
import type { PickingInfo } from "@deck.gl/core"
import type { MapNote } from "../../../utils/api"
import { pointInPolygon, clipLineToPolygon, clipPolygonToPolygon } from "../../../utils/kml"
import type { LayerBuildParams } from "./types"

/* Parse a hex colour string (#rrggbb) into an RGBA tuple */
const hexToRgba = (hex: string, alpha: number): [number, number, number, number] => {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return [r, g, b, alpha]
}

/* Vertex handle data for the ScatterplotLayer */
interface VertexHandle {
  noteId: string
  vertexIndex: number
  position: [number, number]
  color: string
}

/* Build deck.gl layers for note polygon areas and vertex editing handles */
export const buildNoteLayers = (params: LayerBuildParams) => {
  const {
    notes,
    editingNoteId,
    onNoteAreaClick,
    onNotePolygonUpdate,
    setDraggingVertexNoteId,
    setNoteTooltip,
    reportMode,
  } = params

  /* Filter to notes that have polygon areas */
  const notesWithPolygon = notes.filter((n) => n.polygon && n.polygon.length >= 3)

  /* Semi-transparent filled polygons with coloured outlines */
  const areaLayer = new PolygonLayer<MapNote>({
    id: "note-areas",
    data: notesWithPolygon,
    getPolygon: (d) => d.polygon!,
    getFillColor: (d) => hexToRgba(d.color, 50),
    getLineColor: (d) => hexToRgba(d.color, 200),
    getLineWidth: 2,
    lineWidthMinPixels: 2,
    stroked: true,
    filled: true,
    pickable: true,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    parameters: { depthTest: false } as any,
    onClick: (info: PickingInfo<MapNote>) => {
      if (info.object) {
        onNoteAreaClick(info.object.id === editingNoteId ? null : info.object.id)
      }
    },
    onHover: (info: PickingInfo<MapNote>) => {
      if (info.object) {
        setNoteTooltip({
          x: info.x,
          y: info.y,
          title: info.object.title,
          text: info.object.text,
        })
      } else {
        setNoteTooltip(null)
      }
    },
    updateTriggers: {
      getFillColor: [notes],
      getLineColor: [notes],
      getPolygon: [notes],
    },
  })

  /* Build vertex handles for the currently selected note */
  const vertexData: VertexHandle[] = []
  if (editingNoteId) {
    const note = notesWithPolygon.find((n) => n.id === editingNoteId)
    if (note?.polygon) {
      note.polygon.forEach((pos, idx) => {
        vertexData.push({
          noteId: note.id,
          vertexIndex: idx,
          position: pos,
          color: note.color,
        })
      })
    }
  }

  /* Draggable vertex handles for reshaping polygons */
  const vertexLayer = new ScatterplotLayer<VertexHandle>({
    id: "note-vertices",
    data: vertexData,
    getPosition: (d) => d.position,
    getFillColor: (d) => hexToRgba(d.color, 220),
    getLineColor: [255, 255, 255, 200],
    getRadius: 5,
    radiusMinPixels: 5,
    radiusMaxPixels: 8,
    stroked: true,
    lineWidthMinPixels: 1,
    pickable: true,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    parameters: { depthTest: false } as any,
    onDragStart: (info: PickingInfo<VertexHandle>) => {
      if (info.object) {
        setDraggingVertexNoteId(info.object.noteId)
      }
    },
    onDrag: (info: PickingInfo<VertexHandle>) => {
      if (!info.object || !info.coordinate) return
      const { noteId, vertexIndex } = info.object
      const note = notes.find((n) => n.id === noteId)
      if (!note?.polygon) return

      /* Update the vertex position in the polygon */
      const updated = note.polygon.map((v, i) =>
        i === vertexIndex ? ([info.coordinate![0], info.coordinate![1]] as [number, number]) : v,
      )
      onNotePolygonUpdate(noteId, updated)
    },
    onDragEnd: () => {
      setDraggingVertexNoteId(null)
    },
    updateTriggers: {
      getPosition: [notes, editingNoteId],
      getFillColor: [notes, editingNoteId],
    },
  })

  /* ── KML geometry highlights inside note zones ─────────────────── */

  const { kmlGeoJson, visibleLineFolders, kmlLayerStyles, zoom } = params

  /* Clipped polygon highlights — exact intersection of KML sectors with note zones */
  interface ClippedHighlight {
    polygon: [number, number][]
    color: [number, number, number, number]
  }

  const clippedHighlights: ClippedHighlight[] = []

  if (kmlGeoJson) {
    for (const note of notesWithPolygon) {
      const color = hexToRgba(note.color, 255)
      for (const feature of kmlGeoJson.features) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const geom = (feature as any).geometry
        if (geom?.type !== "Polygon" || !geom.coordinates?.[0]) continue
        const ring = geom.coordinates[0] as [number, number][]
        const clipped = clipPolygonToPolygon(ring, note.polygon!)
        if (clipped.length >= 3) {
          clippedHighlights.push({ polygon: clipped, color })
        }
      }
    }
  }

  /* White fill base for clipped KML intersections */
  const sectorHighlightLayer = new PolygonLayer<ClippedHighlight>({
    id: "note-kml-sector-highlight",
    data: clippedHighlights,
    getPolygon: (d) => d.polygon,
    getFillColor: [255, 255, 255, 230],
    stroked: false,
    filled: true,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    parameters: { depthTest: false } as any,
    updateTriggers: {
      getPolygon: [notes, kmlGeoJson],
    },
  })

  /* Border outlines — clip each KML polygon's outline to the note zone as line segments.
     This avoids bridging between disconnected intersection regions. */
  interface BorderSeg {
    path: [number, number][]
    color: [number, number, number, number]
  }

  const borderSegs: BorderSeg[] = []

  if (kmlGeoJson) {
    for (const note of notesWithPolygon) {
      const color = hexToRgba(note.color, 255)
      for (const feature of kmlGeoJson.features) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const geom = (feature as any).geometry
        if (geom?.type !== "Polygon" || !geom.coordinates?.[0]) continue
        const ring = geom.coordinates[0] as [number, number][]
        /* Close the ring so the last edge is included */
        const closed = [...ring, ring[0]]
        const clipped = clipLineToPolygon(closed, note.polygon!)
        for (const seg of clipped) {
          borderSegs.push({ path: seg, color })
        }
      }
    }
  }

  const borderLayer = new PathLayer<BorderSeg>({
    id: "note-kml-sector-border",
    data: borderSegs,
    getPath: (d) => d.path,
    getColor: (d) => d.color,
    getWidth: 1,
    widthMinPixels: 1,
    widthMaxPixels: 1,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    parameters: { depthTest: false } as any,
    updateTriggers: {
      getPath: [notes, kmlGeoJson],
      getColor: [notes],
    },
  })

  /* Generate diagonal hatch lines inside each clipped intersection polygon.
     Clips parallel lines (at 45°) to the polygon boundary using scanline intersection. */
  interface HatchLine {
    path: [number, number][]
    color: [number, number, number, number]
  }

  /* Convert a screen-pixel distance to degrees at the current zoom level.
     At zoom 0 the world is 512px wide (360°), each zoom doubles resolution. */
  const degreesPerPixel = 360 / (512 * Math.pow(2, zoom))

  /* Fixed 3px spacing between hatch lines in screen pixels, converted to degrees */
  const HATCH_SPACING = degreesPerPixel * 3
  const hatchLines: HatchLine[] = []

  for (const h of clippedHighlights) {
    const poly = h.polygon
    const color = h.color

    /* Bounding box of the clipped polygon */
    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity
    for (const [x, y] of poly) {
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }

    /* Sweep diagonal lines (45°) across the polygon.
       A 45° line can be parameterised as x - y = c for varying c.
       For each value of c, the line is y = x - c.
       We sweep c from (minX - maxY) to (maxX - minY). */
    const cMin = minX - maxY
    const cMax = maxX - minY

    for (let c = cMin; c <= cMax; c += HATCH_SPACING) {
      /* The diagonal line y = x - c intersects the bbox at:
         x = minX → y = minX - c  and  x = maxX → y = maxX - c
         Clip to bbox y range to get the line segment endpoints */
      const x1 = Math.max(minX, minY + c)
      const y1 = x1 - c
      const x2 = Math.min(maxX, maxY + c)
      const y2 = x2 - c

      if (x1 >= x2) continue

      /* Find intersections of this line with polygon edges to clip inside */
      const p1: [number, number] = [x1, y1]
      const p2: [number, number] = [x2, y2]

      const p1In = pointInPolygon(p1[0], p1[1], poly)

      /* Collect crossing points sorted by parameter t */
      const crossings: { t: number; pt: [number, number] }[] = []
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const a = poly[j],
          b = poly[i]
        const dx1 = p2[0] - p1[0],
          dy1 = p2[1] - p1[1]
        const dx2 = b[0] - a[0],
          dy2 = b[1] - a[1]
        const denom = dx1 * dy2 - dy1 * dx2
        if (Math.abs(denom) < 1e-12) continue
        const dx3 = a[0] - p1[0],
          dy3 = a[1] - p1[1]
        const t = (dx3 * dy2 - dy3 * dx2) / denom
        const u = (dx3 * dy1 - dy3 * dx1) / denom
        if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
          crossings.push({ t, pt: [p1[0] + t * dx1, p1[1] + t * dy1] })
        }
      }
      crossings.sort((a, b) => a.t - b.t)

      /* Walk through the line collecting inside segments */
      let inside = p1In
      let lastPt = p1

      for (const cr of crossings) {
        if (inside) {
          hatchLines.push({ path: [lastPt, cr.pt], color })
        }
        inside = !inside
        lastPt = cr.pt
      }
      if (inside) {
        hatchLines.push({ path: [lastPt, p2], color })
      }
    }
  }

  /* Diagonal hatch lines inside clipped KML intersections */
  const hatchLayer = new PathLayer<HatchLine>({
    id: "note-kml-hatch",
    data: hatchLines,
    getPath: (d) => d.path,
    getColor: (d) => d.color,
    getWidth: 1,
    widthMinPixels: 1,
    widthMaxPixels: 1,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    parameters: { depthTest: false } as any,
    updateTriggers: {
      getPath: [notes, kmlGeoJson, zoom],
      getColor: [notes],
    },
  })

  /* Line path highlights — KML lines clipped to note zones */
  interface LineHighlight {
    path: [number, number][]
    color: [number, number, number, number]
    width: number
  }

  const lineHighlights: LineHighlight[] = []
  for (const note of notesWithPolygon) {
    const color = hexToRgba(note.color, 150)
    for (const folder of visibleLineFolders) {
      const w = kmlLayerStyles[folder.name].width + 4
      for (const kmlLine of folder.lines) {
        const clipped = clipLineToPolygon(kmlLine.coordinates, note.polygon!)
        for (const sub of clipped) {
          lineHighlights.push({ path: sub, color, width: w })
        }
      }
    }
  }

  /* Highlighted overlay on KML lines inside note zones */
  const lineHighlightLayer = new PathLayer<LineHighlight>({
    id: "note-kml-line-highlight",
    data: lineHighlights,
    getPath: (d) => d.path,
    getColor: (d) => d.color,
    getWidth: (d) => d.width,
    widthMinPixels: 3,
    capRounded: true,
    jointRounded: true,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    parameters: { depthTest: false } as any,
    updateTriggers: {
      getPath: [notes, visibleLineFolders],
      getColor: [notes],
      getWidth: [notes, kmlLayerStyles],
    },
  })

  /* In report mode, only show KML highlights — no interactive note zones or vertex handles.
     Include areaLayer temporarily to debug visibility. */
  if (reportMode) {
    return [areaLayer, sectorHighlightLayer, borderLayer, hatchLayer, lineHighlightLayer]
  }

  return [areaLayer, sectorHighlightLayer, borderLayer, hatchLayer, lineHighlightLayer, vertexLayer]
}
