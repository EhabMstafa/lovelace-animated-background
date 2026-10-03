import cloud from './fathi-cloud.bin?inline'
import contour from './fathi-contour.bin?inline'
import depth from './fathi-depth.bin?inline'
import strands from './fathi-strands.json?raw'

/**
 * FATHI's renderer fetches its geometry files next to its own module. Once
 * bundled (and in the single-file preview) there are no such files, so the
 * same bytes are embedded here and served to those four requests only.
 * Everything else goes to the network untouched, and fathi-avatar.js stays
 * exactly as exported.
 */
const FILES: Record<string, () => ArrayBuffer | string> = {
  'fathi-cloud.bin': () => decode(cloud),
  'fathi-depth.bin': () => decode(depth),
  'fathi-contour.bin': () => decode(contour),
  'fathi-strands.json': () => strands,
}

function decode(dataUrl: string) {
  const bin = atob(dataUrl.slice(dataUrl.indexOf(',') + 1))
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes.buffer
}

let installed = false

export function serveFathiAssets() {
  if (installed) return
  installed = true
  const network = window.fetch.bind(window)
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const name = url.split(/[?#]/)[0].split('/').pop() ?? ''
    const file = FILES[name]
    if (!file) return network(input, init)
    const body = file()
    return Promise.resolve(
      new Response(body, { status: 200, headers: { 'Content-Type': typeof body === 'string' ? 'application/json' : 'application/octet-stream' } }),
    )
  }
}
