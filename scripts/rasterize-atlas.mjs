import { chromium } from 'playwright'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs/promises'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const atlases = ['unit-atlas', 'missile-atlas']

const browser = await chromium.launch({ channel: 'chrome' })
const page = await browser.newPage({ viewport: { width: 300, height: 300 } })

for (const name of atlases) {
  const svgPath = path.join(root, 'public', 'sprites', `${name}.svg`)
  const pngPath = path.join(root, 'public', 'sprites', `${name}.png`)
  const svgText = await fs.readFile(svgPath, 'utf8')
  const m = svgText.match(/width="(\d+)"\s+height="(\d+)"/)
  const [w, h] = m ? [Number(m[1]), Number(m[2])] : [256, 256]
  const svgUrl = 'data:image/svg+xml;base64,' + Buffer.from(svgText).toString('base64')
  await page.setContent(`<body style="margin:0"><img id="a" src="${svgUrl}" width="${w}" height="${h}"></body>`)
  await page.waitForFunction(() => {
    const img = document.getElementById('a')
    return img.complete && img.naturalWidth > 0
  })
  await page.locator('#a').screenshot({ omitBackground: true, path: pngPath })
  console.log('wrote', pngPath, `${w}x${h}`)
}
await browser.close()
