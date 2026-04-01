# REALPOLITIK

Browser-based geopolitical/military strategy simulator. PoC: USA vs Iran, 2026.

## Architecture

- **Game engine**: Web Worker (simulation) ↔ Comlink RPC ↔ Main thread (React UI)
- **Worker owns canonical state**, main thread polls `getViewState()` at 30fps
- **Map**: MapLibre GL JS + deck.gl (interleaved mode) via react-map-gl
- **State**: Zustand (ui-store for UI, game-store for simulation snapshots)
- **Events**: One-shot delivery — worker accumulates, poll returns and clears

## Conventions

- Path alias: `@/` → `src/`
- All game data uses real-world values (weapon specs, positions, economics)
- Types in `src/types/` — shared between worker and main thread
- Game systems in `src/engine/systems/` — pure functions operating on GameState
- Components follow: `map/`, `panels/`, `hud/`, `common/`
- Dark military theme — CSS variables in `src/styles/globals.css`
- Speed multiplier: burst N ticks per 100ms interval, never faster intervals

## Key Decisions

- deck.gl interleaved mode (not overlay) for proper depth with MapLibre layers
- TripsLayer for missile animation (path + timestamps + currentTime)
- @turf/circle for range rings → MapLibre GeoJSON layers (not deck.gl)
- Seeded PRNG for deterministic replay
- Comlink wraps worker API as async methods

## Commands

- `npm run dev` — start dev server
- `npm run build` — type-check + build
- `npm run lint` — eslint
