import { useEffect, useState } from 'react'
import HeadWorker from './headWorker?worker&inline'

import type { HeadCloud } from './scanHead'

export type HeadCloudData = HeadCloud

/**
 * Sculpts the Avatar in a worker once the Orb is already on screen.
 * Returns null until the cloud is ready.
 */
export function useHeadCloud(total: number) {
  const [cloud, setCloud] = useState<HeadCloudData | null>(null)

  useEffect(() => {
    const worker = new HeadWorker()
    worker.onmessage = (e: MessageEvent<HeadCloudData>) => {
      setCloud(e.data)
      worker.terminate()
    }
    // Give the first frames to the Orb.
    const id = window.setTimeout(() => worker.postMessage({ total }), 400)
    return () => {
      window.clearTimeout(id)
      worker.terminate()
    }
  }, [total])

  return cloud
}
