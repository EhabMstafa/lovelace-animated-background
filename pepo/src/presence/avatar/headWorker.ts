import headAsset from './assets/head.bin?inline'
import { buildScanCloud } from './scanHead'

/** Decodes the head scan and builds the Avatar's cloud off the main thread. */
function decodeDataUrl(url: string) {
  const bin = atob(url.slice(url.indexOf(',') + 1))
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes.buffer
}

self.onmessage = (e: MessageEvent<{ total: number }>) => {
  const cloud = buildScanCloud(decodeDataUrl(headAsset), e.data.total)
  ;(self as unknown as Worker).postMessage(cloud, [
    cloud.position.buffer,
    cloud.normal.buffer,
    cloud.kind.buffer,
    cloud.weight.buffer,
    cloud.traceSegments.buffer,
    cloud.traceT.buffer,
    cloud.traceKind.buffer,
    cloud.traceNormal.buffer,
  ])
}
