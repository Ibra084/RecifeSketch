import type { DrawingSequence } from "./types"

/**
 * A developer-only demonstration sequence for exercising the progressive
 * renderer. This exists to test the playback system itself - it is not
 * educational content and must never be dressed up as a real lesson.
 * It touches every action type the engine supports, grouped into steps
 * so related operations (e.g. a shape and the arrow pointing at it)
 * animate together, with short pauses at natural boundaries.
 */
export function buildRendererDemoSequence(): DrawingSequence {
  return [
    {
      actions: [
        {
          type: "create_shape",
          id: "demo-scratch",
          shape: "star",
          x: 900,
          y: -140,
          w: 60,
          h: 60,
          color: "light-red",
        },
      ],
    },
    {
      actions: [
        {
          type: "create_shape",
          id: "demo-shape",
          shape: "rectangle",
          x: 0,
          y: 0,
          w: 120,
          h: 80,
          color: "blue",
          label: "Shape",
        },
      ],
    },
    {
      actions: [
        {
          type: "create_freehand_path",
          id: "demo-path",
          points: [
            { x: 220, y: 40 },
            { x: 245, y: -10 },
            { x: 270, y: 60 },
            { x: 295, y: 0 },
            { x: 320, y: 40 },
          ],
          color: "orange",
        },
      ],
    },
    {
      actions: [
        {
          type: "create_polygon",
          id: "demo-polygon",
          points: [
            { x: 420, y: 80 },
            { x: 500, y: 80 },
            { x: 460, y: 0 },
          ],
          color: "violet",
          fill: "solid",
        },
      ],
    },
    {
      actions: [
        {
          type: "draw_arrow",
          id: "demo-arrow",
          start: { x: 120, y: 40 },
          end: { x: 420, y: 40 },
          label: "flows to",
        },
      ],
    },
    {
      actions: [
        {
          type: "write_text",
          id: "demo-text",
          position: { x: 0, y: 220 },
          text: "Renderer demo sequence",
        },
        {
          type: "write_equation",
          id: "demo-equation",
          position: { x: 0, y: 260 },
          expression: "a^2 + b^2 = c^2",
        },
      ],
    },
    {
      actions: [
        {
          type: "plot_function",
          id: "demo-plot",
          expression: "sin(x)",
          domain: [-6.28, 6.28],
          position: { x: 650, y: 350 },
          scale: { x: 20, y: 30 },
        },
      ],
    },
    {
      actions: [
        { type: "highlight_object", id: "demo-shape", color: "yellow" },
        { type: "move_object", id: "demo-shape", position: { x: 20, y: 20 } },
        { type: "update_object", id: "demo-shape", patch: { color: "green" } },
      ],
    },
    {
      actions: [{ type: "clear_region", region: { x: 850, y: -200, w: 150, h: 150 } }],
    },
    {
      actions: [
        {
          type: "focus_camera",
          target: { kind: "bounds", region: { x: -40, y: -40, w: 780, h: 430 } },
        },
      ],
    },
  ]
}
