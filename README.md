# Ashfall Command

**Browser-based geopolitical/military strategy simulator -- USA vs Iran 2026**

## What is this?

Ashfall Command is a real-time strategy simulator set in a hypothetical 2026 US-Iran conflict. You command air, naval, and missile assets across an interactive map, managing air strikes, missile salvos, intelligence gathering, and economic warfare. The game runs entirely in the browser with no backend required.

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

- **Interactive war map** with MapLibre GL and deck.gl overlay layers (units, missiles, supply lines, shipping lanes, minefields, range rings, line-of-sight, elevation, impact markers)
- **Realistic order of battle** -- detailed US and Iranian military unit rosters with real weapon systems (aircraft, missiles, drones, air defense, point defense)
- **AI opponent** with phased behavior (peacetime, alert, defensive, offensive, attrition) and drone swarm logic
- **Missile and strike planning** -- attack planner with weapon selection, target assignment, salvo coordination, and strike routes plotted around enemy radar coverage
- **Shipping and blockade warfare** -- Strait of Hormuz shipping lanes, minefields, and oil throughput effects
- **Supply and logistics** -- supply lines, base supply networks, resupply, and unit repair
- **Intelligence and espionage** -- detection systems, sensor networks, satellite tracking, intel budgets, and player-placed enemy position estimates
- **Economy simulation** -- GDP, military budgets, oil revenue, sanctions impact, war costs, and reserves
- **Scenario system** -- pre-built USA vs Iran 2026 scenario plus a free deployment mode with a force-selection budget
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
