# Chip's Challenge – original game + compatible JSON map editor

This build uses the original game client from `files(1).zip` as the gameplay/rendering base. The following original files are kept unchanged:

- `css/atlas.css` – original CSS atlas carving/masking
- `css/game.css` – original game layout and pixel-art presentation
- `js/tiles.js` – original 112-tile catalogue and tile properties
- `tiles.png` – original 416×512 tileset
- `tiles.html` – original tile reference page

The playable renderer in `js/game.js` keeps the original 32×32 tiles, 30 FPS loop, 140 ms visual step animation, and 500 ms player movement rate. It adds a small compatibility layer for JSON levels, 1–9 hotkeys, direct JSON import (`I`), and opening the editor (`E`).

## Open the game
Open `index.html` in a browser.

Controls:

- WASD / Arrow keys: move one tile at a time
- P / Space: pause
- R: restart
- 1–9: choose bundled level
- I: import a JSON level
- E: open the map editor

## Open the editor
Open `editor.html`.

The editor is separate from the game runtime, so gameplay state cannot accidentally become part of a saved map.

- Paint and erase tiles directly on the grid.
- Search the full original 112-tile atlas by name or ID.
- Use the original `tiles.png` once as the atlas; editor cells use CSS background positioning and masks rather than creating sliced image files.
- Place Chip, spiders, spirals, and dirt blocks as actors.
- Select a spiral and use the Spiral path tool to author its fixed loop.
- Edit selected tile gameplay properties through per-level `rules` overrides.
- Undo/redo editor actions with Ctrl+Z / Ctrl+Y.
- Save a level directly to JSON with Save map / Ctrl+S.
- Save the complete 1–9 pack.
- Import a single JSON map or a JSON pack.
- Use “Save & play this map” to hand the current editor map to `index.html` without changing the map data.
- Browser autosave is kept per level slot for convenience.

## JSON format

Each level stores:

- map metadata (`title`, `author`, `timeLimit`, `requiredChips`, `hint`)
- `width` / `height`
- a flat numeric `tiles` array of original tile IDs (`0x00`–`0x6F`)
- `actors` with positions, directions, speeds, variants and spiral paths
- optional per-level `rules` overrides
- a `tileset` descriptor identifying `tiles.png`, 32×32 cells and its 416×512 dimensions

The PNG is deliberately not embedded in JSON. A map file therefore stays small and depends on the supplied `tiles.png` file for the actual art.

Bundled editable maps are in `levels/level-01.json` through `levels/level-09.json`.


## Custom monsters and blocks (v4)
The editor can create a monster actor from the exact monster tile selected in the original atlas. The actor JSON stores `type: "monster"`, the linked `tileId`, movement speed, facing direction, loop `path`, and optional `aiChase`/`visionRange`. The game renders the same atlas sprite and keeps the authored path association. Teeth (the large red-lipped CC1 monster, tile family `0x54–0x57`) can chase Chip when they have orthogonal line of sight, then return to the nearest point of their authored path when they lose sight.

Dirt blocks are real moving actors. Chip can push them only when the destination square is not occupied or a blocking wall/door/socket. Blocks can slide on ice and force floors, and pushing a block into water converts the water square to dirt as in the classic mechanic. A block with no free destination remains in place, including when pushed into a corner.

The editor's JSON is the source of truth for authored monster paths and block placement; gameplay changes are runtime-only and are not written back to the level JSON.

## Latest monster and thief behavior

- **Spiders** use the restored original A* pursuit behavior by default: 9-tile Manhattan aggro, a maximum 14-step search, and the original left/wall-following fallback when A* cannot make a move. An authored closed loop is optional per Spider in the editor; enabling it switches that Spider from AI movement to its saved loop.
- **Teeth (red lips)** can use a predefined closed loop and A* movement. Teeth detect Chip in all directions with line-of-sight through open space. The last confirmed sighting keeps the Teeth focused for **5 seconds**; when that focus expires, the Teeth pathfind back to the nearest saved path cell and resume its loop.
- **Thief (tile 0x21)** clears Chip's keys and equipment and displays exactly **"The thief took all your items."** while Chip is standing on the thief tile. The normal level hint returns immediately when Chip leaves it.

## Monster tuning and focus

Monster timing is controlled by `window.CC_MONSTER_CONFIG` in `js/game.js`. Lower `...MoveMs` values mean faster movement. The defaults are Spider 800 ms/tile, Spiral 600 ms/tile, Teeth 400 ms/tile, and generic monsters 500 ms/tile. Vision/focus defaults are 10 tiles, with a 10-tile focus-distance limit and a 5-second Teeth focus grace period.

Per-map `monsterSettings` and per-actor `speed`, `visionRange`, `focusLoseDistanceTiles`, `focusMs`, and `neverLoseFocus` are preserved in JSON. `neverLoseFocus` uses boolean/`1` semantics: once an AI monster has acquired Chip inside its vision range, it keeps chasing instead of expiring its focus timer. Walls, hidden walls, popup walls, doors, blocks, and other monsters block line of sight; monsters cannot see through them.

## Editor entry

Press `E` during play to open `editor.html`. The editor is a normal HTML document that loads the original atlas/game data first and then `js/editor.js`; it is intentionally kept separate from the play renderer so editing cannot corrupt runtime state.

### Yellow question-mark map hints
Each map has exactly one configurable `hint` message. Place the original yellow question-mark/hint tile (`0x2F`) anywhere on the map. When Chip moves onto that tile, the map's hint is shown in the HUD. When Chip steps off it, the message remains visible for 5 seconds and then clears. The JSON stores this behavior in `hintSettings` with `triggerTileId: 47` and `offDelayMs: 5000`. The editor's **Map hint shown by yellow question mark (0x2F)** field is the only hint message for that map.
## Hidden dirt / red trigger (v8)
Hidden dirt is stored separately from the visible tile array. In the editor, choose **Hidden dirt** and click a cell; the cell keeps displaying its normal underlying tile until Chip steps on the red button/trigger tile (`0x24`). The first activation on that playthrough reveals every hidden-dirt entry in the map as a movable dirt block. The trigger is one-shot per level load, so stepping on additional red triggers later does not spawn a second set. Hidden-dirt entries store `x`, `y`, and `underTile` in JSON, while `hiddenDirtSettings` stores the trigger tile and one-shot behavior. The editor also prevents hidden dirt from overlapping an actor or the trigger cell.

Dirt blocks are pushed one tile at a time by Chip. When a block is pushed onto an ice tile it continues gliding in the push direction until the next tile is no longer ice or an obstacle blocks it; it stops instead of bouncing backward when it becomes stuck in a corner or against an obstacle. Chip's ice skates do not affect dirt-block sliding. When a dirt block, including a hidden dirt block revealed by the red trigger, reaches water, the block is expended at the end of its movement animation. The former water cell briefly displays the normal walkable-dirt tile (`0x0B`) and, exactly 100 ms later in game time, changes to the normal light-grey walkable floor (`0x00`). Chip can then traverse the cell safely.

