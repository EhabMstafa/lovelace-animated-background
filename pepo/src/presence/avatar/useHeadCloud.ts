import { useEffect, useState } from 'react'
import avatarAsset from './assets/fathi.bin?inline'
import { decodeFathi, type HeadCloud } from './fathiHead'

export type HeadCloudData = HeadCloud

function decodeDataUrl(url: string) {
  const bin = atob(url.slice(url.indexOf(',') + 1))
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes.buffer
}

/**
 * Decodes the Avatar once the Orb is already on screen, so the first frames
 * belong to the Orb. Returns null until ready.
 */
export function useHeadCloud(total: number) {
  const [cloud, setCloud] = useState<HeadCloud | null>(null)
  useEffect(() => {
    const id = window.setTimeout(() => setCloud(decodeFathi(decodeDataUrl(avatarAsset), total)), 250)
    return () => window.clearTimeout(id)
  }, [total])
  return cloud
}
