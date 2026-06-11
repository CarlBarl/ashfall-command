# Roadmap v4 — toward the best browser military sim

Synthesized from a 5-agent research sweep 2026-06-11 (3D/terrain, air ops, TOT +
elevation, presentation, longevity). Every external source named here was
live-verified (curl) on 2026-06-11. Hard constraints unchanged: free/non-revenue,
purely client-side, Vercel static hosting.

Waves are ordered by recommendation. Effort is calendar-honest for this codebase.

## Wave A — Feel (each item ~hours-to-2-days, all prerequisites already shipped)

1. **Hillshade relief, always on.** Add a `raster-dem` source to both map styles —
   verified keyless+CORS sources: AWS Terrain Tiles
   `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png`
   (encoding `terrarium`, tileSize 256, native detail to z12 = SRTM 30 m) and
   `tiles.mapterhorn.com` (webp, far lighter, used by MapLibre's official 3D
   example). Dark-tuned hillshade layer below `overlay-anchor`; retire the static
   elevation overlay image. Attribution line: Mapzen/Tilezen + providers.
2. **TOT strikes (time-on-target).** `launch_i = TOT − flightTime_i` on top of the
   just-shipped `state.scheduledLaunches`. One master TOT control in the strike
   panel (default "earliest feasible"), read-only derived launch schedule, never
   per-launcher inputs (CMO/DCS pattern; CMO players used Excel before they got
   this). Plan summary shows estimated leakers all-at-TOT vs spread (fire-channel
   saturation math already exists) and a "first launch at T−Xh may be detected"
   warning when slow weapons are in the package — April vs October 2024 Iran
   strikes as emergent gameplay. Staggered/sequential become impact-window
   spreads on the same queue.
3. **Unit images in tooltips + pinned card.** 22-unit verified image list
   (research doc): US units all public-domain DoD photos on Wikimedia Commons;
   Iranian split PD-by-US-Navy + Tasnim/Fars CC BY 4.0 (credit line required).
   Hotlinking rejected (Commons 400s non-standard widths, discouraged) → build
   script downloads via `Special:FilePath?width=500`, re-encodes 250 px WebP into
   `public/unit-images/` (~400 KB total) + generates `src/data/unit-images.ts`
   with license metadata. Image shows only at `identified` level (intel reward).
   Credits panel entry mandatory incl. DoD non-endorsement disclaimer.
4. **Minimal sound kit.** 8 CC0 sounds (Kenney Interface Sounds + freesound CC0:
   klaxon, sonar ping #493162, radio squelch, launch whoosh, distant impact, CIC
   room tone, UI blips, error). AudioManager: master/sfx/ambient GainNodes,
   `ctx.resume()` on first gesture (autoplay rule), localStorage mute/volume,
   one pure event→sound table. DEFCON precedent: sound is the cheapest immersion
   multiplier in the genre. No camera shake — ops rooms flash and sound, never shake.
5. **Combat legibility:** DEFCON-style kill markers (expanding blot → persistent
   faint X + tally), contact track trails via `TripsLayer` (~30-point ring buffer,
   ~10 game-min trail, fadeTrail), 200-300 ms opacity transitions on range rings,
   300 ms tooltip hover delay + click-to-pin.

## Wave A addendum

6. **Engine scale stress test.** Synthetic scenario (~500 units, missiles in
   flight) driven 1000+ ticks in a vitest perf guard: assert average tick stays
   inside budget, log p95. Answers "do we need a faster engine" with numbers
   instead of vibes (decision 2026-06-11: stay TS, harden, WASM only if a
   measured hot path ever demands it).

## Wave B — TILT 3D — CUT (player decision 2026-06-11: no 3D)

Kept for the record only. Hillshade (Wave A.1) is 2D shading and stays.
Do not add pitch/terrain/sky features.

Everything needed ships in installed maplibre-gl 4.7.1 (terrain + sky + hillshade;
v5/globe explicitly unnecessary). Add `terrain {source, exaggeration ~1.1}` + `sky`
as style-root properties in BOTH styles (survives MAP/SAT swaps), maxPitch 70,
TILT toggle flies pitch 0 ↔ ~55. Default OFF (protect 30 fps baseline).
- deck.gl interop truth: keep `interleaved: false` (interleaved+terrain is broken,
  deck.gl#8091). Overlay mode = icons draw over ridges — correct for a command UI.
  Naval z=0 IS sea level; land units get z from the main-thread elevation grid;
  IconLayer billboards stay readable under pitch.
- Missile arcs: carry altitude into `Missile.path` as [lng,lat,alt], PathLayer with
  z + follow-cam at pitch ~60 for ballistic arcs — the visual payoff.
- Optional: maplibre-contour (BSD-3, same terrarium tiles) contour toggle for the
  tactical-chart look at pitch 0.
- Do NOT: interleaved mode, deck.gl TerrainLayer basemap, maplibre v5 migration,
  Cesium-style full 3D. Watch deck.gl#10173 (fractional browser zoom drift in
  installed 9.2.11).

## Wave C — Air war (the big gameplay feature, ~1-2 weeks)

Convergent design from CMO/Falcon/DCS Liberation: squadrons as pools, flights as
transient tracks, orders at mission level only. Slots into shipped systems
(contacts, datalink hubs, SAM envelopes, war support, satellite BDA products).
1. `airWing: SquadronState[]` on carrier + airbases. CVW-9 real 2026 composition
   (3×12 F/A-18E/F, 10 F-35C, 6 EA-18G, 5 E-2D — Lincoln really is in CENTCOM);
   Iran: F-14 Isfahan, MiG-29 Mehrabad/Tabriz, Su-24 Bushehr, Su-35 Hamadan.
   25-33% maintenance unavailability at start.
2. One Flight entity (2-4 airframes folded into one `aircraft`-category unit so
   movement/visibility/SAM/war-support work day one) + three verbs: CAP station
   (auto-intercept via combat-on-contacts), Strike package (transit → release →
   spawn existing missiles → RTB), AEW station (E-2D/E-3 pattern, datalink hub).
3. Sortie economy = CMO's published numbers: 90-min CAP quick-turn, 6 h surge /
   20 h sustained strike ready times, ~90-120 sorties/day carrier ceiling, one
   global SURGE OPS lever (96 h half ready-times, then ×1.5 sustained).
4. SEAD as EA-18G escort modifier (×0.6 SAM detect/pk in radius + emitting SAMs
   become ELINT contacts). Tanker tax not tanker tracks (+30-40% radius costs 2
   Super Hornet sorties; MQ-25 slipped to 2029). Strike-package planning delay
   2-6 h paces the war and rewards the intel workflow.
5. Iran plays a different air game: scramble-only interceptors vs approaching
   packages (ai.ts escalation hook), hoarded Su-35 HVT, parked airframes as
   strikeable airbase sub-targets whose loss permanently drains pools (BDA via
   the shipped imagery products — June 2025 ramp strikes). Pilot stakes: KIA /
   rescued / POW rolls feed war support + OSINT.
6. UI = Air Plan board (Task Force Admiral pattern): squadrons × launch-cycle
   windows, drop missions into cycles, engine air boss resolves. Read
   dcs-retribution's flight-plan builder for auto-escort suggestion logic.

## Wave D — Elevation fidelity (~2-4 days)

Two tiers (current grid ~5.5 km aliases whole Zagros ridges):
1. Build-time: regenerate static grid at 0.01° (~1.1 km) for the Gulf core box
   (lat 22-34, lng 44-64) as Int16 (~4.8 MB raw, ~2 MB brotli) from Copernicus
   GLO-30 COGs (verified keyless, HTTP Range OK, NO CORS → build-time only).
   Header gains a version field; ElevationGrid gains bilinear sampling.
2. Runtime: z11 terrarium tile LRU (128-256 tiles, 17-34 MB) decoded in the
   worker via createImageBitmap + OffscreenCanvas for hot paths (LOS viewsheds,
   TEL hide checks, cruise terrain-following) — ~68 m/px = DTED Level 1, the
   real military LOS standard. Coarse grid stays as fallback.

## Wave E — Longevity (pick per appetite)

1. **Command-log replay foundation** (FIRST — unlocks everything below): record
   (tick, Command) in executeCommand, seed+appVersion+scenarioHash in the save
   envelope, periodic syncHash. Watch-replay mode = re-simulate in a second
   worker. Caveat: JS trig isn't cross-engine deterministic — same-browser safe,
   pin versions (OpenRA sync-hash pattern).
2. **Daily Flashpoint**: date-hashed seed + fixed objectives + score + Wordle-style
   emoji share block with `#c=base64url(gzip())` challenge URL (CompressionStream,
   zero backend).
3. **Scenario import/export + URL loading**: .json export/drag-drop import; load
   from raw.githubusercontent/gist (CORS verified `*`). The JSON IS the editor.
4. **Community gallery**: ashfall-scenarios repo + index.json via jsDelivr —
   Steam Workshop with zero infrastructure, PR-based curation.
5. **Persistent theater week**: dawn-planning/dusk-debrief day cycle, persistent
   losses/ammo, sortie fatigue, procurement, one IndexedDB campaign slot (DCS
   Liberation loop compressed to 7 browser days). Do after Wave C.
6. **Rival commander persona**: templated communiqués from GameEvents into the
   OSINT feed, seeded-deterministic. WebLLM paraphrase = optional toggle only
   (multi-GB download is hostile onboarding) — never a dependency.
7. **ADVISOR onboarding**: interactive checklist completing by observing real
   Commands + diegetic Watch Officer's Handbook (Highfleet charm, not CMO videos).
8. **Async 1v1 PBEM** LAST: WEGO command-packet exchange reusing replay machinery.
   Realtime PeerJS lockstep deferred until trig determinism is solved.

## Recommended order

A (feel, incl. TOT) → C (air war) → B (TILT 3D) → D (elevation) → E1-E4
(replay/daily/sharing) → E5 (campaign) → rest. Wave A first because every minute
of play gets better immediately; C is the biggest pure-gameplay hole; B and D are
spectacle and fidelity on top of a game that by then deserves them.
