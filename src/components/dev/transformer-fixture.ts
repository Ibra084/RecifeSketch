import type { DrawingAction, DrawCurveAction } from "@/lib/drawing/protocol"

/** Renderer regression fixture only. Never selected by the production tutor. */
export function transformerFixture(): DrawingAction[] {
  function winding(id: string, x: number, y: number, turns: number, color: "blue" | "red"): DrawCurveAction {
    const segments: DrawCurveAction["segments"] = []
    for (let i = 0; i < turns; i++) {
      const top = y + i * 32
      segments.push({ c1: { x: x + 115, y: top - 8 }, c2: { x: x + 115, y: top + 24 }, end: { x, y: top + 24 } },
        { c1: { x: x - 15, y: top + 24 }, c2: { x: x - 15, y: top + 32 }, end: { x, y: top + 32 } })
    }
    return { type: "draw_curve", id, start: { x, y }, segments, color, size: "m" }
  }
  return [
    { type: "write_text", id: "title", position: { x: 140, y: 35 }, text: "Transformer · two separate windings", size: "l" },
    { type: "create_shape", id: "core", shape: "rectangle", x: 250, y: 160, w: 380, h: 300, dash: "solid", color: "grey", label: "Soft iron core" },
    { type: "create_shape", id: "window", shape: "rectangle", x: 310, y: 220, w: 260, h: 180, dash: "solid", color: "grey" },
    winding("primary", 230, 250, 4, "blue"),
    winding("secondary", 550, 218, 6, "red"),
    { type: "write_text", id: "primary-name", position: { x: 185, y: 115 }, text: "Primary · 4 turns", color: "blue", size: "s" },
    { type: "write_text", id: "secondary-name", position: { x: 530, y: 115 }, text: "Secondary · 6 turns", color: "red", size: "s" },
    { type: "draw_arrow", id: "input", start: { x: 100, y: 300 }, end: { x: 210, y: 300 }, label: "AC input", color: "blue" },
    { type: "draw_arrow", id: "output", start: { x: 660, y: 300 }, end: { x: 780, y: 300 }, label: "Induced AC voltage", color: "red" },
    { type: "draw_arrow", id: "flux", start: { x: 355, y: 190 }, end: { x: 510, y: 190 }, color: "green", dash: "dashed" },
    { type: "write_text", id: "flux-note", position: { x: 355, y: 270 }, text: "Changing flux\nin the core", color: "green", size: "s" },
    { type: "write_equation", id: "ratio", position: { x: 250, y: 545 }, expression: "Vp / Vs = Np / Ns = 4 / 6" },
    { type: "write_text", id: "note", position: { x: 220, y: 600 }, text: "More secondary turns → higher AC voltage\nIdeal transformer; windings are electrically separate.", size: "s" },
    { type: "focus_camera", target: { kind: "bounds", region: { x: 60, y: 0, w: 800, h: 690 } } },
  ]
}
