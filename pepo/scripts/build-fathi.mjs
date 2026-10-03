/**
 * Bakes the FATHI avatar export into PEPO's compact avatar asset.
 *
 *   node scripts/build-fathi.mjs <path-to-fathi-avatar-export>
 *
 * Reads fathi-cloud.bin (FTH2 points, weights, warm/mask flag), the depth and
 * contour sidecars that refine z and xy, and fathi-strands.json. Applies the
 * sidecars and keeps EVERY source point (FATHI's full original density, not
 * the lighter sample its renderer drew in motion), adds the ear-bridge dust,
 * and flattens the visible strands into segments.
 *
 * It also bakes FATHI's solid body: the silhouette of the drawing, filled and
 * smoothed, as a grid mesh that follows FATHI's depth. Drawn opaque behind
 * the points, it keeps the avatar a solid person (nothing behind the head
 * shows through) without changing the drawing itself.
 *
 * Output: src/presence/avatar/assets/fathi.bin (little-endian)
 *   char[4] 'PFA3', u32 pointCount, u32 segmentCount, f32 Q,
 *   u32 shellVertexCount, u32 shellIndexCount
 *   points:   i16 x, y, z (× 1/Q), u8 weight, u8 warm
 *   shell:    i16 x, y, z (× 1/Q), u8 coverage, u8 pad   per vertex
 *             u32 indices
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
// ── Solid body: fill the drawing's silhouette row by row, then smooth it ──
const occ = new Uint16Array(GW * GH)
for (let i = 0; i < N; i++) {
  if (cloud.getUint8(12 + 6 * N + i) < 40) continue
  const x = contour.getFloat32(40 + i * 8, true), y = contour.getFloat32(44 + i * 8, true)
  const gi = Math.floor((x - X0) / RES), gj = Math.floor((y - Y0) / RES)
  if (gi >= 0 && gj >= 0 && gi < GW && gj < GH) occ[gj * GW + gi]++
}
let mask = new Float64Array(GW * GH)
for (let j = 0; j < GH; j++) {
  let lo = -1, hi = -1
  for (let i = 0; i < GW; i++) if (occ[j * GW + i] >= 3) { if (lo < 0) lo = i; hi = i }
  if (lo < 0) continue
  // Stay just inside the outline so the drawn contour sits on the edge.
  for (let i = lo + 1; i <= hi - 1; i++) mask[j * GW + i] = 1
}
mask = blur(mask, 3)
mask = blur(mask, 3)

const points = []
for (let i = 0; i < N; i++) {
  const weight = cloud.getUint8(12 + 6 * N + i)
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
// Shell mesh: grid vertices with depth (slightly behind the drawing) and coverage.
const vIndex = new Int32Array(GW * GH).fill(-1)
const shellVerts = []
const shellIdx = []
const vertexAt = (i, j) => {
  const k = j * GW + i
  if (vIndex[k] < 0) {
    vIndex[k] = shellVerts.length
    shellVerts.push([X0 + i * RES, Y0 + j * RES, field[k] - 0.03, mask[k]])
  }
  return vIndex[k]
}
for (let j = 0; j < GH - 1; j++) for (let i = 0; i < GW - 1; i++) {
  const m = Math.max(mask[j * GW + i], mask[j * GW + i + 1], mask[(j + 1) * GW + i], mask[(j + 1) * GW + i + 1])
  if (m < 0.02) continue
  const a = vertexAt(i, j), b = vertexAt(i + 1, j), c = vertexAt(i, j + 1), d = vertexAt(i + 1, j + 1)
  shellIdx.push(a, b, d, a, d, c)
}

const buf = Buffer.alloc(24 + points.length * 8 + shellVerts.length * 8 + shellIdx.length * 4 + segs.length * 18)
buf.write('PFA3', 0, 'ascii')
buf.writeUInt32LE(points.length, 4)
buf.writeUInt32LE(segs.length, 8)
buf.writeFloatLE(Q, 12)
buf.writeUInt32LE(shellVerts.length, 16)
buf.writeUInt32LE(shellIdx.length, 20)
let o = 24
for (const [x, y, z, w, warm] of points) {
  for (const v of [x, y, z]) { buf.writeInt16LE(Math.round(v * Q), o); o += 2 }
  buf.writeUInt8(w, o++)
  buf.writeUInt8(warm, o++)
}
for (const [x, y, z, m] of shellVerts) {
  for (const v of [x, y, z]) { buf.writeInt16LE(Math.round(v * Q), o); o += 2 }
  buf.writeUInt8(Math.round(Math.min(1, m) * 255), o++)
  o++
}
for (const k of shellIdx) { buf.writeUInt32LE(k, o); o += 4 }
for (const s of segs) {
  for (let k = 0; k < 6; k++) { buf.writeInt16LE(Math.round(s[k] * Q), o); o += 2 }
  for (let k = 6; k < 10; k++) buf.writeUInt8(Math.round(Math.max(0, Math.min(1, s[k])) * 255), o++)
  buf.writeUInt8(s[10], o++)
  buf.writeUInt8(s[11], o++)
}
fs.writeFileSync(out, buf)
console.log(`wrote ${out}: ${points.length} points, ${shellVerts.length} shell vertices, ${shellIdx.length / 3} shell triangles, ${segs.length} segments, ${buf.length} bytes`)
