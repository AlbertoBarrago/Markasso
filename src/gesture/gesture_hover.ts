/**
 * Shared hover state between the gesture command adapter and canvas_view's
 * render loop. A plain mutable singleton keeps the two modules decoupled —
 * neither needs a reference to the other, and there is only ever one
 * GestureCommandAdapter instance per app lifetime.
 */
export const gestureHover: { id: string | null } = { id: null };
