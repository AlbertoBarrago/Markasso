Architecture of a Professional Whiteboard Engine

The core idea is:

User Input
   ↓
Tool
   ↓
Command
   ↓
State Reducer
   ↓
Scene Graph
   ↓
Renderer
   ↓
Canvas

Everything flows one direction.

No tool modifies the canvas directly.

1. Core Concept — Scene Graph

Instead of directly drawing shapes, we maintain a Scene.

Scene
 ├── elements[]
 ├── selection[]
 ├── viewport
 └── appState

Example:

class Scene:
    elements: list[Element]
    selected_ids: set[str]
    viewport: Viewport
    app_state: AppState

This is the single source of truth.

2. Immutable State

State is never mutated.

Instead we create new versions.

Example:

new_scene = reducer(scene, command)

Benefits:

Undo/Redo becomes trivial

Debugging easier

Collaboration easier

Deterministic UI

3. Element Model

Every drawable object inherits from Element.

@dataclass
class Element:
    id: str
    type: str
    x: float
    y: float
    stroke: str
    fill: str

Specialized elements:

RectangleElement
EllipseElement
LineElement
ArrowElement
FreehandElement
TextElement

Example:

@dataclass
class RectangleElement(Element):
    width: float
    height: float
4. Tool System

Tools generate commands, not drawing operations.

Example:

RectangleTool
PenTool
SelectTool
TextTool

Interface:

class Tool:

    def on_mouse_down(self, event, scene):
        pass

    def on_mouse_move(self, event, scene):
        pass

    def on_mouse_up(self, event, scene):
        pass

The tool emits commands.

5. Command System

Commands describe state changes.

Example:

CreateElement
MoveElement
ResizeElement
DeleteElement
EditText

Example command:

@dataclass
class CreateElementCommand:
    element: Element
6. Reducer (State Engine)

Commands are applied by a reducer.

new_scene = reducer(old_scene, command)

Example:

def reducer(scene, command):

    if isinstance(command, CreateElementCommand):
        return Scene(
            elements=scene.elements + [command.element],
            selected_ids=scene.selected_ids,
            viewport=scene.viewport,
            app_state=scene.app_state
        )

This is similar to Redux architecture.

7. Renderer

Renderer reads the scene and draws it.

Scene → Canvas

Renderer never changes state.

class Renderer:

    def render(self, scene):
        for element in scene.elements:
            self.draw_element(element)
8. Selection Engine

Selection is stored in state.

scene.selected_ids

Example:

scene.selected_ids = {"abc123", "xyz456"}

Renderer draws selection boxes.

9. History (Undo / Redo)

Because state is immutable we store scene snapshots.

History
 ├── past[]
 ├── present
 └── future[]

Undo:

present → future
past[-1] → present

Redo:

future[0] → present

This system is O(1).

10. Rendering Pipeline

Rendering steps:

1 draw grid
2 draw elements
3 draw selection
4 draw handles
5 draw cursor preview

Renderer example:

def render(scene):

    draw_grid(scene.viewport)

    for element in scene.elements:
        draw_element(element)

    draw_selection(scene.selected_ids)
11. Event Pipeline

Events flow like this:

Mouse Event
   ↓
Tool
   ↓
Command
   ↓
Reducer
   ↓
New Scene
   ↓
Renderer

This prevents UI logic chaos.

12. Viewport System

Viewport handles:

zoom
pan
scroll

Example:

@dataclass
class Viewport:
    offset_x: float
    offset_y: float
    zoom: float
13. Collaboration Ready Design

Commands can be transmitted:

WebSocket
CRDT
Operational Transform

Instead of syncing the scene we sync commands.

Example message:

{
  "type": "CreateElement",
  "element": {...},
  "user": "alice",
  "timestamp": 123456
}
14. Why This Architecture is Powerful

Benefits:

Feature	Result
Undo	trivial
Redo	trivial
Collaboration	easy
Debugging	deterministic
Plugins	easy
Testing	simple
15. Final Folder Structure
whiteboard/

core/
scene.py
viewport.py
app_state.py

elements/
element.py
rectangle.py
ellipse.py
line.py
text.py

tools/
tool.py
select_tool.py
rectangle_tool.py
pen_tool.py

commands/
commands.py

engine/
reducer.py
history.py

rendering/
renderer.py
canvas_view.py

ui/
toolbar.py
menu.py
shortcuts.py

main.py
16. The Key Idea

Canvas is dumb.

Canvas only renders.

Everything else happens in the state engine.

This is the same design philosophy used in:

Excalidraw

Figma

tldraw

💡 Since you are building AI tooling (like your ApolloAgent project), this architecture has another very powerful advantage:

AI can generate diagram edits as commands.

Example:

AI → CreateRectangle
AI → MoveElement
AI → AddText

Meaning you could build:

"AI whiteboard editor"
