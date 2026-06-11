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

- Mobile: LOG tab empty, IntelPanel X needs two taps, direct-fire flow yanks to UNIT panel.
- Shipping lane name/throughput labels are built but never rendered; lanes/minefields have no
  hover/click interactivity.
- OFFER CEASEFIRE two-step confirm still uses silent blur-disarm — reuse TopBar's
  useArmedCountdown for consistency with CONFIRM WAR.
- exitToMainMenu() in TopBar duplicates DebriefScreen's handleMainMenu — extract a shared
  helper; consider SET_SPEED 0 on exit (worker keeps ticking behind the start screen).
- Package/IndexedDB internals still named realpolitik (package.json name, save-load DB_NAME,
  map style ids) — cosmetic, renaming the DB key breaks saves.

## Engine scale (from the Wave A stress guard, 2026-06-11)

- Measured: ~60-unit shipped scenarios are comfortably real-time; at 500 units the
  interceptor-saturation phase (~2100 live missiles) runs 80-190 ms/tick — missile
  count dominates, units are cheap, terrain/LOS adds only ~9%. If bigger scenarios
  ever become a target: spatial index / per-missile detection culling in
  detection/visibility loops. NOT WASM-for-LOS. Guard: src/engine/__tests__/scale-stress.test.ts.

## Smaller deferred fixes

- DIRECT FIRE cluster popup z-order vs strike panel (replaces it on screen).
- visualTimestamp interpolation assumes nominal worker speed; visual clock can snap back.
- Sensor types sonar/irst/ew have no mechanics; `Sensor.detection_prob` data-only (noted in code).
- `GameTime.tickIntervalMs` set everywhere, read nowhere (visual interpolation hardcodes 100).

## Done 2026-06-11 (backlog wave 1)

- Panels: drag by title bar, click-to-raise z-order, Escape closes topmost, per-title
  position memory (Panel.tsx + ui-store panels slice).
- Strike timing engine-side: LAUNCH_SALVO spacingTicks + state.scheduledLaunches queue —
  pause-safe, save/load-safe, one leak roll per salvo. Staggered/sequential now space
  rounds within the salvo (2 s/8 s); old 30 s/10 min between-tier delays removed.
- MAIN MENU in the ··· menu (two-step confirm), CONFIRM WAR visible 5 s countdown,
  lane/supply-line names prettified (Bab el-Mandeb).
- Multi-radar pairing fixed (per-sensor range/antenna/sector evaluation), detectThreats
  per-tick memo (3× → 1× per unit), ELV cursor listener gated on the toggle.
