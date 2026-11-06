# Architecture

How Markasso is built, for contributors. For what the app does, see the [User Manual](./MANUAL.md); for the module map and coding guidelines, see [AGENTS.md](./AGENTS.md).

## Data Flow

Markasso follows a **Redux-style unidirectional data flow**: no mutable state, no event spaghetti, no surprises.

```
User event
    │
    ▼
Tool (onMouseDown / onMouseMove / onMouseUp)
    │  dispatches Command
    ▼
History.dispatch(command)
    │  calls
    ▼
reducer(Scene, Command) → Scene   ← pure function, no side effects
    │  notifies
    ▼
Subscribers (toolbar, properties panel, canvas view)
    │
    ▼
render(ctx, scene, canvas)        ← called every requestAnimationFrame
```

## Key Invariants

- **All coordinates in CSS pixels.** The canvas buffer is `clientWidth × devicePixelRatio` for sharpness, but all viewport `offsetX/Y`, element positions, and mouse events live in CSS pixel space.
- **Immutable scene.** Every `Scene` object is never mutated. The reducer returns a new reference or the same reference if nothing changed (enabling cheap equality checks).
- **Ephemeral commands** (pan, zoom, set-viewport, select, tool change) are excluded from the undo stack.
- **`APPLY_STYLE`** is the single undoable command that updates both `appState` defaults and all currently selected elements in one atomic operation.

## Realtime Layer

On top of the local store, Markasso adds live collaboration via a Cloudflare Worker **Durable Object** (`SessionRoom` in `src/worker.ts`).

```
Client A ──┐
Client B ──┼── WebSocket /session/ws?room=<id> ──▶ SessionRoom DO
Client C ──┘                                           │ serializes commands
                                                       │ appends to room log (DO storage)
                                                       ▼
                                  broadcasts apply to all peers in server order
```

- The DO is the **single serialization point**: it appends each persistent command to the room's log and relays it to peers in arrival order, so replaying the deterministic `reducer` in the same order converges every client.
- **Ephemeral** view commands (pan/zoom/select/tool) and **cursors** are relayed live but never logged.
- **Seeding** publishes the creator's elements as `CREATE` commands into a fresh room (echo-suppressed by the server).
- Undo/redo are shared (model B); `History.applyRemote` applies network commands without touching the local undo stack or echoing them back.
- `realtime.ts` wires `History.onCommand` → WebSocket; `presence.ts` + `canvas_view.ts` render remote cursors. Limits: 20 peers/room, per-peer command rate limit, max message size.

## Technology Stack

| Concern | Choice | Rationale |
|---|---|---|
| Language | TypeScript 5 | Exhaustive `switch` on discriminated unions catches unhandled commands at compile time |
| Build | Vite | Zero-config, instant HMR, single-file output |
| Rendering | Canvas 2D API | Direct pixel control without virtual DOM overhead |
| Testing | Vitest | Runs in Node, no browser needed for reducer/viewport math |
| Realtime | Cloudflare Workers + Durable Objects | Free WebSocket hosting; one DO per room serializes commands; no extra npm deps |
| Dependencies | Core: none; Mermaid import: `@excalidraw/mermaid-to-excalidraw` | Core relies on native `crypto.randomUUID()`, `requestAnimationFrame`, `ResizeObserver`; Mermaid is a lazy-loaded chunk, so it costs nothing until used. Icon pack import uses the native `DecompressionStream`, no ZIP library |
