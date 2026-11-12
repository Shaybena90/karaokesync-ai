import { useCallback, useEffect, useState } from 'react'
import { api, type WorkerStatus } from './api'

/** Processing server status, refreshed every 20 s while the page is open. */
export function useWorkerStatus(enabled = true) {
  const [status, setStatus] = useState<WorkerStatus | null>(null)
  /** When the status was fetched (for "last seen … ago"). */
  const [checkedAt, setCheckedAt] = useState(0)
  const receive = useCallback((s: WorkerStatus) => {
    setStatus(s)
    setCheckedAt(Date.now())
  }, [])

  const reload = useCallback(async () => {
    try {
      receive(await api.workerStatus())
    } catch {
      /* the API may be waking up: keep the last known status */
    }
  }, [receive])

  useEffect(() => {
    if (!enabled) return
    let alive = true
    const load = () => void api.workerStatus().then((s) => alive && receive(s)).catch(() => undefined)
    load()
    const timer = setInterval(load, 20000)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [enabled, receive])

  return { status, checkedAt, reload }
}
