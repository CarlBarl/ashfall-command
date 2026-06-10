# Backlog

Curated from the 2026-06-09 full-codebase audit (12-agent sweep, 199 findings) plus live playtest.
Wave 1+2 fixes covered the gameplay-killing bugs; these are the deliberate deferrals.
Fog of war + war termination shipped in game-loop v2; the intel suite + combat-on-contacts
shipped in v3 (docs/plans/intel-suite-v3.md) — v3 deferrals listed below.

## Intel suite v3 deferrals (design doc §7 + build-wave notes)

- Missions/doctrine cascade (patrol boxes, recon orbits, per-zone weapon release authority).
- HVT person-tracking chains, underground facility model, WAMI rewind, Staff Summary panel.
- Counter-OSINT levers: shutter control, disinfo plants, Iranian internet blackout.
- Live-data upgrades: OpenSky via a small Vercel proxy, aisstream AIS relay, Windy webcams,
  GIBS fires MVT layer, USGS seismic ticker as MASINT flavor.
- STRIKE_LEAKED currently scoots the target + degrades the contact; the designed Iranian
  point-defense readiness bump is not implemented.
- FLASH salvo-warning intercept path (getNextSalvoEstimate) has no test (couples to AI phase).
- ADS-B polling has no document-visibility pause; LiveFeeds drag is title-bar only.
- Destroying Iranian ISR assets (Mohajer orbit, picket boats, Noor) has no kill path.
- OSINT regime-mouthpiece nation detection is a name-regex heuristic; new Iranian names need
  the patterns extended (osint-feed.ts IRAN_WEAPON_RE/IRAN_UNIT_RE).

## Big features (design needed before code)

- **Logistics depth** (see below), **aircraft/sortie system**, **more scenarios**.
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
