# Intel Suite v3 — SIGINT, IMINT, HUMINT, OSINT, counterespionage

Binding design for the v3 build wave. Builds on game-loop v2 fog of war
(`docs/plans/game-loop-v2.md`) and the v3 combat-on-contacts commit (radar
horizon, fire-control quality, auto-engagement). Research basis: 5-agent web
research sweep 2026-06-10 (US ISR architecture, OSINT ecosystem, verified free
data feeds, game design references, Iran counterintelligence).

Design goals, in priority order:

1. The USA player CAN reach near-total knowledge of Iran — but only by tasking
   assets well (tip-and-cue: wide-area sensors tip, expensive collection confirms).
2. Intel is load-bearing: TEL hunting, decoy discrimination and strike warning
   are unsolvable without collection.
3. Counterespionage cuts both ways: Iran hunts the player's sources and leaks
   the player's operations; the player has OPSEC verbs to fight back.
4. Presentation mirrors real intel products using REAL data where free and
   verified: real satellite imagery of the real bases, a genuinely live
   geostationary weather satellite, real air traffic, real cloud cover.
5. No espionage minigames. Every intel action is 1–2 clicks, resolved by
   readable odds. Products (imagery, intercepts, reports) are presentation
   rewards that show exactly the knowledge earned — never knowledge the sensor
   network does not have.

## 0. Verified real-data stack (all keyless + CORS unless noted)

Central config module `src/data/feeds.ts` — every URL lives there with a
comment naming what was verified 2026-06-10. Degrade gracefully: every consumer
must handle fetch failure by falling back to simulated/synthetic content.

| Source | Use | Notes |
|---|---|---|
| Esri World Imagery XYZ `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}` | High-res IMINT product backdrops + FMV feed scenery (z up to 16) | path order is z/y/x. Attribution required. Free app only. |
| NASA Worldview Snapshot `https://wvs.earthdata.nasa.gov/api/v1/snapshot?REQUEST=GetSnapshot&LAYERS=VIIRS_SNPP_CorrectedReflectance_TrueColor&CRS=EPSG:4326&TIME={YYYY-MM-DD}&BBOX={s},{w},{n},{e}&WIDTH=768&HEIGHT=512&FORMAT=image/jpeg` | One-fetch date-stamped recon JPEG for "daily pass" products | Pin explicit date; default yesterday UTC, try today, 404 = "not downlinked yet" |
| NASA GIBS WMTS `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_SNPP_CorrectedReflectance_TrueColor/default/{time}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg` | Optional map base-layer toggle "DAILY RECON MOSAIC" | maxzoom 9, time pinned yesterday UTC. Never TIME=default (resolves to tomorrow → 404). |
| EUMETSAT EUMETView WMS `https://view.eumetsat.int/geoserver/wms?service=WMS&request=GetMap&version=1.3.0&layers=msg_iodc:{layer}&styles=&format=image/jpeg&crs=EPSG:4326&bbox={s},{w},{n},{e}&width=640&height=480` layers `rgb_naturalenhncd` (day) / `ir108` (night-capable) | "GEOSAT IODC LIVE" window — genuinely live Meteosat-9 over the Gulf, 15-min cadence | Refresh every 15 min of REAL time |
| airplanes.live `https://api.airplanes.live/v2/point/{lat}/{lon}/{radius_nm}` | "LIVE ADS-B" map layer — real civilian/military aircraft over the Gulf | ~1 req/s limit → poll every 45 s, radius ≤ 250 nm |
| Open-Meteo `https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}&current=cloud_cover` | Real cloud cover gates optical satellite tasking | One fetch per tasking, UI-side; fallback = seeded rng |
| YouTube live embed, video id `osUeQTR91Ig` (Reuters "Vessel traffic in Strait of Hormuz") | OSINT ambience cam in the LIVE FEEDS window | iframe embed verified via oEmbed; if unavailable show SIGNAL LOST card |
| NOT in v3 | OpenSky (CORS-locked, needs proxy), live AIS (key+relay), Windy webcams (key+token), GIBS fires MVT, USGS quakes, RainViewer | BACKLOG.md |

Compliance: game stays free/non-revenue. LIVE FEEDS window footer gets an
"INTEL SOURCES" credits panel styled as an agency acknowledgment page: Esri ·
Maxar, NASA GIBS, EUMETSAT 2026, airplanes.live, Open-Meteo, Reuters.

Engine purity rule: the worker NEVER fetches. UI fetches real data and passes
results into commands (e.g. cloud cover) or renders it presentation-side only.
Engine outcomes must stay deterministic given commands + seed.

## 1. Engine: intel assets + tasking (`src/engine/systems/intel.ts`)

New module-level system, `resetIntelState()` + save/load like war-support.
State lives in `state.intel` (new `IntelState` in types/game.ts):

```ts
interface IntelState {
  assets: Record<string, IntelAsset>          // per-nation ISR assets
  agents: Record<string, AgentSource>         // player HUMINT sources
  products: IntelProduct[]                    // last 30 imagery/report products (metadata only)
  taskings: SatTasking[]                      // queued satellite taskings
  paranoia: number                            // 0-100 Iranian counterintel alert
  encryptionUpgradedUntilTick?: number        // SIGINT blackout window
  leakLevel: number                           // 0-100 how compromised the player's ops are
  lastSweepTick?: number                      // player OPSEC sweep cooldown anchor
}
```

### 1.1 ISR assets (fixed roster, data in `src/data/intel/assets.ts`)

USA: `kh11` (LEO optical, revisit 4h base — existing satellite entries get
names/types), `commercial` (revisit 90min, lower quality, products marked
UNCLASSIFIED//COMMERCIAL), `rc135` (SIGINT standoff — drives intercept cadence
while alive), `mq4c_triton` (wide-area maritime — coarse 'detected' refresh of
ships in the Gulf box every 30 game-min), `sbirs` (always-on launch detection —
already exists as launch-plume reveals; now also emits a FLASH intercept card).
Iran: `noor` (coarse optical, revisit 8h), `mohajer10` (drone orbit over the
strait — refreshes carrier contact), `fastboats` (IRGC shadowing — carrier
coarse-tracked while inside the Hormuz approaches box).

Assets are abstract (no map unit) except where a unit already exists. Each has
`status: 'active' | 'lost'`, cooldowns, and for Iran assets a kill-path noted
in BACKLOG (out of scope to destroy them in v3 except via events).

### 1.2 Satellite tasking — the IMINT verb

Command `TASK_SATELLITE_PASS { assetId: 'kh11' | 'commercial', target: Position, cloudPct?: number }`.
UI flow: INTEL → ISR tab → TASK PASS → click map (or "TASK PASS" button on a
contact). Queues a `SatTasking`; resolves at the asset's next pass window
(kh11: next tick where `(tick - lastPassTick) >= revisit`, max 1 queued per asset).

Resolution:
- cloudPct ≥ 70 → pass FAILED (`SATELLITE_PASS_FAILED` event, asset cooldown
  halved so retry is cheap). cloudPct comes from the command (UI fetched real
  weather); if absent, seeded rng 0–100.
- Success: all enemy units within `swathKm = 60` of target get contact refresh:
  fixed sites + units already tracked → `identified`; others → `tracked`.
  Decoys within swath: kh11 pass REVEALS them (NIIRS 7+); commercial does not.
- Emits `SATELLITE_PASS_COMPLETE { assetId, target, found: number, revealedDecoys: number }`
  and pushes an `IntelProduct { kind: 'imint', assetId, target, tick, niirs, caption, classification }`.
  The UI renders the product with REAL imagery fetched at view time (engine
  stores metadata only).
- Each pass over Iranian soil: `paranoia += 4` (kh11) / `+2` (commercial).

### 1.3 SIGINT intercepts

While `rc135` active and not in an encryption-upgrade window: every
`INTERCEPT_INTERVAL = 20 game-min ± jitter`, scaled by `sigint_pct` budget,
emit `INTERCEPT_DECRYPTED { precedence, text, aboutUnitId?, leakKind }` choosing
from true-state leaks (priority order):

1. Pending Iran AI salvo in the next 30 game-min → `FLASH` warning naming the
   target region ("FLASH: missile brigade ordered to combat readiness —
   expect fires vs PRINCE SULTAN AB within the hour").
2. A hidden (unseen/detected) Iranian `missile_battery` or `sam_site` →
   reveal at `detected` + `IMMEDIATE` card with a location ellipse reference.
3. War-support state ("PRIORITY: Tehran leadership cohesion failing") when
   Iran support < 45.
4. Filler chatter (`ROUTINE`, no game effect) otherwise.

Every intercept: `paranoia += 2`. When `paranoia ≥ 70` and at war: Iran rolls
encryption upgrade — `ENCRYPTION_UPGRADED` event, no intercepts for 6 game-h,
paranoia resets to 40. SIGINT cards live in `IntelState.products` as
`kind: 'sigint'`.

### 1.4 HUMINT — named sources (the burn-the-source loop)

Exactly 4 named sources in `src/data/intel/agents.ts`, USA-side only in v3:

| id | codename | placement | product |
|---|---|---|---|
| `amber` | AMBER | Bandar Abbas port clerk | naval base activity; reveals ships in Bandar Abbas/Jask boxes at `tracked`; sortie warnings |
| `opal` | OPAL | IRGC logistics officer | TEL hunt: reveals 1-2 hidden `missile_battery` at `identified` per tasking |
| `saffron` | SAFFRON | Tehran ministry aide | political: Iran war-support exact value + ceasefire intent for 2 game-h |
| `garnet` | GARNET | Strait observer w/ camera | enables the LIVE OBSERVER feed on the Hormuz box; passive +tracked refresh of ships transiting the strait every 30 game-min while active |

`AgentSource { id, codename, placement, product, status: 'active'|'resting'|'exfiltrated'|'arrested', exposure: 0-100, lastTaskedTick }`.

Verbs (commands): `TASK_AGENT { agentId }` (immediate report + effect,
`exposure += 15 + paranoia/5`, 1 game-h cooldown), `REST_AGENT` (status
resting: no products, exposure decays 1/game-h instead of rising),
`EXFILTRATE_AGENT` (after 6 game-h delay → safely removed, product lane lost).

Iranian spy sweeps: when `paranoia ≥ 50`, every 4 game-h Iran sweeps: each
active/resting source rolls `chance(exposure/200 + paranoia/400)` → ARRESTED:
`AGENT_ARRESTED` event, source lost, `leakLevel += 10` (interrogation), USA
war-support −3, Iran war-support +2. Feed + INTEL panel show it loudly.

### 1.5 Counterespionage — Iran spies on the player

`leakLevel` 0–100 (starts 25): Iran's insight into player operations.
- Rises: +1/game-h while carrier inside Hormuz approaches box (fast boats),
  +5 per player strike launched (pattern analysis), +10 per arrested agent.
- Effects: while `leakLevel ≥ 60`, player `LAUNCH_MISSILE`/`LAUNCH_SALVO`
  commands have a `leakLevel/200` chance to emit `STRIKE_LEAKED` — Iran AI
  gets +1 defensive readiness: targeted unit (if mobile, undamaged) relocates
  ~15 km and its contact for USA degrades to `detected` (it moved), and Iran
  point-defense readiness event fires. Player sees "STRIKE COMPROMISED —
  target displaced before impact" only via OSINT/feed after the miss.
- Iran's coarse carrier picture (asymmetry rule): every 30 game-min, if the
  player carrier_group is within the Gulf/strait OSINT box, Iran's contact on
  it refreshes at `detected` (at `tracked` while leakLevel ≥ 60 or mohajer10
  active). EMCON does NOT hide the carrier from this (you can't hide a CSG
  from port spotters) — it only denies ELINT/precision (see 1.6).

Player verbs: `OPSEC_SWEEP` (cooldown 6 game-h: `leakLevel -= 25`, event
`OPSEC_SWEEP_COMPLETE`), and EMCON (1.6).

### 1.6 EMCON

`SET_EMCON { unitId, emcon: boolean }` — unit radar stops radiating:
- visibility.ts: unit excluded from `ownRadars` (no contributions to own picture)
  and `radarSeesUnit` returns unseen for it (fire-control 'own' lost).
- sensor-network ELINT: emcon units are NOT ELINT-detectable (both the per-tick
  network and visibility's `isElintDetected`).
- detection.ts missile defense: emcon unit cannot detect threats with own radar
  (datalink network picture still applies — that's the CEC trade-off).
- UnitInfoPanel gets an EMCON toggle next to ROE.

### 1.7 Decoys

At war start (or when Iran enters DEFENSIVE), spawn `DECOY_COUNT = 4` decoy
units near real Iranian missile_battery clusters: real `Unit`s with
`isDecoy: true`, category `missile_battery`, no weapons, health 40, name
"Missile TEL group" — indistinguishable at detected/tracked. Revealed by:
kh11 pass over them (1.2), HUMINT OPAL report, or destroying one (BDA shows
no secondaries). Revealed → `DECOY_REVEALED` event; ViewUnit gets
`decoyRevealed: true` → rendered desaturated with DECOY tag. Striking an
unrevealed decoy: normal impact, but war-support loss for Iran is 0 and Iran
gains +1 support (propaganda); the player wasted missiles — that's the lesson.
war-support.ts: losses ignore `isDecoy` units. toViewUnit: `isDecoy` NEVER
leaks for unrevealed decoys (snapshot scrubbing test required).

### 1.8 Tick order

`processIntel(state, rng, grid)` runs after `processVisibility` (consumes fresh
contacts) and before `processWarSupport`. All reveals route through the same
contact bookkeeping as visibility.ts (export small helpers there rather than
duplicating decay logic).

## 2. OSINT feed (UI-side, `src/intel/osint-feed.ts`)

Pure consumer of the snapshot event stream — no engine state. Generator keyed
on `(event, account)` with per-account delay/noise/false-rate; posts surface in
the INTEL → OSINT tab and the 3 most recent as a collapsed ticker above the
AlertFeed. Roster (`src/data/intel/osint-accounts.ts`), all fictional handles:

| handle | archetype | delay | reliability |
|---|---|---|---|
| `@GulfPlaneWatch` | base plane-spotter | 1-3 min | high — launches/sorties near bases |
| `@CENTCOM_Watch` | aggregator | 2-6 min | 85% — BREAKING style, occasionally wrong target names |
| `@TankerTrackerz` | oil-flow analyst | 12-24 game-h | high — Hormuz status, oil price commentary |
| `@OrbitalRecon` | imagery analyst | 6-12 game-h | high — BDA after strikes ("crater analysis suggests...") |
| `@IRGC_Media` | regime mouthpiece | 5-15 min | inflated claims, true readiness chatter |
| `@StraitSpotter` | webcam watcher | 2-8 min | ship transits, mine sightings |
| `@SignalDesk` | leak channel | minutes BEFORE Iran salvos (when leakLevel < 40) | jittered warnings |
| `@PizzaIndexGulf` | joke indicator | ~1 game-h before player-visible AI escalation | 60% |

False posts: aggregator/mouthpiece occasionally emit posts about events that
did not happen (recycled-footage flavor); cross-checking against sensors is the
intended skill. Posts referencing player operations (carrier transit, big
salvos) appear too — visible reminder that OSINT cuts both ways.

## 3. UI — INTEL command center + product viewers

### 3.1 `IntelCommandCenter.tsx` (replaces IntelPanel content; keep budget sliders in ISR tab footer)

Tabs: **ISR · SIGINT · HUMINT · OSINT · OPSEC**

- ISR: asset cards (status, next-pass countdown), TASK PASS flow (click-map
  capture like the estimate-placement flow), product gallery (thumbnail grid,
  click → IMINT viewer). Budget sliders move here.
- SIGINT: intercept cards newest-first, precedence-tagged (FLASH red pulse,
  IMMEDIATE amber, PRIORITY white, ROUTINE muted), encryption-upgrade banner
  with countdown when active.
- HUMINT: one card per source: codename, placement, product line, exposure bar
  (green→red), TASK / REST / EXFILTRATE buttons with readable risk ("Tasking
  raises exposure ~18%"). Arrested sources stay as tombstone cards.
- OSINT: the feed (2), with account filter chips.
- OPSEC: leakLevel gauge ("OPERATIONS SECURITY"), what's driving it (list),
  OPSEC SWEEP button + cooldown, EMCON quick-toggles for radar ships, Iranian
  paranoia estimate (fuzzy: LOW/ELEVATED/HIGH/SEVERE).

### 3.2 IMINT product viewer (`ImintViewer.tsx`)

Full-screen modal, classified-product dress: black frame,
`TOP SECRET//TK//NOFORN` banner (or `UNCLASSIFIED//COMMERCIAL`), real Esri
imagery crop centered on product.target (simple `<img>` tile mosaic 3×2 at the
zoom where swath ≈ frame, no canvas), crosshair + AOI bracket overlays, NIIRS
rating, sensor + acquisition Z-time stamps, auto-caption ("2× probable TEL
group, 1× SA-15 type emitter"), grain/scanline CSS overlay. SAVE TO BOARD
pins it to the product gallery.

### 3.3 LIVE FEEDS window (`LiveFeeds.tsx`)

Dockable window (toggle in TopBar: LIVE) with a 2×2 grid:
1. **GEOSAT IODC LIVE** — EUMETSAT WMS img, refreshed every 15 real-min,
   day layer by local day/night at the Gulf (rgb day / ir108 night), timestamp.
2. **HORMUZ TRAFFIC CAM** — Reuters YouTube live iframe; SIGNAL LOST card on error.
3. **ISR FMV** — synthetic drone soda-straw: Esri z15-16 imagery of a selected
   contact/AOI, slow Ken-Burns drift, IR-style filter (invert+contrast) at
   night, noise/scanline shader, REC dot, corner telemetry (coords, ALT, SLANT),
   crosshair. Source select: any tracked+ contact (or GARNET's strait box).
4. **ADS-B LIVE** — toggle that also enables the map layer; in-window list of
   the 10 nearest real aircraft (callsign, alt, speed) from airplanes.live.
Footer: INTEL SOURCES credits (compliance, styled as agency acknowledgments).

### 3.4 Map layers (`IntelLayers.ts` + UnitLayer touches)

- AOU ellipses: stale contacts get a growing dashed circle
  `radius = min(60, 4 + minutesSinceSeen × speedFactor)` km.
- Sensor rings: selected own unit shows radar ring capped at the horizon vs
  surface targets (teaches the new physics); dim second ring = nominal range.
- Satellite swath preview during TASK PASS placement + 60 km AOI circle on
  queued taskings with next-pass countdown label.
- Decoy styling: revealed decoys desaturated + DECOY tag.
- ADS-B layer: real aircraft as small neutral-gray tracks w/ heading, callsign
  on hover. Clearly non-interactive (flavor), toggle in MapToggle.
- DAILY RECON MOSAIC: GIBS VIIRS raster source toggle (maxzoom 9, yesterday).

### 3.5 Time slider (TopBar)

Replace/augment the fixed speed buttons with a continuous slider (user
request): log-scale drag 0 → 3600 (PAUSE · 1× · 8× · 60× · 10m/s · 1h/s
detents with snap), current multiplier label ("×480"), keyboard +/- steps
between detents, pause button stays separate. Engine already accepts any
number via SET_SPEED; `GameLoop` bursts `round(speed)` ticks per 100 ms with
an 80 ms budget, so the slider needs no engine change. Presets remain as
click-targets under the slider. TopBar is owned by U2 in this wave (slider +
LIVE toggle) to avoid file collisions.

### 3.6 View-state additions (types/view.ts)

`GameViewState` gains `intel: { assets, agents, products(latest 30), taskings, leakLevel, paranoiaBand, encryptionUpgradedUntilTick }`,
`ViewUnit` gains `emcon?: boolean`, `decoyRevealed?: boolean`. Snapshot
scrubbing: products/agents are player-nation only; decoy truth only when revealed.

## 4. Events (types/game.ts)

`SATELLITE_PASS_COMPLETE`, `SATELLITE_PASS_FAILED`, `INTERCEPT_DECRYPTED`,
`AGENT_REPORT`, `AGENT_ARRESTED`, `AGENT_EXFILTRATED`, `SPY_SWEEP`,
`ENCRYPTION_UPGRADED`, `DECOY_REVEALED`, `STRIKE_LEAKED`, `OPSEC_SWEEP_COMPLETE`.
All get AlertFeed formatters + colors; FLASH intercepts and AGENT_ARRESTED join
the auto-pause options.

## 5. Commands (types/commands.ts)

`TASK_SATELLITE_PASS`, `TASK_AGENT`, `REST_AGENT`, `EXFILTRATE_AGENT`,
`OPSEC_SWEEP`, `SET_EMCON`.

## 6. Build plan (parallel agents, disjoint files)

Scaffold (me, first commit): types/game.ts + commands.ts + view.ts deltas,
`intel.ts` skeleton (exported signatures + reset + save/load wiring),
`feeds.ts`, data files (assets/agents/osint-accounts) with full content,
game-engine wiring (tick order, command cases, snapshot slice), EMCON hooks in
visibility/sensor-network/detection (small, central).

- **E1**: intel.ts full implementation + war-support decoy exception + tests
  (taskings, intercepts incl. encryption window, sweeps/exposure, leakLevel,
  decoy spawn/reveal, EMCON visibility effects, save/load round-trip).
- **U1**: IntelCommandCenter + ui-store + UnitInfoPanel EMCON toggle + panel tests.
- **U2**: ImintViewer + LiveFeeds + credits + osint-feed.ts generator + ticker
  + TopBar (time slider §3.5 + LIVE toggle).
- **U3**: IntelLayers (AOU, sensor rings, swaths, ADS-B, GIBS toggle) + decoy
  styling + MapToggle entries.
- **T**: extend `scripts/e2e-smoke.mjs`: open INTEL, task a pass, verify a
  product appears; check OSINT tab renders posts; toggle EMCON; verify LIVE
  window opens with all four quadrants (network feeds may show fallback cards).

## 7. Out of scope (→ BACKLOG.md)

Missions/doctrine cascade, WAMI rewind, HVT person-tracking chains, underground
facility model, shutter control, disinfo plants, internet blackout, OpenSky
proxy, aisstream relay, Windy webcams, USGS seismic ticker, RainViewer, GIBS
fires layer, Iranian asset destruction, Staff Summary panel, NIIRS-gated
bunker-buster folders.
