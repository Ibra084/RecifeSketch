import { describe, expect, it } from "vitest"
import { chooseStartingBoard } from "./board-cache"

const server = { snapshot: { from: "server" }, updatedAt: "2026-10-17T10:00:00.000Z" }

describe("chooseStartingBoard", () => {
  it("opens the server copy when nothing is cached", () => {
    expect(chooseStartingBoard(server, undefined)).toEqual({ snapshot: server.snapshot, needsSync: false })
  })

  it("restores unsaved local work and uploads it (tab closed before the save finished)", () => {
    const cached = { snapshot: { from: "cache" }, dirty: true, serverUpdatedAt: "2026-10-17T09:00:00.000Z" }
    expect(chooseStartingBoard(server, cached)).toEqual({ snapshot: cached.snapshot, needsSync: true })
  })

  it("uses the local copy when the page was rendered from an older save", () => {
    const cached = { snapshot: { from: "cache" }, dirty: false, serverUpdatedAt: "2026-10-17T11:00:00.000Z" }
    expect(chooseStartingBoard(server, cached)).toEqual({ snapshot: cached.snapshot, needsSync: false })
  })

  it("prefers the server copy when it is as new or newer (e.g. edited on another device)", () => {
    const same = { snapshot: { from: "cache" }, dirty: false, serverUpdatedAt: server.updatedAt }
    const older = { ...same, serverUpdatedAt: "2026-10-17T08:00:00.000Z" }
    expect(chooseStartingBoard(server, same).snapshot).toBe(server.snapshot)
    expect(chooseStartingBoard(server, older).snapshot).toBe(server.snapshot)
  })
})
