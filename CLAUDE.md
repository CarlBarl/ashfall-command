# REALPOLITIK

Browser-based geopolitical/military strategy simulator. PoC: USA vs Iran, 2026.

## Design Philosophy

**Realism is the #1 priority.** Every mechanic must be physically plausible:
- Weapon specs must match real-world data (CSIS, FAS, IISS, GlobalFirepower)
- Missile flight profiles must model fuel, speed, altitude realistically
- AD engagement envelopes must respect altitude limits (SM-2 can't reach exo-atmospheric)
- Interceptors are real flying objects, not instant dice rolls
- Ballistic missiles accelerate during terminal reentry
- Cruise missiles slow and crash when fuel depletes
- Use the realism-checker agent after any engine change

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

## Agent Team Development

This project uses **agent teams** for parallel development. The team structure is permanent and should be used for all future feature work.

### Team: `realpolitik-features`

| Role | Model | Scope |
|------|-------|-------|
| **Team Lead** (main session) | Opus | Orchestration, integration, architecture, App.tsx, GameMap.tsx, game-engine.ts |
| **UI agents** | Sonnet | Panels, HUD components, visualization layers — new files only |
| **Engine agents** | Opus | Game systems (combat, AI, economy, orders) — new files only |
| **Review agent** | Opus | Code review after each phase merge |

### Workflow

1. **Plan** — team lead breaks work into independent tasks with zero file overlap
2. **Spawn** — launch agents in worktrees (isolation: "worktree"), one per task
3. **Build** — agents create new files only, never modify existing ones
4. **Merge** — team lead merges branches, wires new code into App/GameMap/engine
5. **Review** — code-reviewer agent validates the integration
6. **Iterate** — save learnings to auto-memory, update this CLAUDE.md

### Rules for agents

- **Read CLAUDE.md first** before any work
- **New files only** — never modify files you don't own. Team lead handles integration.
- **Verify** — run `npx tsc -b` and `npm run build` before committing
- **Commit** — commit your work in the worktree when done
- **Report** — message the team lead with what you created and any gotchas

### File ownership

| Owner | Files |
|-------|-------|
| Team lead (only) | `App.tsx`, `GameMap.tsx`, `game-engine.ts`, `worker.ts`, `bridge.ts` |
| Any agent | New files in `components/`, `engine/systems/`, `data/`, `store/` |
| Shared (read-only) | `types/*.ts`, `styles/globals.css`, `CLAUDE.md` |

### Iteration philosophy

- After each development cycle, save what worked and what didn't to auto-memory
- Update this CLAUDE.md with new conventions discovered during development
- Agent prompts should get better over time — more specific, fewer mistakes
- Prefer small focused agents over large monolithic ones
- Use Sonnet for UI, Opus for engine logic — matches cost/capability

## Commands

- `npm run dev` — start dev server
- `npm run build` — type-check + build
- `npm run lint` — eslint
