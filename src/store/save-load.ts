import { openDB } from 'idb'

const DB_NAME = 'realpolitik'
const STORE_NAME = 'saves'

async function getDB() {
  return openDB(DB_NAME, 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME)
      }
    },
  })
}

export async function saveToSlot(slotName: string, stateJson: string): Promise<void> {
  const db = await getDB()
  await db.put(STORE_NAME, { state: stateJson, timestamp: Date.now(), name: slotName }, slotName)
}

export async function loadFromSlot(slotName: string): Promise<string | null> {
  const db = await getDB()
  const save = await db.get(STORE_NAME, slotName)
  return save?.state ?? null
}

export async function listSaves(): Promise<{ key: string; name: string; timestamp: number }[]> {
  const db = await getDB()
  const keys = await db.getAllKeys(STORE_NAME)
  const results: { key: string; name: string; timestamp: number }[] = []
  for (const key of keys) {
    const save = await db.get(STORE_NAME, key)
    if (save) results.push({ key: String(key), name: save.name, timestamp: save.timestamp })
  }
  return results.sort((a, b) => b.timestamp - a.timestamp)
}
