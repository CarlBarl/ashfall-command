import { describe, it, expect } from 'vitest'
import { UNIT_IMAGES, unitImageKey } from '../unit-images'
import { usaUnits } from '../units/usa-orbat'
import { iranUnits } from '../units/iran-orbat'

describe('unitImageKey', () => {
  it('maps US naval classes', () => {
    expect(unitImageKey({ name: 'CVN-72 Abraham Lincoln CSG', category: 'carrier_group' })).toBe('nimitz_cvn')
    expect(unitImageKey({ name: 'DDG-89 USS Mustin', category: 'ship' })).toBe('arleigh_burke')
    expect(unitImageKey({ name: 'SSN-789 USS Indiana', category: 'submarine' })).toBe('virginia_ssn')
    expect(unitImageKey({ name: 'NSA Bahrain (5th Fleet HQ)', category: 'naval_base' })).toBe('nsa_bahrain')
  })

  it('maps US air defense and aircraft', () => {
    expect(unitImageKey({ name: 'Patriot Battery (Qatar)', category: 'sam_site' })).toBe('patriot')
    expect(unitImageKey({ name: 'THAAD Battery (UAE)', category: 'sam_site' })).toBe('thaad')
    expect(unitImageKey({ name: 'E-3 Sentry AWACS', category: 'aircraft' })).toBe('e3_sentry')
  })

  it('splits airbases between US and Iran by name', () => {
    expect(unitImageKey({ name: 'Al Udeid Air Base', category: 'airbase' })).toBe('us_airbase')
    expect(unitImageKey({ name: 'Diego Garcia', category: 'airbase' })).toBe('us_airbase')
    expect(unitImageKey({ name: 'Mehrabad Air Base (Tehran)', category: 'airbase' })).toBe('iran_airbase')
    expect(unitImageKey({ name: 'Tabriz Air Base (2nd TFB)', category: 'airbase' })).toBe('iran_airbase')
  })

  it('maps Iranian SAM, missile, and naval classes', () => {
    expect(unitImageKey({ name: 'S-300PMU-2 (Isfahan)', category: 'sam_site' })).toBe('s300pmu2')
    expect(unitImageKey({ name: 'Bavar-373 (Tehran)', category: 'sam_site' })).toBe('bavar373')
    expect(unitImageKey({ name: '3rd Khordad (Bandar Abbas)', category: 'sam_site' })).toBe('khordad3')
    expect(unitImageKey({ name: 'Tor-M1 (Isfahan)', category: 'sam_site' })).toBe('tor_m1')
    expect(unitImageKey({ name: 'Shahab-3 TEL (Tabriz)', category: 'missile_battery' })).toBe('shahab3')
    expect(unitImageKey({ name: 'Sejjil-2 TEL (Semnan)', category: 'missile_battery' })).toBe('sejjil2')
    expect(unitImageKey({ name: 'Fateh-110 Battery (Dezful)', category: 'missile_battery' })).toBe('fateh110')
    expect(unitImageKey({ name: 'Zolfaghar Battery (Kermanshah)', category: 'missile_battery' })).toBe('zolfaghar')
    expect(unitImageKey({ name: 'Soumar GLCM Battery', category: 'missile_battery' })).toBe('soumar')
    expect(unitImageKey({ name: 'Shahed-136 Battery (Kermanshah)', category: 'missile_battery' })).toBe('shahed136')
    expect(unitImageKey({ name: 'Ghadir-class Sub (Jask)', category: 'submarine' })).toBe('ghadir_sub')
    expect(unitImageKey({ name: 'Hormuz Coastal Battery', category: 'missile_battery' })).toBe('noor_coastal')
    expect(unitImageKey({ name: 'Qeshm Island Battery', category: 'missile_battery' })).toBe('noor_coastal')
    expect(unitImageKey({ name: 'IRGC FAC Group (Hormuz)', category: 'ship' })).toBe('irgc_fac')
  })

  it('returns null for units without recognition imagery', () => {
    expect(unitImageKey({ name: 'IRGC Minefield — North Hormuz', category: 'minefield' })).toBeNull()
    expect(unitImageKey({ name: 'Mobile Command Post', category: 'missile_battery' })).toBeNull()
    expect(unitImageKey({ name: 'Bandar Abbas Naval Base (IRIN 1st District)', category: 'naval_base' })).toBeNull()
    expect(unitImageKey({ name: 'Nebo SVU EW Radar', category: 'sam_site' })).toBeNull()
  })
})

describe('UNIT_IMAGES', () => {
  it('every entry carries file, author, license, and source for the credit line', () => {
    const allowed = /^(Public domain|CC0|CC BY(-SA)?( \d\.\d)?|Attribution)$/i
    for (const [key, e] of Object.entries(UNIT_IMAGES)) {
      expect(e.file, key).toBe(`${key}.jpg`)
      expect(e.author.length, key).toBeGreaterThan(0)
      expect(e.license, key).toMatch(allowed)
      expect(e.sourceUrl, key).toMatch(/^https:\/\/commons\.wikimedia\.org\//)
    }
  })

  it('covers at least 12 ORBAT units with downloaded images', () => {
    const covered = [...usaUnits, ...iranUnits].filter((u) => {
      const key = unitImageKey(u)
      return key !== null && UNIT_IMAGES[key] !== undefined
    })
    expect(covered.length).toBeGreaterThanOrEqual(12)
  })
})
