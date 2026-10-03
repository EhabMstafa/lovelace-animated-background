/**
 * Bakes the FATHI avatar export into PEPO's compact avatar asset.
 *
 *   node scripts/build-fathi.mjs <path-to-fathi-avatar-export>
 *
 * Reads fathi-cloud.bin (FTH2 points, weights, warm/mask flag), the depth and
 * contour sidecars that refine z and xy, and fathi-strands.json. Applies the
 * sidecars, keeps the same deterministic display sample the original renderer
 * draws in motion (hash < 0.20 + 0.30·weight), adds the ear-bridge dust, and
 * flattens the visible strands into segments.
 *
 * It also estimates a surface normal for every point from FATHI's depth
 * (a smoothed height field over the whole cloud), so the renderer can light
 * the relief like a 3D form.
 *
 * Output: src/presence/avatar/assets/fathi.bin (little-endian)
 *   char[4] 'PFA2', u32 pointCount, u32 segmentCount, f32 Q
 *   points:   i16 x, y, z (× 1/Q), u8 weight, u8 warm, i8 nx, ny, nz (× 1/127), u8 pad
 *   segments: i16 ax, ay, az, bx, by, bz (× 1/Q),
 *             u8 strengthA, u8 strengthB, u8 progressA, u8 progressB, u8 warm, u8 kind
 * Kinds: 0 neck-flow, 1 throat, 2 shoulder-link, 3 jaw-guide.
 */
import fs from 'fs'
import path from 'path'

const dir = process.argv[2]
const out = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../src/presence/avatar/assets/fathi.bin')
const view = (name) => {
  const b = fs.readFileSync(path.join(dir, name))
  return new DataView(b.buffer, b.byteOffset, b.byteLength)
}

const cloud = view('fathi-cloud.bin')
if (String.fromCharCode(...[0, 1, 2, 3].map((i) => cloud.getUint8(i))) !== 'FTH2') throw new Error('cloud: bad magic')
const N = cloud.getUint32(4, true)
const depth = view('fathi-depth.bin')
const contour = view('fathi-contour.bin')
const strands = JSON.parse(fs.readFileSync(path.join(dir, 'fathi-strands.json'), 'utf8'))

// ── Height field of the relief, from every source point ──
const RES = 0.012, X0 = -1.65, Y0 = -2.0, GW = Math.ceil(3.3 / RES), GH = Math.ceil(3.1 / RES)
const zSum = new Float64Array(GW * GH), zW = new Float64Array(GW * GH)
for (let i = 0; i < N; i++) {
  const x = contour.getFloat32(40 + i * 8, true), y = contour.getFloat32(44 + i * 8, true)
  const gi = Math.floor((x - X0) / RES), gj = Math.floor((y - Y0) / RES)
  if (gi < 0 || gj < 0 || gi >= GW || gj >= GH) continue
  zSum[gj * GW + gi] += depth.getFloat32(40 + i * 4, true)
  zW[gj * GW + gi] += 1
}
let field = new Float64Array(GW * GH)
let known = new Uint8Array(GW * GH)
for (let k = 0; k < field.length; k++) if (zW[k] > 0) { field[k] = zSum[k] / zW[k]; known[k] = 1 }
// Fill gaps by diffusion so the field is continuous between the drawn lines.
for (let it = 0; it < 60; it++) {
  const next = field.slice()
  for (let j = 1; j < GH - 1; j++) for (let i = 1; i < GW - 1; i++) {
    const k = j * GW + i
    if (known[k]) continue
    next[k] = (field[k - 1] + field[k + 1] + field[k - GW] + field[k + GW]) / 4
  }
  field = next
}
// Smooth: the relief, not the pen strokes, should decide the light.
const blur = (src, r) => {
  const w = []
  for (let d = -r; d <= r; d++) w.push(Math.exp(-(d * d) / (2 * (r / 2) ** 2)))
  const pass = (a, horizontal) => {
    const out = new Float64Array(a.length)
    for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) {
      let s = 0, ws = 0
      for (let d = -r; d <= r; d++) {
        const ii = horizontal ? i + d : i, jj = horizontal ? j : j + d
        if (ii < 0 || jj < 0 || ii >= GW || jj >= GH) continue
        s += a[jj * GW + ii] * w[d + r]; ws += w[d + r]
      }
      out[j * GW + i] = s / ws
    }
    return out
  }
  return pass(pass(src, true), false)
}
field = blur(field, 6)
const RELIEF = 2.6 // exaggerate the shallow relief for lighting only
const normalAt = (x, y) => {
  const gi = Math.min(GW - 2, Math.max(1, Math.round((x - X0) / RES)))
  const gj = Math.min(GH - 2, Math.max(1, Math.round((y - Y0) / RES)))
  const dx = (field[gj * GW + gi + 1] - field[gj * GW + gi - 1]) / (2 * RES) * RELIEF
  const dy = (field[(gj + 1) * GW + gi] - field[(gj - 1) * GW + gi]) / (2 * RES) * RELIEF
  const l = Math.hypot(dx, dy, 1)
  return [-dx / l, -dy / l, 1 / l]
}

const points = []
for (let i = 0; i < N; i++) {
  const weight = cloud.getUint8(12 + 6 * N + i)
  const hash = (Math.imul(i + 1, 2654435761) >>> 0) / 4294967296
  if (hash >= 0.2 + 0.3 * (weight / 255)) continue
  points.push([
    contour.getFloat32(40 + i * 8, true),
    contour.getFloat32(44 + i * 8, true),
    depth.getFloat32(40 + i * 4, true),
    weight,
    cloud.getUint8(12 + 7 * N + i),
  ])
}
// Ear-bridge dust: irregular points that optically join cheek and ear.
let row = 0
for (const p of strands.paths) {
  if (p.kind !== 'ear-bridge') continue
  p.positions.forEach((q, i) => {
    if ((i + row) % 3 !== 0) return
    const ph = (row + 1) * 31 + i * 17
    points.push([q[0] + Math.sin(ph * 1.71) * 0.004, q[1] + Math.sin(ph * 0.83) * 0.009, q[2] + Math.cos(ph * 1.13) * 0.003, Math.round((0.46 + 0.1 * Math.sin(ph * 0.37)) * 255), 0])
  })
  row++
}

const KIND = { 'neck-flow': 0, throat: 1, 'shoulder-link': 2, 'jaw-guide': 3 }
const segs = []
for (const p of strands.paths) {
  if (!(p.kind in KIND)) continue // mask rows stay hidden, ear bridges became dust
  const pts = p.positions
  for (let i = 0; i < pts.length - 1; i++) {
    const s = (j) => {
      const t = j / (pts.length - 1)
      return [p.strength * Math.min(1, t / 0.1, (1 - t) / 0.1), t]
    }
    const [sa, ta] = s(i)
    const [sb, tb] = s(i + 1)
    segs.push([...pts[i], ...pts[i + 1], sa, sb, ta, tb, p.warm, KIND[p.kind]])
  }
}

const Q = 16384
const buf = Buffer.alloc(16 + points.length * 12 + segs.length * 18)
buf.write('PFA2', 0, 'ascii')
buf.writeUInt32LE(points.length, 4)
buf.writeUInt32LE(segs.length, 8)
buf.writeFloatLE(Q, 12)
let o = 16
for (const [x, y, z, w, warm] of points) {
  for (const v of [x, y, z]) { buf.writeInt16LE(Math.round(v * Q), o); o += 2 }
  buf.writeUInt8(w, o++)
  buf.writeUInt8(warm, o++)
  for (const v of normalAt(x, y)) buf.writeInt8(Math.round(v * 127), o++)
  o++
}
for (const s of segs) {
  for (let k = 0; k < 6; k++) { buf.writeInt16LE(Math.round(s[k] * Q), o); o += 2 }
  for (let k = 6; k < 10; k++) buf.writeUInt8(Math.round(Math.max(0, Math.min(1, s[k])) * 255), o++)
  buf.writeUInt8(s[10], o++)
  buf.writeUInt8(s[11], o++)
}
fs.writeFileSync(out, buf)
console.log(`wrote ${out}: ${points.length} points, ${segs.length} segments, ${buf.length} bytes`)
