/**
 * Minimal promise wrapper around IndexedDB with a versioned schema.
 * To change the schema: bump DB_VERSION and append a migration — never edit old ones.
 */
export const DB_NAME = 'hakasefet'
export const DB_VERSION = 3

type Migration = (db: IDBDatabase, tx: IDBTransaction) => void

export const MIGRATIONS: Migration[] = [
  // v1 — initial stores
  (db) => {
    db.createObjectStore('kv')
    db.createObjectStore('attempts', { keyPath: 'id' })
    db.createObjectStore('ledger', { keyPath: 'key' })
    db.createObjectStore('bests', { keyPath: 'key' })
    db.createObjectStore('mistakes', { keyPath: 'questionId' })
  },
  // v2 — completed-games history (stats, archive status)
  (db) => {
    const h = db.createObjectStore('history', { keyPath: 'attemptId' })
    h.createIndex('byDate', 'vaultDate')
  },
  // v3 — escape-room runs (the game became an escape room; old trivia data stays untouched)
  (db) => {
    const r = db.createObjectStore('runs', { keyPath: 'runId' })
    r.createIndex('byRoom', 'roomId')
  },
]

let dbPromise: Promise<IDBDatabase> | null = null

export function openDb(factory: IDBFactory = indexedDB, version = DB_VERSION): Promise<IDBDatabase> {
  if (dbPromise && factory === indexedDB && version === DB_VERSION) return dbPromise
  const p = new Promise<IDBDatabase>((resolve, reject) => {
    let req: IDBOpenDBRequest
    try {
      req = factory.open(DB_NAME, version)
    } catch (e) {
      reject(e)
      return
    }
    req.onupgradeneeded = (ev) => {
      const db = req.result
      const tx = req.transaction!
      for (let v = ev.oldVersion; v < version; v++) MIGRATIONS[v](db, tx)
    }
    req.onsuccess = () => {
      const db = req.result
      // Another tab upgraded the schema: close so it can proceed; next call reopens.
      db.onversionchange = () => {
        db.close()
        dbPromise = null
      }
      resolve(db)
    }
    req.onerror = () => reject(req.error)
    req.onblocked = () => reject(new Error('blocked'))
  })
  if (factory === indexedDB && version === DB_VERSION) {
    dbPromise = p
    p.catch(() => (dbPromise = null))
  }
  return p
}

export function closeDb(): void {
  dbPromise?.then((db) => db.close()).catch(() => {})
  dbPromise = null
}

export function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result)
    r.onerror = () => reject(r.error)
  })
}

export function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error ?? new Error('aborted'))
  })
}

/**
 * Run `fn` inside one readwrite transaction. IndexedDB serialises transactions
 * whose store sets overlap — across tabs too — so read-check-write inside `fn`
 * is atomic. `fn` must only await IndexedDB requests.
 */
export async function withTx<T>(stores: string[], mode: IDBTransactionMode, fn: (tx: IDBTransaction) => Promise<T>): Promise<T> {
  const db = await openDb()
  const tx = db.transaction(stores, mode)
  const finished = done(tx)
  let result: T
  try {
    result = await fn(tx)
  } catch (e) {
    try {
      tx.abort()
    } catch {
      /* already finished */
    }
    await finished.catch(() => {})
    throw e
  }
  await finished
  return result
}
