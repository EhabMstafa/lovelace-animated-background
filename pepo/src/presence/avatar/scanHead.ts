import { mulberry32 } from '../orb/geometry'

/**
 * PEPO's head, built from a real 3D head scan (see scripts/build-head.mjs).
 *
 * The scan is turned into:
 *  - a lit point cloud, denser where the face carries expression and
 *    character (eyes, brow, nose bridge, cheekbones, ears, jaw, neck)
 *  - a mask, draped over the real face like cloth (a dilated, smoothed
 *    height field), covering the nose, mouth and chin
 *  - traces: crease lines (eyelids, ears), the mask's weave and edges,
 *    and strands that run down the neck and out across the shoulders
 *    (true slices through the 3D surface)
 *
 * Face units: y up, the face looks down +z, crown ≈ 0.55, chin ≈ -0.6.
 */

/** `maskEdge` and `contour` exist only as traces. */
export const FACE_KIND = { skin: 0, mask: 1, feature: 2, strand: 3, dust: 4, maskEdge: 5, contour: 6 } as const

export interface HeadCloud {
  position: Float32Array
  normal: Float32Array
  kind: Float32Array
  weight: Float32Array
  traceSegments: Float32Array
  traceT: Float32Array
  traceKind: Float32Array
  traceNormal: Float32Array
}

interface Mesh {
  pos: Float32Array
  nrm: Float32Array
  idx: Uint16Array
}

export function decodeHead(buffer: ArrayBuffer): Mesh {
  const dv = new DataView(buffer)
  const n = dv.getUint32(0, true)
  const m = dv.getUint32(4, true)
  const pos = new Float32Array(n * 3)
  const nrm = new Float32Array(n * 3)
  let o = 8
  for (let i = 0; i < n * 3; i++, o += 2) pos[i] = dv.getInt16(o, true) / 8192
  for (let i = 0; i < n * 3; i++, o += 1) nrm[i] = dv.getInt8(o) / 127
  o += (n * 3) % 2
  const idx = new Uint16Array(m)
  for (let i = 0; i < m; i++, o += 2) idx[i] = dv.getUint16(o, true)
  return { pos, nrm, idx }
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))
const smoothstep = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a), 0, 1)
  return t * t * (3 - 2 * t)
}
const gauss = (d: number, s: number) => Math.exp(-(d * d) / (s * s))

// ── Mask outline (face units) ──
const MASK_HALF_WIDTH = 0.4
const maskTop = (x: number) => -0.115 - 0.07 * Math.pow(Math.min(1, Math.abs(x) / MASK_HALF_WIDTH), 1.5)
const maskBottom = (x: number) => -0.62 + 0.26 * Math.pow(Math.min(1, Math.abs(x) / MASK_HALF_WIDTH), 1.6)

/** A front-facing height field of the face, dilated and smoothed into a mask. */
class MaskField {
  readonly x0 = -0.5
  readonly y0 = -0.78
  readonly res = 0.004
  readonly w = 251
  readonly h = 196
  readonly z: Float32Array

  constructor(mesh: Mesh) {
    const { w, h, res, x0, y0 } = this
    const depth = new Float32Array(w * h).fill(-Infinity)
    const { pos, idx } = mesh
    for (let t = 0; t < idx.length; t += 3) {
      const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3
      const ax = pos[a], ay = pos[a + 1], az = pos[a + 2]
      const bx = pos[b], by = pos[b + 1], bz = pos[b + 2]
      const cx = pos[c], cy = pos[c + 1], cz = pos[c + 2]
      if (Math.max(az, bz, cz) < 0) continue
      const minI = Math.max(0, Math.floor((Math.min(ax, bx, cx) - x0) / res))
      const maxI = Math.min(w - 1, Math.ceil((Math.max(ax, bx, cx) - x0) / res))
      const minJ = Math.max(0, Math.floor((Math.min(ay, by, cy) - y0) / res))
      const maxJ = Math.min(h - 1, Math.ceil((Math.max(ay, by, cy) - y0) / res))
      const den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy)
      if (Math.abs(den) < 1e-12) continue
      for (let j = minJ; j <= maxJ; j++) {
        const py = y0 + j * res
        for (let i = minI; i <= maxI; i++) {
          const px = x0 + i * res
          const l1 = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / den
          const l2 = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / den
          const l3 = 1 - l1 - l2
          if (l1 < 0 || l2 < 0 || l3 < 0) continue
          const z = l1 * az + l2 * bz + l3 * cz
          const k = j * w + i
          if (z > depth[k]) depth[k] = z
        }
      }
    }
    // Cloth over the face: lift over the nose and lips, then relax.
    const dilated = this.maxFilter(depth, 8)
    this.z = this.blur(dilated, 6)
    for (let k = 0; k < this.z.length; k++) this.z[k] += 0.016
  }

  private maxFilter(src: Float32Array, r: number) {
    const { w, h } = this
    const tmp = new Float32Array(w * h)
    const out = new Float32Array(w * h)
    for (let j = 0; j < h; j++)
      for (let i = 0; i < w; i++) {
        let m = -Infinity
        for (let d = -r; d <= r; d++) {
          const ii = i + d
          if (ii >= 0 && ii < w) m = Math.max(m, src[j * w + ii])
        }
        tmp[j * w + i] = m
      }
    for (let j = 0; j < h; j++)
      for (let i = 0; i < w; i++) {
        let m = -Infinity
        for (let d = -r; d <= r; d++) {
          const jj = j + d
          if (jj >= 0 && jj < h) m = Math.max(m, tmp[jj * w + i])
        }
        out[j * w + i] = m
      }
    return out
  }

  private blur(src: Float32Array, sigma: number) {
    const { w, h } = this
    const r = Math.ceil(sigma * 2.5)
    const k: number[] = []
    for (let d = -r; d <= r; d++) k.push(Math.exp(-(d * d) / (2 * sigma * sigma)))
    const pass = (from: Float32Array, horizontal: boolean) => {
      const out = new Float32Array(w * h).fill(-Infinity)
      for (let j = 0; j < h; j++)
        for (let i = 0; i < w; i++) {
          if (!isFinite(from[j * w + i])) continue
          let s = 0, ws = 0
          for (let d = -r; d <= r; d++) {
            const ii = horizontal ? i + d : i
            const jj = horizontal ? j : j + d
            if (ii < 0 || ii >= w || jj < 0 || jj >= h) continue
            const v = from[jj * w + ii]
            if (!isFinite(v)) continue
            s += v * k[d + r]
            ws += k[d + r]
          }
          out[j * w + i] = s / ws
        }
      return out
    }
    return pass(pass(src, true), false)
  }

  /** Bilinear sample; NaN outside the field. */
  sample(x: number, y: number) {
    const fx = (x - this.x0) / this.res
    const fy = (y - this.y0) / this.res
    const i = Math.floor(fx), j = Math.floor(fy)
    if (i < 0 || j < 0 || i >= this.w - 1 || j >= this.h - 1) return NaN
    const tx = fx - i, ty = fy - j
    const z00 = this.z[j * this.w + i], z10 = this.z[j * this.w + i + 1]
    const z01 = this.z[(j + 1) * this.w + i], z11 = this.z[(j + 1) * this.w + i + 1]
    const v = (z00 * (1 - tx) + z10 * tx) * (1 - ty) + (z01 * (1 - tx) + z11 * tx) * ty
    return isFinite(v) ? v : NaN
  }

  normal(x: number, y: number): [number, number, number] {
    const e = this.res * 1.5
    const dx = (this.sample(x + e, y) - this.sample(x - e, y)) / (2 * e)
    const dy = (this.sample(x, y + e) - this.sample(x, y - e)) / (2 * e)
    const l = Math.hypot(dx, dy, 1)
    return isFinite(l) ? [-dx / l, -dy / l, 1 / l] : [0, 0, 1]
  }

  inside(x: number, y: number) {
    if (Math.abs(x) > MASK_HALF_WIDTH || y > maskTop(x) || y < maskBottom(x)) return false
    const z = this.sample(x, y)
    return isFinite(z) && z > 0.14
  }
}

/** Where on the head the eye of a viewer lands: weights for point density. */
function importance(x: number, y: number, z: number) {
  const ax = Math.abs(x)
  let w = 0.45 + 0.3 * smoothstep(0, 0.4, z)
  w += 1.1 * gauss(Math.hypot(ax - 0.17, y + 0.05, z - 0.48), 0.08) // eyes
  w += 0.5 * gauss(Math.hypot(ax - 0.17, y - 0.04, z - 0.52), 0.07) // brows
  w += 0.6 * gauss(Math.hypot(x, y + 0.08, z - 0.6), 0.06) // nose bridge
  w += 0.4 * gauss(Math.hypot(ax - 0.28, y + 0.17, z - 0.36), 0.09) // cheekbones
  w += 0.6 * gauss(Math.hypot(ax - 0.45, y + 0.2, z - 0.05), 0.12) // ears
  w += 0.3 * gauss(Math.hypot(ax - 0.26, y + 0.52, z - 0.25), 0.12) // jaw
  if (y < -0.62 && y > -1.0) w += 0.2 // neck
  if (y < -0.95) w *= 0.5 * (1 - smoothstep(0.55, 1.1, ax)) + 0.1 // shoulders thin out
  if (z < -0.15 && y > -0.62) w *= 0.6 // back of the head
  return w
}

export function buildScanCloud(buffer: ArrayBuffer, total: number, seed = 29): HeadCloud {
  const mesh = decodeHead(buffer)
  const { pos, nrm, idx } = mesh
  const rand = mulberry32(seed)
  const mask = new MaskField(mesh)
  const triCount = idx.length / 3

  const P: number[] = []
  const N: number[] = []
  const K: number[] = []
  const W: number[] = []
  const push = (x: number, y: number, z: number, nx: number, ny: number, nz: number, k: number, w: number) => {
    P.push(x, y, z)
    N.push(nx, ny, nz)
    K.push(k)
    W.push(w)
  }

  const underMask = (x: number, y: number, z: number, nz: number) => {
    if (!mask.inside(x, y) || nz < -0.3) return false
    return z < mask.sample(x, y) + 0.01
  }

  // ── Triangle data ──
  const area = new Float32Array(triCount)
  const crease = new Float32Array(triCount)
  const fnorm = new Float32Array(triCount * 3)
  for (let t = 0; t < triCount; t++) {
    const a = idx[t * 3] * 3, b = idx[t * 3 + 1] * 3, c = idx[t * 3 + 2] * 3
    const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2]
    const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2]
    const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx
    const l = Math.hypot(cx, cy, cz)
    area[t] = l / 2
    fnorm.set([cx / (l || 1), cy / (l || 1), cz / (l || 1)], t * 3)
    const d01 = nrm[a] * nrm[b] + nrm[a + 1] * nrm[b + 1] + nrm[a + 2] * nrm[b + 2]
    const d12 = nrm[b] * nrm[c] + nrm[b + 1] * nrm[c + 1] + nrm[b + 2] * nrm[c + 2]
    const d20 = nrm[c] * nrm[a] + nrm[c + 1] * nrm[a + 1] + nrm[c + 2] * nrm[a + 2]
    crease[t] = clamp(1 - Math.min(d01, d12, d20), 0, 1)
  }

  // ── Traces ──
  const seg: number[] = []
  const segT: number[] = []
  const segK: number[] = []
  const segN: number[] = []
  const addSeg = (a: number[], b: number[], na: number[], nb: number[], ta: number, tb: number, k: number) => {
    seg.push(a[0], a[1], a[2], b[0], b[1], b[2])
    segN.push(na[0], na[1], na[2], nb[0], nb[1], nb[2])
    segT.push(ta, tb)
    segK.push(k)
    segK.push(k)
  }

  // Creases: eyelids, ear folds, the brow. Sharp edges of the scan.
  const edges = new Map<number, number>()
  for (let t = 0; t < triCount; t++) {
    for (let e = 0; e < 3; e++) {
      const i0 = idx[t * 3 + e], i1 = idx[t * 3 + ((e + 1) % 3)]
      const key = Math.min(i0, i1) * 65536 + Math.max(i0, i1)
      const other = edges.get(key)
      if (other === undefined) {
        edges.set(key, t)
        continue
      }
      const dot = fnorm[t * 3] * fnorm[other * 3] + fnorm[t * 3 + 1] * fnorm[other * 3 + 1] + fnorm[t * 3 + 2] * fnorm[other * 3 + 2]
      if (dot > 0.62) continue
      const a = [pos[i0 * 3], pos[i0 * 3 + 1], pos[i0 * 3 + 2]]
      const b = [pos[i1 * 3], pos[i1 * 3 + 1], pos[i1 * 3 + 2]]
      if (a[1] < -0.62 || b[1] < -0.62) continue
      const na = [nrm[i0 * 3], nrm[i0 * 3 + 1], nrm[i0 * 3 + 2]]
      const nb = [nrm[i1 * 3], nrm[i1 * 3 + 1], nrm[i1 * 3 + 2]]
      if (underMask(a[0], a[1], a[2], na[2]) || underMask(b[0], b[1], b[2], nb[2])) continue
      addSeg(a, b, na, nb, (0.55 - a[1]) / 1.2, (0.55 - b[1]) / 1.2, FACE_KIND.feature)
    }
  }

  // Strands: slices through the neck and shoulders by planes around the
  // vertical axis, so lines run down the neck and fan out over the shoulders.
  const SLICES = 64
  for (let s = 0; s < SLICES; s++) {
    const th = -1.45 + (2.9 * s) / (SLICES - 1) + (rand() - 0.5) * 0.02
    const nx = Math.cos(th), nz = -Math.sin(th)
    const dx = Math.sin(th), dz = Math.cos(th)
    for (let t = 0; t < triCount; t++) {
      const ia = idx[t * 3], ib = idx[t * 3 + 1], ic = idx[t * 3 + 2]
      const ys = (pos[ia * 3 + 1] + pos[ib * 3 + 1] + pos[ic * 3 + 1]) / 3
      if (ys > -0.6 || ys < -1.42) continue
      const v = [ia, ib, ic]
      const d = v.map((i) => pos[i * 3] * nx + pos[i * 3 + 2] * nz)
      const hits: number[][] = []
      const hn: number[][] = []
      for (let e = 0; e < 3; e++) {
        const i = v[e], j = v[(e + 1) % 3]
        const di = d[e], dj = d[(e + 1) % 3]
        if ((di > 0) === (dj > 0)) continue
        const u = di / (di - dj)
        hits.push([0, 1, 2].map((q) => pos[i * 3 + q] + (pos[j * 3 + q] - pos[i * 3 + q]) * u))
        hn.push([0, 1, 2].map((q) => nrm[i * 3 + q] + (nrm[j * 3 + q] - nrm[i * 3 + q]) * u))
      }
      if (hits.length !== 2) continue
      const mx = (hits[0][0] + hits[1][0]) / 2, mz = (hits[0][2] + hits[1][2]) / 2
      if (mx * dx + mz * dz <= 0) continue
      const tA = clamp((-0.6 - hits[0][1]) / 0.9, 0, 1)
      const tB = clamp((-0.6 - hits[1][1]) / 0.9, 0, 1)
      addSeg(hits[0], hits[1], hn[0], hn[1], tA, tB, FACE_KIND.strand)
    }
  }

  // Contours: horizontal slices across the head, like a 3D scan. They are
  // what lets the eye read the skull, brow and cheeks as volume.
  for (let cy = -0.6; cy <= 0.53; cy += 0.028) {
    for (let t = 0; t < triCount; t++) {
      const v = [idx[t * 3], idx[t * 3 + 1], idx[t * 3 + 2]]
      const ys = v.map((i) => pos[i * 3 + 1] - cy)
      if ((ys[0] > 0 && ys[1] > 0 && ys[2] > 0) || (ys[0] < 0 && ys[1] < 0 && ys[2] < 0)) continue
      const hits: number[][] = []
      const hn: number[][] = []
      for (let e = 0; e < 3; e++) {
        const i = v[e], j = v[(e + 1) % 3]
        const di = ys[e], dj = ys[(e + 1) % 3]
        if ((di > 0) === (dj > 0)) continue
        const u = di / (di - dj)
        hits.push([0, 1, 2].map((q) => pos[i * 3 + q] + (pos[j * 3 + q] - pos[i * 3 + q]) * u))
        hn.push([0, 1, 2].map((q) => nrm[i * 3 + q] + (nrm[j * 3 + q] - nrm[i * 3 + q]) * u))
      }
      if (hits.length !== 2) continue
      if (underMask(hits[0][0], hits[0][1], hits[0][2], hn[0][2]) || underMask(hits[1][0], hits[1][1], hits[1][2], hn[1][2])) continue
      const tt = (0.55 - cy) / 1.15
      addSeg(hits[0], hits[1], hn[0], hn[1], tt, tt, FACE_KIND.contour)
    }
  }

  // Mask: edges, centre seam and woven lines across it.
  const maskPoint = (x: number, y: number) => {
    const z = mask.sample(x, y)
    return isFinite(z) && mask.inside(x, y) ? [x, y, z + 0.002] : null
  }
  const maskPolyline = (f: (u: number) => [number, number], steps: number, kind: number, t0: number, t1: number) => {
    let prev: number[] | null = null
    let prevN: number[] | null = null
    for (let i = 0; i <= steps; i++) {
      const u = i / steps
      const [x, y] = f(u)
      const p = maskPoint(x, y)
      const n = p ? mask.normal(x, y) : null
      if (p && prev && n && prevN) addSeg(prev, p, prevN, n, t0 + (t1 - t0) * ((i - 1) / steps), t0 + (t1 - t0) * u, kind)
      prev = p
      prevN = n
    }
  }
  const span = MASK_HALF_WIDTH - 0.004
  maskPolyline((u) => [-span + 2 * span * u, maskTop(-span + 2 * span * u) - 0.004], 120, FACE_KIND.maskEdge, 0.2, 0.5)
  maskPolyline((u) => [-span + 2 * span * u, maskBottom(-span + 2 * span * u) + 0.004], 120, FACE_KIND.maskEdge, 0.5, 0.8)
  maskPolyline((u) => [0, maskTop(0) - 0.004 - u * (maskTop(0) - maskBottom(0) - 0.008)], 60, FACE_KIND.mask, 0.3, 0.7)
  for (let k = 1; k <= 10; k++) {
    const v = k / 11
    const ph = rand() * 6.28
    maskPolyline(
      (u) => {
        const x = -span + 2 * span * u
        return [x, maskTop(x) + (maskBottom(x) - maskTop(x)) * v + Math.sin(x * 16 + ph) * 0.005]
      },
      100,
      FACE_KIND.mask,
      0.25 + v * 0.5,
      0.3 + v * 0.5,
    )
  }

  // Straps: from the mask's sides back to the ears, riding just above the skin.
  for (const side of [-1, 1]) {
    let prev: number[] | null = null
    let prevN: number[] | null = null
    for (let i = 0; i <= 24; i++) {
      const u = i / 24
      const target = [side * (0.39 + u * 0.06), -0.26 + u * 0.1, 0.2 - u * 0.17]
      let best = 0, bd = Infinity
      for (let v = 0; v < pos.length; v += 3) {
        const d = (pos[v] - target[0]) ** 2 + (pos[v + 1] - target[1]) ** 2 + (pos[v + 2] - target[2]) ** 2
        if (d < bd) { bd = d; best = v }
      }
      const n = [nrm[best], nrm[best + 1], nrm[best + 2]]
      const p = [pos[best] + n[0] * 0.014, pos[best + 1] + n[1] * 0.014, pos[best + 2] + n[2] * 0.014]
      if (prev && prevN) addSeg(prev, p, prevN, n, 0.4 + u * 0.2, 0.4 + u * 0.2, FACE_KIND.mask)
      prev = p
      prevN = n
    }
  }

  // ── Particles riding the traces, each kind within its own budget ──
  const budget: Record<number, number> = {
    [FACE_KIND.feature]: Math.round(total * 0.05),
    [FACE_KIND.strand]: Math.round(total * 0.12),
    [FACE_KIND.mask]: Math.round(total * 0.06),
  }
  const segCount = seg.length / 6
  for (const kind of [FACE_KIND.feature, FACE_KIND.strand, FACE_KIND.mask]) {
    const list: number[] = []
    for (let s = 0; s < segCount; s++) {
      const k = segK[s * 2]
      if (k === kind || (kind === FACE_KIND.mask && k === FACE_KIND.maskEdge)) list.push(s)
    }
    if (!list.length) continue
    for (let n = 0; n < budget[kind]; n++) {
      const s = list[Math.floor(rand() * list.length)]
      const u = rand()
      const o = s * 6
      push(
        seg[o] + (seg[o + 3] - seg[o]) * u, seg[o + 1] + (seg[o + 4] - seg[o + 1]) * u, seg[o + 2] + (seg[o + 5] - seg[o + 2]) * u,
        segN[o] + (segN[o + 3] - segN[o]) * u, segN[o + 1] + (segN[o + 4] - segN[o + 1]) * u, segN[o + 2] + (segN[o + 5] - segN[o + 2]) * u,
        kind,
        segK[s * 2] === FACE_KIND.maskEdge ? 1 : 0.8,
      )
    }
  }

  // ── Mask surface ──
  const maskCount = Math.round(total * 0.11)
  for (let made = 0, guard = 0; made < maskCount && guard < maskCount * 30; guard++) {
    const x = (rand() * 2 - 1) * MASK_HALF_WIDTH
    const y = -0.63 + rand() * 0.53
    if (!mask.inside(x, y)) continue
    const n = mask.normal(x, y)
    // Uniform over the surface, not over the picture plane.
    if (rand() * 1.0 > n[2] ** -1 / 3) continue
    push(x, y, mask.sample(x, y), n[0], n[1], n[2], FACE_KIND.mask, 0.45 + rand() * 0.35)
    made++
  }

  // ── Skin: area- and importance-weighted samples of the scan ──
  const cdf = new Float64Array(triCount)
  let acc = 0
  for (let t = 0; t < triCount; t++) {
    const a = idx[t * 3] * 3, b = idx[t * 3 + 1] * 3, c = idx[t * 3 + 2] * 3
    const cx = (pos[a] + pos[b] + pos[c]) / 3
    const cy = (pos[a + 1] + pos[b + 1] + pos[c + 1]) / 3
    const cz = (pos[a + 2] + pos[b + 2] + pos[c + 2]) / 3
    acc += area[t] * (importance(cx, cy, cz) + crease[t] * 2.5)
    cdf[t] = acc
  }
  const dustCount = Math.round(total * 0.03)
  const skinCount = Math.max(0, total - K.length - dustCount)
  for (let made = 0, guard = 0; made < skinCount + dustCount && guard < (skinCount + dustCount) * 4; guard++) {
    const r = rand() * acc
    let lo = 0, hi = triCount - 1
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (cdf[mid] < r) lo = mid + 1
      else hi = mid
    }
    const t = lo
    let u = rand(), v = rand()
    if (u + v > 1) { u = 1 - u; v = 1 - v }
    const wa = 1 - u - v
    const a = idx[t * 3] * 3, b = idx[t * 3 + 1] * 3, c = idx[t * 3 + 2] * 3
    const x = pos[a] * wa + pos[b] * u + pos[c] * v
    const y = pos[a + 1] * wa + pos[b + 1] * u + pos[c + 1] * v
    const z = pos[a + 2] * wa + pos[b + 2] * u + pos[c + 2] * v
    let nx = nrm[a] * wa + nrm[b] * u + nrm[c] * v
    let ny = nrm[a + 1] * wa + nrm[b + 1] * u + nrm[c + 1] * v
    let nz = nrm[a + 2] * wa + nrm[b + 2] * u + nrm[c + 2] * v
    const l = Math.hypot(nx, ny, nz) || 1
    nx /= l; ny /= l; nz /= l
    if (y < -1.55 || underMask(x, y, z, nz)) continue
    if (made < skinCount) {
      const eye = gauss(Math.hypot(Math.abs(x) - 0.17, y + 0.05), 0.045) * smoothstep(0.38, 0.5, z)
      push(x, y, z, nx, ny, nz, eye > 0.5 ? FACE_KIND.feature : FACE_KIND.skin, clamp(importance(x, y, z) / 1.6 + crease[t], 0, 1))
    } else {
      // Dust leaves the silhouette: only where the surface turns away from us.
      if (Math.abs(nz) > 0.45 || y < -0.9) continue
      const off = 0.02 + Math.pow(rand(), 2) * 0.2
      push(x + nx * off, y + ny * off, z + nz * off, nx, ny, nz, FACE_KIND.dust, 0.3 + rand() * 0.4)
    }
    made++
  }

  // Exactly `total` particles.
  const count = K.length
  const out: HeadCloud = {
    position: new Float32Array(total * 3),
    normal: new Float32Array(total * 3),
    kind: new Float32Array(total),
    weight: new Float32Array(total),
    traceSegments: Float32Array.from(seg),
    traceT: Float32Array.from(segT),
    traceKind: Float32Array.from(segK),
    traceNormal: Float32Array.from(segN),
  }
  for (let i = 0; i < total; i++) {
    const src = i < count ? i : Math.floor(rand() * count)
    out.position.set(P.slice(src * 3, src * 3 + 3), i * 3)
    out.normal.set(N.slice(src * 3, src * 3 + 3), i * 3)
    out.kind[i] = i < count ? K[src] : FACE_KIND.dust
    out.weight[i] = i < count ? W[src] : 0.2
  }
  return out
}
