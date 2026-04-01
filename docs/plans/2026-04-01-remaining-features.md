# Remaining Features Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement 3 remaining features: simplified Direct Fire, waypoint visualization with drag editing, and save/load via IndexedDB.

**Architecture:** Direct Fire becomes a quick-fire panel that auto-selects the closest launcher in range. Waypoints rendered as a deck.gl PathLayer with draggable dots. Save/load uses existing `idb` library + worker's `getFullState()` serialization.

**Tech Stack:** React, TypeScript, Zustand, deck.gl PathLayer, IndexedDB via idb 8, Comlink Web Worker

---

### Task 1: Simplify Direct Fire — auto-pick closest launcher

**Files:**
- Modify: `src/components/panels/StrikePanel.tsx` (DirectFireTab, lines 222-424)

**What changes:**
When a target is set (`targetUnitId`), DirectFireTab should:
1. Auto-find all friendly units with offensive weapons in range of the target
2. Sort by distance (closest first)
3. Show a simple list: weapon name, launcher name, distance, +/- quantity
4. Fire button distributes starting from closest

Replace the current "select units first, then pick target" flow with "click enemy → closest launchers auto-listed → fire."

**Implementation:**

In DirectFireTab, replace the `selectedUnits`-based weapon aggregation with target-based launcher discovery:

```typescript
// Instead of aggregating from selectedUnitIds, find all launchers that can reach the target
const inRangeLaunchers = useMemo(() => {
  if (!target) return []
  return friendlyUnits
    .flatMap(u => u.weapons
      .filter(w => {
        const spec = weaponSpecs[w.weaponId]
        return spec && spec.type !== 'sam' && w.count > 0 && 
               haversine(u.position, target.position) <= spec.range_km
      })
      .map(w => ({
        unitId: u.id, unitName: u.name,
        weaponId: w.weaponId, weaponName: weaponSpecs[w.weaponId]?.name ?? w.weaponId,
        count: w.count, maxCount: w.maxCount,
        distance: Math.round(haversine(u.position, target.position)),
      }))
    )
    .sort((a, b) => a.distance - b.distance)
}, [friendlyUnits, target])
```

Show as: `DDG-89 Mustin — 349km — Tomahawk [-3+] / 45`

Fire distributes from closest launcher first (not round-robin).

**Step 1:** Rewrite DirectFireTab internals
**Step 2:** Verify `npx tsc -b` passes
**Step 3:** Test in browser — click enemy, see sorted launchers, fire
**Step 4:** Commit

---

### Task 2: Waypoint PathLayer — show planned routes on map

**Files:**
- Create: `src/components/map/layers/WaypointLayer.ts`
- Modify: `src/components/map/GameMap.tsx` (add layer to layers array)

**Implementation:**

```typescript
// WaypointLayer.ts
import { PathLayer, ScatterplotLayer } from '@deck.gl/layers'
import type { ViewUnit } from '@/types/view'

interface WaypointPath {
  path: [number, number][]
  unitId: string
  nation: string
}

export function createWaypointLayers(units: ViewUnit[], selectedUnitIds: Set<string>) {
  // Show waypoint paths for selected units that are moving
  const paths: WaypointPath[] = units
    .filter(u => selectedUnitIds.has(u.id) && u.waypoints && u.waypoints.length > 0)
    .map(u => ({
      path: [
        [u.position.lng, u.position.lat],
        ...u.waypoints.map(w => [w.lng, w.lat] as [number, number])
      ],
      unitId: u.id,
      nation: u.nation,
    }))

  // Waypoint dots
  const dots = paths.flatMap(p => 
    p.path.slice(1).map((pos, i) => ({ position: pos, nation: p.nation, index: i, unitId: p.unitId }))
  )

  return [
    new PathLayer({
      id: 'waypoint-paths',
      data: paths,
      getPath: d => d.path,
      getColor: [100, 200, 255, 120],
      getWidth: 2,
      widthUnits: 'pixels',
      dashJustified: true,
      getDashArray: [8, 4],
    }),
    new ScatterplotLayer({
      id: 'waypoint-dots',
      data: dots,
      getPosition: d => d.position,
      getRadius: 6,
      radiusUnits: 'pixels',
      getFillColor: [100, 200, 255, 200],
      stroked: true,
      getLineColor: [255, 255, 255, 150],
      lineWidthPixels: 1,
      pickable: true,
    }),
  ]
}
```

In GameMap.tsx, add to layers array:
```typescript
...createWaypointLayers(units, selectedUnitIds),
```

Need to add `waypoints` to ViewUnit in types/view.ts (currently missing).

**Step 1:** Add `waypoints` to ViewUnit type + toViewUnit function
**Step 2:** Create WaypointLayer.ts
**Step 3:** Add to GameMap layers
**Step 4:** Verify — select a unit, right-click to move, see dashed path + dots
**Step 5:** Commit

---

### Task 3: Waypoint drag editing

**Files:**
- Modify: `src/components/map/layers/WaypointLayer.ts` (make dots draggable)
- Modify: `src/components/map/GameMap.tsx` (handle drag events)
- Modify: `src/store/bridge.ts` (send updated waypoints)

**Implementation:**

The ScatterplotLayer dots in WaypointLayer need to fire drag events. deck.gl doesn't have native drag — use `onDragStart/onDrag/onDragEnd` on the MapGL component, detecting when a waypoint dot is being dragged.

Simpler approach: on click of a waypoint dot, enter "waypoint edit mode" where the next map click repositions that waypoint.

```typescript
// In GameMap, add state:
const [editingWaypoint, setEditingWaypoint] = useState<{unitId: string, index: number} | null>(null)

// Waypoint dot click → enter edit mode
// Next map click → send MOVE_UNIT with updated waypoints
```

**Step 1:** Add waypoint click handler
**Step 2:** Add edit mode state to GameMap
**Step 3:** On map click in edit mode, update waypoint via MOVE_UNIT command
**Step 4:** Show visual feedback (highlight edited dot)
**Step 5:** Commit

---

### Task 4: Shift+right-click to queue waypoints

**Files:**
- Modify: `src/components/map/ContextMenu.tsx`
- Modify: `src/components/map/GameMap.tsx`

Currently right-click sends MOVE_UNIT replacing all waypoints. Shift+right-click should append.

**Implementation:**

In ContextMenu, detect shift key:
```typescript
// Pass shiftKey from the right-click event through to ContextMenu
<ContextMenu ... shiftKey={ctxMenu.shiftKey} />

// In ContextMenu:
if (shiftKey) {
  // Append waypoint to existing waypoints
  const existingWaypoints = unit.waypoints ?? []
  sendCommand({
    type: 'MOVE_UNIT',
    unitId: unit.id,
    waypoints: [...existingWaypoints, { lat: lngLat.lat, lng: lngLat.lng }],
  })
} else {
  // Replace waypoints
  sendCommand({
    type: 'MOVE_UNIT',
    unitId: unit.id,
    waypoints: [{ lat: lngLat.lat, lng: lngLat.lng }],
  })
}
```

Need to pass shiftKey from GameMap's onContextMenu through CtxMenu state.

Also need waypoints in ViewUnit so ContextMenu can read existing waypoints.

**Step 1:** Add shiftKey to CtxMenu interface in GameMap
**Step 2:** Pass e.originalEvent.shiftKey from onContextMenu
**Step 3:** Update ContextMenu to check shiftKey and append vs replace
**Step 4:** Test — right-click moves, shift+right-click adds waypoint
**Step 5:** Commit

---

### Task 5: Save/Load via IndexedDB

**Files:**
- Create: `src/store/save-load.ts`
- Modify: `src/engine/worker.ts` (add loadState method)
- Modify: `src/engine/game-engine.ts` (add loadState method)
- Modify: `src/components/hud/TopBar.tsx` (add save/load buttons)

**Implementation:**

```typescript
// save-load.ts
import { openDB } from 'idb'

const DB_NAME = 'realpolitik'
const STORE_NAME = 'saves'

async function getDB() {
  return openDB(DB_NAME, 1, {
    upgrade(db) { db.createObjectStore(STORE_NAME) }
  })
}

export async function saveGame(slotName: string, stateJson: string) {
  const db = await getDB()
  await db.put(STORE_NAME, { state: stateJson, timestamp: Date.now(), name: slotName }, slotName)
}

export async function loadGame(slotName: string): Promise<string | null> {
  const db = await getDB()
  const save = await db.get(STORE_NAME, slotName)
  return save?.state ?? null
}

export async function listSaves(): Promise<{key: string, name: string, timestamp: number}[]> {
  const db = await getDB()
  const keys = await db.getAllKeys(STORE_NAME)
  const saves = []
  for (const key of keys) {
    const save = await db.get(STORE_NAME, key)
    if (save) saves.push({ key: String(key), name: save.name, timestamp: save.timestamp })
  }
  return saves.sort((a, b) => b.timestamp - a.timestamp)
}
```

Worker needs a `loadState(json: string)` method that parses JSON back to GameState:
```typescript
loadState(json: string): void {
  const raw = JSON.parse(json)
  engine.state = {
    time: raw.time,
    nations: raw.nations,
    units: new Map(raw.units),
    missiles: new Map(raw.missiles),
    engagements: new Map(raw.engagements),
    events: raw.events,
    pendingEvents: [],
  }
}
```

TopBar gets SAVE/LOAD buttons. Save calls `api.getFullState()` → `saveGame()`. Load calls `loadGame()` → `api.loadState()`.

**Step 1:** Create save-load.ts with IndexedDB operations
**Step 2:** Add loadState to worker.ts + game-engine.ts
**Step 3:** Add save/load buttons to TopBar
**Step 4:** Test — play game, save, reload page, load → state restored
**Step 5:** Commit

---

## Execution Order

Tasks 1-4 are independent. Task 5 is independent of all others.

Parallel groups:
- **Group A (engine):** Task 5 (save/load)
- **Group B (UI):** Task 1 (direct fire), Task 2+3 (waypoints), Task 4 (shift+right-click)

All can be dispatched in parallel as worktree agents.
