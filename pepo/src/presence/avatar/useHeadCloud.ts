import { useEffect, useState } from 'react'
import HeadWorker from './headWorker?worker&inline'

export interface HeadCloudData {
  position: Float32Array
  normal: Float32Array
  kind: Float32Array
  weight: Float32Array
  traceSegments: Float32Array
  traceT: Float32Array
  traceKind: Float32Array
  traceNormal: Float32Array
}

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
