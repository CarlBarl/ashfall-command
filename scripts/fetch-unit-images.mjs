/**
 * Downloads one Wikimedia Commons recognition photo per unit class into
 * public/unit-images/ and generates src/data/unit-images.ts with license
 * metadata. Re-runnable; classes that fail (license, HTTP, not-a-JPEG) are
 * dropped from the generated map and reported.
 *
 *   node scripts/fetch-unit-images.mjs
 *
 * Hotlinking is rejected by design (Commons 400s non-standard widths and
 * discourages it) — width 500/250 are allowed thumb widths.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outDir = path.join(root, 'public', 'unit-images')
const tsOut = path.join(root, 'src', 'data', 'unit-images.ts')

const UA = 'AshfallCommand/1.0 (browser wargame; one-time build script fetching unit recognition photos)'
const MAX_BYTES = 80 * 1024
const WIDTHS = [500, 250]

/** classKey → Commons file title (verified to exist + acceptable license, 2026-06-11) */
const MANIFEST = [
  // — USA (public-domain DoD photography) —
  ['nimitz_cvn', 'File:USS Abraham Lincoln (CVN-72) underway during sea trials on 11 May 2017.jpg'],
  ['arleigh_burke', 'File:US Navy 050413-N-5526M-016 The Arleigh Burke-class guided missile destroyer USS Mustin (DDG 89) underway in the Northern Persian Gulf while conducting Maritime Security Operations.jpg'],
  ['virginia_ssn', 'File:US Navy 110909-N-OV802-222 The Virginia-class submarine Pre-Commissioning Unit (PCU) California (SSN 781) gets underway from Naval Station Norfolk.jpg'],
  ['patriot', 'File:MIM-104 Patriot surface-to-air missile system launcher.jpg'],
  ['thaad', 'File:THAAD missile launch in 2005 -2.jpg'],
  ['e3_sentry', 'File:Boeing E-3 Sentry 090512-F-7550B-902.jpg'],
  ['us_airbase', 'File:Al Udeid Air Base.jpg'],
  ['nsa_bahrain', 'File:Navy Day at Naval Support Activity Bahrain 140416-N-RJ323-385.jpg'],
  // — Iran (Tasnim/Fars/Mehr press photography, CC BY 4.0 — credit required) —
  ['s300pmu2', 'File:S-300 Tehran 2017.jpg'],
  ['bavar373', 'File:Bavar-373 upgrade ceremony (23).jpg'],
  ['khordad3', 'File:3rd Khordad TELAR w Taer-2 missiles.jpg'],
  ['tor_m1', 'File:Tor M1.jpg'],
  ['shahab3', 'File:Shahab missile launch photographed by Satyar Emami.jpg'],
  ['sejjil2', 'File:Sejjil missile launch - November 2008 (09).jpg'],
  ['fateh110', 'File:Firing Fateh-110 belong to AFAGIR.jpg'],
  ['zolfaghar', 'File:Two IRGC AF Missiles.jpg'],
  ['soumar', 'File:Unveiling ceremony of Soumar cruise missile and other missiles (13).jpg'],
  ['ghadir_sub', 'File:2012 Bandar Abbas new equipment induction ceremony - Ghadir-class submarine (10).jpg'],
  ['noor_coastal', 'File:شلیک موشک کروز نور توسط یگان ساحلی نداجا از سواحل مکران (1).jpg'],
  ['irgc_fac', 'File:Commissioning ceremony of IRGC naval vessels in March 2023 (10).jpg'],
  ['iran_airbase', 'File:F-14 Tomcat at Mehrabad preparing for Iranian Army Day 2013 (1).jpg'],
  ['shahed136', 'File:Military equipment displayed for the 44th Iranian revolution anniversary rally - Shahed 136.jpg'],
]

// PD/CC0/CC BY/CC BY-SA only — Commons' bare "Attribution" license is deliberately excluded
const LICENSE_OK = /^(public domain|pd[\s-]|pd$|cc0|cc[\s-]by(-sa)?(\s\d\.\d)?$)/i

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function fetchRetry(url, attempt = 0) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } })
  if (res.status === 429 && attempt < 4) {
    await sleep(8000 * (attempt + 1))
    return fetchRetry(url, attempt + 1)
  }
  return res
}

const stripHtml = (s) =>
  (s ?? '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()

function shorten(s, max = 70) {
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s
}

/** One batched imageinfo query for every title (cheap on the API rate limit) */
async function fetchMetadata(titles) {
  const url = 'https://commons.wikimedia.org/w/api.php?' + new URLSearchParams({
    format: 'json',
    action: 'query',
    titles: titles.join('|'),
    prop: 'imageinfo',
    iiprop: 'url|mime|extmetadata',
  })
  const res = await fetchRetry(url)
  if (!res.ok) throw new Error(`metadata query failed: HTTP ${res.status}`)
  const json = await res.json()
  const byTitle = new Map()
  for (const page of Object.values(json.query?.pages ?? {})) {
    if (page.imageinfo?.[0]) byTitle.set(page.title, page.imageinfo[0])
  }
  // map normalized titles back to requested ones
  for (const { from, to } of json.query?.normalized ?? []) {
    if (byTitle.has(to)) byTitle.set(from, byTitle.get(to))
  }
  return byTitle
}

async function downloadJpeg(title, width) {
  const name = encodeURIComponent(title.replace(/^File:/, ''))
  const url = `https://commons.wikimedia.org/wiki/Special:FilePath/${name}?width=${width}`
  const res = await fetchRetry(url)
  if (!res.ok) throw new Error(`HTTP ${res.status} at width ${width}`)
  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8 || buf[2] !== 0xff) {
    throw new Error(`not a JPEG (first bytes ${buf.subarray(0, 3).toString('hex')}) at width ${width}`)
  }
  return buf
}

const entries = {}
const failures = []

await fs.mkdir(outDir, { recursive: true })

console.log('Fetching metadata for', MANIFEST.length, 'titles...')
const meta = await fetchMetadata(MANIFEST.map(([, t]) => t))

for (const [key, title] of MANIFEST) {
  const info = meta.get(title)
  if (!info) {
    failures.push([key, 'no imageinfo (title missing on Commons?)'])
    continue
  }
  const md = info.extmetadata ?? {}
  const license = stripHtml(md.LicenseShortName?.value)
  const author = shorten(stripHtml(md.Artist?.value) || 'Unknown')
  if (!LICENSE_OK.test(license)) {
    failures.push([key, `license not in allowlist: "${license}"`])
    continue
  }
  if (info.mime !== 'image/jpeg') {
    failures.push([key, `not a JPEG source: ${info.mime}`])
    continue
  }
  try {
    let buf = await downloadJpeg(title, WIDTHS[0])
    if (buf.length > MAX_BYTES) {
      await sleep(1500)
      buf = await downloadJpeg(title, WIDTHS[1])
    }
    if (buf.length > MAX_BYTES) {
      console.warn(`  WARN ${key}: still ${(buf.length / 1024).toFixed(0)} KB at width ${WIDTHS[1]}, keeping it`)
    }
    const file = `${key}.jpg`
    await fs.writeFile(path.join(outDir, file), buf)
    entries[key] = {
      file,
      title: title.replace(/^File:/, ''),
      author,
      license,
      sourceUrl: info.descriptionurl ?? `https://commons.wikimedia.org/wiki/${encodeURIComponent(title)}`,
    }
    console.log(`  OK   ${key}  ${(buf.length / 1024).toFixed(0)} KB  [${license}] ${author}`)
  } catch (e) {
    failures.push([key, e.message])
  }
  await sleep(1500)
}

for (const [key, why] of failures) console.warn(`  DROP ${key}: ${why}`)

const count = Object.keys(entries).length
console.log(`\n${count}/${MANIFEST.length} classes downloaded.`)
if (count < 12) {
  console.error('Fewer than 12 classes succeeded — generated map is too thin, aborting without writing TS.')
  process.exit(1)
}

const entryLines = Object.entries(entries)
  .map(([key, e]) =>
    `  ${key}: { file: ${JSON.stringify(e.file)}, title: ${JSON.stringify(e.title)}, author: ${JSON.stringify(e.author)}, license: ${JSON.stringify(e.license)}, sourceUrl: ${JSON.stringify(e.sourceUrl)} },`)
  .join('\n')

const ts = `/**
 * GENERATED by scripts/fetch-unit-images.mjs — re-run the script instead of
 * editing image entries by hand. Recognition photos live in public/unit-images/.
 * Licenses: US imagery is public-domain DoD photography; Iranian imagery is
 * CC BY press photography — author + license MUST be shown wherever an image
 * renders (in-game credit caption + LIVE FEEDS credits panel).
 */

export interface UnitImageInfo {
  /** filename under public/unit-images/ */
  file: string
  /** Commons file title (without the File: prefix) */
  title: string
  author: string
  license: string
  sourceUrl: string
}

export const UNIT_IMAGES: Record<string, UnitImageInfo> = {
${entryLines}
}

const US_AIRBASE_HINTS = ['udeid', 'dhafra', 'prince sultan', 'al salem', 'incirlik', 'diego garcia']

/**
 * Best-effort class match from unit name/category. May return a key with no
 * UNIT_IMAGES entry (download dropped) — callers must check the map.
 */
export function unitImageKey(unit: { name: string; category: string }): string | null {
  const n = unit.name.toLowerCase()
  if (unit.category === 'carrier_group' || n.includes('cvn')) return 'nimitz_cvn'
  if (n.includes('ddg') || n.includes('arleigh')) return 'arleigh_burke'
  if (n.includes('ssn')) return 'virginia_ssn'
  if (n.includes('patriot')) return 'patriot'
  if (n.includes('thaad')) return 'thaad'
  if (n.includes('e-3') || n.includes('awacs')) return 'e3_sentry'
  if (n.includes('nsa bahrain') || n.includes('5th fleet')) return 'nsa_bahrain'
  if (n.includes('s-300')) return 's300pmu2'
  if (n.includes('bavar')) return 'bavar373'
  if (n.includes('khordad')) return 'khordad3'
  if (n.includes('tor-m1')) return 'tor_m1'
  if (n.includes('shahab')) return 'shahab3'
  if (n.includes('sejjil')) return 'sejjil2'
  if (n.includes('fateh')) return 'fateh110'
  if (n.includes('zolfaghar')) return 'zolfaghar'
  if (n.includes('soumar')) return 'soumar'
  if (n.includes('ghadir')) return 'ghadir_sub'
  if (n.includes('coastal') || n.includes('qeshm')) return 'noor_coastal'
  if (/\\bfac\\b/.test(n)) return 'irgc_fac'
  if (n.includes('shahed')) return 'shahed136'
  if (unit.category === 'airbase') {
    return US_AIRBASE_HINTS.some((h) => n.includes(h)) ? 'us_airbase' : 'iran_airbase'
  }
  return null
}
`

await fs.writeFile(tsOut, ts, 'utf8')
console.log('Wrote', tsOut)
