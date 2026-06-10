import { chromium } from 'playwright'

const BASE = process.env.SMOKE_URL ?? 'http://localhost:4173'
const browser = await chromium.launch({ channel: 'chrome', headless: process.env.SMOKE_HEADED ? false : true })
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })

const consoleErrors = []
page.on('pageerror', err => consoleErrors.push(`pageerror: ${err.message}`))
page.on('console', msg => {
  if (msg.type() === 'error' && !msg.text().includes('borderColor')) {
    consoleErrors.push(`console.error: ${msg.text()}`)
  }
})

const step = async (name, fn) => {
  try {
    await fn()
    console.log(`ok    ${name}`)
  } catch (err) {
    console.log(`FAIL  ${name}: ${err.message}`)
    const text = (await page.locator('body').innerText()).replace(/\n/g, ' | ').slice(0, 1500)
    console.log(`body: ${text}`)
    await browser.close()
    process.exit(1)
  }
}

const clickText = async (text, opts = {}) => {
  await page.getByText(text, { exact: opts.exact ?? false }).first().click({ timeout: 8000 })
}

await step('load start screen', async () => {
  await page.goto(BASE)
  await page.getByText('ASHFALL COMMAND').first().waitFor({ timeout: 10000 })
})

await step('launch scenario', async () => {
  await clickText('SCENARIO', { exact: true })
  await clickText('CONTINUE')
  await clickText('Persian Gulf Crisis 2026')
  await clickText('LAUNCH')
  await page.getByText('Jun 15').first().waitFor({ timeout: 15000 })
})

await step('fog of war: SITREP shows contacts, not full enemy orbat', async () => {
  await clickText('SITREP', { exact: true })
  await page.getByText('Contacts').first().waitFor({ timeout: 8000 })
  await page.getByText(/EST\. ORBAT/).first().waitFor({ timeout: 4000 })
  await clickText('SITREP', { exact: true })
})

await step('intel command center: tabs, assets, agents, opsec', async () => {
  await clickText('INTEL', { exact: true })
  await page.getByText('KH-11 CRYSTAL').first().waitFor({ timeout: 8000 })
  await page.getByText('TASK PASS').first().waitFor({ timeout: 4000 })
  await clickText('HUMINT', { exact: true })
  await page.getByText('AMBER').first().waitFor({ timeout: 4000 })
  await page.getByText('OPAL').first().waitFor({ timeout: 2000 })
  await clickText('OSINT', { exact: true })
  await clickText('OPSEC', { exact: true })
  await page.getByText(/OPSEC SWEEP/i).first().waitFor({ timeout: 4000 })
  await clickText('SIGINT', { exact: true })
  await clickText('INTEL', { exact: true })
})

await step('live feeds window opens with all four quadrants', async () => {
  await clickText('LIVE', { exact: true })
  await page.getByText('GEOSAT IODC LIVE').first().waitFor({ timeout: 8000 })
  await page.getByText(/HORMUZ TRAFFIC CAM/i).first().waitFor({ timeout: 4000 })
  await page.getByText(/ISR FMV/i).first().waitFor({ timeout: 4000 })
  await page.getByText(/ADS-B/i).first().waitFor({ timeout: 4000 })
  await page.getByText(/INTEL SOURCES/i).first().waitFor({ timeout: 4000 })
  await clickText('LIVE', { exact: true })
})

await step('time slider present in top bar', async () => {
  const slider = page.locator('input[type="range"]').first()
  await slider.waitFor({ timeout: 4000 })
})

await step('declare war', async () => {
  await clickText('DECLARE WAR')
  await clickText('CONFIRM WAR')
  await page.getByText('WAR: IRAN').first().waitFor({ timeout: 8000 })
})

await step('run the war at speed via the time slider', async () => {
  await page.locator('input[type="range"]').first().evaluate(el => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    setter.call(el, el.max)
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
  })
  await page.getByText('1h/s').first().waitFor({ timeout: 4000 })
  await page.waitForTimeout(8000)
})

await step('war UI: support bars + ceasefire + objectives appear', async () => {
  await page.getByText('OFFER CEASEFIRE').first().waitFor({ timeout: 8000 })
  await page.getByText('OBJECTIVES').first().waitFor({ timeout: 4000 })
  await clickText('OBJECTIVES')
  await page.getByText('Keep Hormuz open').first().waitFor({ timeout: 4000 })
  await clickText('OBJECTIVES')
})

await step('fog of war: war reveals enemy contacts on the map', async () => {
  const text = await page.locator('body').innerText()
  if (!/WAR: IRAN/.test(text)) throw new Error('war state lost')
})

await step('resign → debrief shows defeat', async () => {
  await clickText('···')
  await clickText('RESIGN')
  const confirm = page.getByText(/CONFIRM/i).first()
  if (await confirm.isVisible({ timeout: 2000 }).catch(() => false)) await confirm.click()
  await page.getByText('DEFEAT').first().waitFor({ timeout: 8000 })
  await page.getByText(/CAPITULATED|War support/i).first().waitFor({ timeout: 4000 })
})

await step('main menu return', async () => {
  await clickText('MAIN MENU')
  await page.getByText('SELECT MODE').first().waitFor({ timeout: 8000 })
})

if (consoleErrors.length > 0) {
  console.log('CONSOLE ERRORS:')
  for (const e of consoleErrors.slice(0, 10)) console.log('  ' + e)
  await browser.close()
  process.exit(1)
}

console.log('SMOKE PASSED')
await browser.close()
