# Backlog

Curated from the 2026-06-09 full-codebase audit (12-agent sweep, 199 findings) plus live playtest.
Wave 1+2 fixes covered the gameplay-killing bugs; these are the deliberate deferrals.

## Big features (design needed before code)

- **Fog of war.** The snapshot ships full enemy state to the UI; detection/espionage/satellite
  systems compute results that gate nothing. Decide the visibility model (per-unit detected
  state with decay?), filter the snapshot, and wire HUMINT reveals + SIGINT range multiplier +
  `satelliteDetectedUnitIds` into it. Until then the whole intel layer is cosmetic
  (IntelBudgetPanel is a placebo).
- **Victory / end conditions.** Wars currently never end: no objectives evaluated, no
  victory/defeat screen, CEASE_FIRE command handled by the engine but has no UI. The war just
  goes silent. Define win conditions per scenario (e.g. Hormuz kept open N days, % enemy
  strategic assets destroyed) and an end-of-war screen.
- **Logistics depth.** logistics-v2 (national stockpiles, shipments, production) was deleted as
  dead code in the cleanup; the live v1 ignores `SupplyLine.capacity`/`distance_km`. If supply
  is to matter strategically, re-design from the v1 base (git history has v2 for reference).
- **Free mode supply.** App.tsx passes empty supplyLines/baseSupply in free mode, so placed
  units never resupply and (mostly) cannot repair. Needs generated supply data or an explicit
  "no logistics in free mode" design call.
- **Save format.** Saves omit client-side state (intel estimates, strike plan), there is a
  single hardcoded quicksave slot, and `listSaves` is unused. Consider multi-slot UI and
  including client stores in the payload.

## UX debt

- Panels overlap each other (SITREP opens on top of the strike dialog) and have no
  drag/z-order management; Escape does not close panels.
- Mobile: LOG tab empty, IntelPanel X needs two taps, direct-fire flow yanks to UNIT panel.
- Strike timing modes (staggered/sequential) run on wall-clock setTimeout (0.3s/3s) instead of
  game time, and fire while paused. Honest fix = engine-side scheduled salvos.
- Shipping lane name/throughput labels are built but never rendered; lanes/minefields have no
  hover/click interactivity.
- Intel estimate markers are pickable but `moveEstimate`/`confirmEstimate` have no UI path.
- "BAB EL_MANDEB" event copy; review event vocabulary for raw enum leakage generally.
- No path back to the main menu from a running game.
- StartScreen shows a hardcoded stale version/date banner; project naming is split between
  REALPOLITIK (UI/package/IndexedDB) and Ashfall Command (repo/Vercel).

## Smaller deferred fixes

- DIRECT FIRE cluster popup z-order vs strike panel (replaces it on screen).
- DECLARE WAR confirm silently times out (by design?) — consider a visible countdown.
- visualTimestamp interpolation assumes nominal worker speed; visual clock can snap back.
- Multiple radars on one unit: max range paired with first radar's antenna/sector.
- detectThreats runs twice per radar unit per tick (perf, harmless at current scale).
- Sensor types sonar/irst/ew have no mechanics; `Sensor.detection_prob` unread.
- `GameTime.tickIntervalMs` set everywhere, read nowhere (visual interpolation hardcodes 100).
- Cursor elevation readout tracks mousemove even with ELV overlay off.
