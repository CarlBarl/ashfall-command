# Ashfall Command

**Browser-based geopolitical/military strategy simulator -- USA vs Iran 2026**

## What is this?

Ashfall Command is a real-time strategy simulator set in a hypothetical 2026 US-Iran conflict. You command military assets across an interactive map, managing air strikes, missile salvos, ground operations, intelligence gathering, and economic warfare. The game runs entirely in the browser with no backend required.

## Tech Stack

- **React 19** -- UI framework
- **TypeScript** -- type-safe codebase
- **Vite** -- build tooling and dev server
- **MapLibre GL** + **react-map-gl** -- interactive map rendering
- **deck.gl** -- data-driven map overlay layers
- **Zustand** -- state management
- **Web Workers** (via Comlink) -- offloaded game engine loop
- **Turf.js** -- geospatial calculations
- **Vitest** -- unit testing

## Features

- **Interactive war map** with MapLibre GL and deck.gl overlay layers (units, missiles, frontlines, supply lines, range rings, line-of-sight, impact markers)
- **Realistic order of battle** -- detailed US and Iranian military unit rosters with real weapon systems (aircraft, missiles, drones, air defense, point defense)
- **AI opponent** with phased behavior (peacetime, alert, defensive, offensive, attrition) and drone swarm logic
- **Ground warfare** -- division-level ground units, generals, army groups, terrain modifiers, frontline computation, and ground combat resolution
- **Missile and strike planning** -- attack planner with weapon selection, target assignment, and salvo coordination
- **Supply and logistics** -- supply lines, base supply networks, national stockpiles, and logistics routing
- **Intelligence and espionage** -- detection systems, sensor networks, satellite tracking, intel budgets, and espionage operations
- **Economy simulation** -- GDP, military budgets, oil revenue, sanctions impact, war costs, and reserves
- **Research and tech tree** -- unlockable upgrades and technology progression
- **Scenario system** -- pre-built scenarios (USA vs Iran 2026, Fall Weiss 1939) plus a free deployment mode
- **Save/load** -- persistent game state via IndexedDB
- **Time controls** -- pause, play, and speed adjustment
- **Fully client-side** -- game engine runs in a Web Worker, no server needed

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

### Other scripts

| Command           | Description                |
| ----------------- | -------------------------- |
| `npm run build`   | Type-check and build       |
| `npm run preview` | Preview production build   |
| `npm run test`    | Run tests (Vitest)         |
| `npm run lint`    | Lint with ESLint           |

## License

See [LICENSE](LICENSE) if present.
