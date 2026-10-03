import { mulberry32 } from '../orb/geometry'

/**
 * PEPO's head, sculpted as a signed distance field and sampled into a point
 * cloud. No mesh assets: the shape is a handful of smoothly blended
 * primitives (cranium, face, jaw, brow, eyes, nose, ears, neck, shoulders)
 * plus a separate mask shell that covers the nose, mouth and chin.
 *
 * Units: the head is about one unit tall, y up, the face looks down +z.
 */

type V3 = [number, number, number]

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))
const smoothstep = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a), 0, 1)
  return t * t * (3 - 2 * t)
}
const gauss = (d: number, s: number) => Math.exp(-(d * d) / (s * s))

function smin(a: number, b: number, k: number) {
  const h = Math.max(k - Math.abs(a - b), 0) / k
  return Math.min(a, b) - h * h * k * 0.25
}
const smax = (a: number, b: number, k: number) => -smin(-a, -b, k)

function ell(x: number, y: number, z: number, cx: number, cy: number, cz: number, rx: number, ry: number, rz: number) {
  const px = x - cx, py = y - cy, pz = z - cz
  const k0 = Math.sqrt((px / rx) ** 2 + (py / ry) ** 2 + (pz / rz) ** 2)
  const k1 = Math.sqrt((px / (rx * rx)) ** 2 + (py / (ry * ry)) ** 2 + (pz / (rz * rz)) ** 2)
  return k1 === 0 ? -Math.min(rx, ry, rz) : (k0 * (k0 - 1)) / k1
}
const sphere = (x: number, y: number, z: number, cx: number, cy: number, cz: number, r: number) =>
  Math.hypot(x - cx, y - cy, z - cz) - r

function capsule(x: number, y: number, z: number, a: V3, b: V3, r: number) {
  const pax = x - a[0], pay = y - a[1], paz = z - a[2]
  const bax = b[0] - a[0], bay = b[1] - a[1], baz = b[2] - a[2]
  const h = clamp((pax * bax + pay * bay + paz * baz) / (bax * bax + bay * bay + baz * baz), 0, 1)
  return Math.hypot(pax - bax * h, pay - bay * h, paz - baz * h) - r
}

export function headSDF(x: number, y: number, z: number) {
  const ax = Math.abs(x)
  let d = ell(x, y, z, 0, 0.13, -0.03, 0.355, 0.43, 0.41) // cranium
  d = smin(d, ell(x, y, z, 0, -0.12, 0.07, 0.29, 0.36, 0.32), 0.15) // face
  d = smin(d, ell(x, y, z, 0, -0.33, 0.07, 0.24, 0.17, 0.26), 0.1) // jaw
  d = smin(d, ell(x, y, z, 0, -0.44, 0.17, 0.12, 0.08, 0.1), 0.08) // chin
  d = smin(d, ell(ax, y, z, 0.19, -0.06, 0.16, 0.1, 0.075, 0.12), 0.06) // cheekbones
  d = smin(d, ell(x, y, z, 0, 0.11, 0.27, 0.25, 0.055, 0.09), 0.05) // brow ridge
  d = smax(d, -sphere(ax, y, z, 0.115, 0.035, 0.355, 0.062), 0.04) // eye sockets
  d = smin(d, sphere(ax, y, z, 0.115, 0.03, 0.287, 0.048), 0.012) // eyes
  d = smin(d, capsule(x, y, z, [0, 0.07, 0.35], [0, -0.11, 0.43], 0.03), 0.04) // nose
  d = smin(d, sphere(x, y, z, 0, -0.12, 0.42, 0.045), 0.04)
  d = smin(d, ell(ax, y, z, 0.355, -0.01, -0.03, 0.035, 0.1, 0.065), 0.03) // ears
  let body = capsule(x, y, z, [0, -0.38, -0.05], [0, -0.95, -0.06], 0.145) // neck
  body = smin(body, capsule(x, y, z, [-0.62, -0.99, -0.08], [0.62, -0.99, -0.08], 0.15), 0.3) // trapezius
  body = smin(body, ell(x, y, z, 0, -1.22, 0, 0.72, 0.3, 0.26), 0.2) // chest
  body = smin(body, sphere(ax, y, z, 0.66, -1.06, -0.05, 0.17), 0.15) // shoulders
  return smin(d, body, 0.1)
}

/** The mask: a smooth shell standing slightly off the face, with a nose ridge. */
export function maskSDF(x: number, y: number, z: number) {
  const d = ell(x, y, z, 0, -0.2, 0.01, 0.3, 0.31, 0.465)
  return smin(d, capsule(x, y, z, [0, -0.02, 0.4], [0, -0.13, 0.468], 0.04), 0.08)
}

const maskTop = (x: number) => -0.04 - 0.05 * (x / 0.3) ** 2
const maskBottom = (x: number) => -0.55 + 0.3 * Math.min(1, Math.abs(x) / 0.3) ** 1.6
const inMaskRegion = (x: number, y: number, z: number) => z > 0.04 && y < maskTop(x) && y > maskBottom(x)

type SDF = (x: number, y: number, z: number) => number

export function gradient(f: SDF, x: number, y: number, z: number): V3 {
  const e = 1e-3
  const gx = f(x + e, y, z) - f(x - e, y, z)
  const gy = f(x, y + e, z) - f(x, y - e, z)
  const gz = f(x, y, z + e) - f(x, y, z - e)
  const l = Math.hypot(gx, gy, gz) || 1
  return [gx / l, gy / l, gz / l]
}

/** Pull a point onto the zero surface of `f`. */
function project(f: SDF, p: V3, iterations = 6): V3 | null {
  let [x, y, z] = p
  for (let i = 0; i < iterations; i++) {
    const d = f(x, y, z)
    const g = gradient(f, x, y, z)
    x -= d * g[0]
    y -= d * g[1]
    z -= d * g[2]
  }
  return Math.abs(f(x, y, z)) < 0.004 ? [x, y, z] : null
}

/** March along a ray until it meets the surface. */
function raycast(f: SDF, o: V3, dir: V3, maxT = 1.6): V3 | null {
  let t = 0
  for (let i = 0; i < 96 && t < maxT; i++) {
    const p: V3 = [o[0] + dir[0] * t, o[1] + dir[1] * t, o[2] + dir[2] * t]
    const d = f(p[0], p[1], p[2])
    if (d < 0.0008) return p
    t += Math.max(d * 0.9, 0.002)
  }
  return null
}

/** Feature kinds, used by the shader for colour, brightness and behaviour. */
/** `maskEdge` exists only for traces; its particles are drawn as mask. */
export const FACE_KIND = { skin: 0, mask: 1, feature: 2, strand: 3, dust: 4, maskEdge: 5 } as const

export interface TraceLine {
  points: V3[]
  kind: number
}

export interface HeadCloud {
  count: number
  position: Float32Array
  normal: Float32Array
  kind: Float32Array
  weight: Float32Array
  traces: TraceLine[]
}

/** Importance of a skin point: dense at eyes, nose, cheeks, jaw and neck. */
function skinWeight(x: number, y: number, z: number) {
  const ax = Math.abs(x)
  let w = 0.2 + 0.25 * smoothstep(0, 0.25, z)
  w += 1.3 * gauss(Math.hypot(ax - 0.115, y - 0.035, z - 0.32), 0.075)
  w += 0.6 * gauss(Math.hypot(ax - 0.13, y - 0.115, z - 0.31), 0.06)
  w += 0.9 * gauss(Math.hypot(x, (y - 0.04) * 0.6, z - 0.37), 0.05)
  w += 0.5 * gauss(Math.hypot(ax - 0.21, y + 0.05, z - 0.23), 0.08)
  w += 0.45 * gauss(Math.hypot(ax - 0.2, y + 0.38, z - 0.1), 0.1)
  w += 0.7 * gauss(Math.hypot(ax - 0.37, y + 0.01, z + 0.03), 0.09)
  if (y < -0.4 && y > -0.95) w += 0.35
  if (y < -0.85) w *= 0.25 + 0.75 * (1 - smoothstep(0.45, 0.85, ax))
  if (z < -0.15 && y > -0.4) w *= 0.4
  if (y > 0.38) w *= 0.65
  return w
}

export function buildHeadCloud(total: number, seed = 17): HeadCloud {
  const rand = mulberry32(seed)
  const pts: V3[] = []
  const nrm: V3[] = []
  const kinds: number[] = []
  const weights: number[] = []
  const traces: TraceLine[] = []

  const push = (p: V3, n: V3, kind: number, w: number) => {
    pts.push(p)
    nrm.push(n)
    kinds.push(kind)
    weights.push(w)
  }

  // ── Traces: the linework that gives the cloud its anatomy ──
  const front = (x: number, y: number, f: SDF = headSDF) => raycast(f, [x, y, 0.75], [0, 0, -1])

  const addTrace = (raw: (V3 | null)[], kind: number) => {
    const points = raw.filter((p): p is V3 => p !== null)
    if (points.length > 2) traces.push({ points, kind })
  }

  for (const s of [-1, 1]) {
    // Eyes: quiet, almond-shaped, nearly closed.
    const upper: (V3 | null)[] = []
    const lower: (V3 | null)[] = []
    for (let i = 0; i <= 24; i++) {
      const u = i / 24
      const x = s * (0.065 + u * 0.1)
      const arc = Math.sin(u * Math.PI)
      upper.push(front(x, 0.034 + arc * 0.016 - u * 0.006))
      if (u > 0.15 && u < 0.85) lower.push(front(x, 0.03 - arc * 0.007 - u * 0.004))
    }
    addTrace(upper, FACE_KIND.feature)
    addTrace(lower, FACE_KIND.feature)
    // Brows
    const brow: (V3 | null)[] = []
    for (let i = 0; i <= 24; i++) {
      const u = i / 24
      brow.push(front(s * (0.04 + u * 0.17), 0.1 + Math.sin(u * Math.PI * 0.85) * 0.03 - u * 0.012))
    }
    addTrace(brow, FACE_KIND.feature)
    // Nose bridge, above the mask
    const bridge: (V3 | null)[] = []
    for (let i = 0; i <= 12; i++) {
      const u = i / 12
      bridge.push(front(s * (0.022 + u * 0.012), 0.075 - u * 0.11))
    }
    addTrace(bridge, FACE_KIND.feature)
    // Ears: outer rim and inner fold, cast from the side.
    for (const scale of [1, 0.6]) {
      const ear: (V3 | null)[] = []
      for (let i = 0; i <= 28; i++) {
        const a = -1.9 + (i / 28) * 3.9
        const y = -0.01 + Math.sin(a) * 0.085 * scale
        const z = -0.02 + Math.cos(a) * 0.05 * scale
        ear.push(raycast(headSDF, [s * 0.7, y, z], [-s, 0, 0]))
      }
      addTrace(ear, FACE_KIND.feature)
    }
    // Straps from the mask's edge back to the ears.
    const strap: (V3 | null)[] = []
    for (let i = 0; i <= 16; i++) {
      const u = i / 16
      const p: V3 = [s * (0.28 + u * 0.08), -0.1 + u * 0.08, 0.06 - u * 0.1]
      const q = project(headSDF, p)
      if (q) {
        const g = gradient(headSDF, q[0], q[1], q[2])
        strap.push([q[0] + g[0] * 0.012, q[1] + g[1] * 0.012, q[2] + g[2] * 0.012])
      }
    }
    addTrace(strap, FACE_KIND.mask)
  }

  // Mask outline, centre seam and the woven horizontal strands.
  const maskLine = (fy: (x: number) => number, x0 = -0.295, x1 = 0.295, n = 48) => {
    const line: (V3 | null)[] = []
    for (let i = 0; i <= n; i++) {
      const x = x0 + ((x1 - x0) * i) / n
      line.push(front(x, fy(x), maskSDF))
    }
    return line
  }
  addTrace(maskLine(maskTop), FACE_KIND.maskEdge)
  addTrace(maskLine(maskBottom), FACE_KIND.maskEdge)
  for (let k = 1; k <= 9; k++) {
    const v = k / 10
    const phase = rand() * 6.28
    addTrace(
      maskLine((x) => maskTop(x) + (maskBottom(x) - maskTop(x)) * v + Math.sin(x * 14 + phase) * 0.006, -0.29, 0.29, 40),
      FACE_KIND.mask,
    )
  }
  {
    const seam: (V3 | null)[] = []
    for (let i = 0; i <= 30; i++) seam.push(front(0, maskTop(0) - (i / 30) * (maskTop(0) - maskBottom(0)), maskSDF))
    addTrace(seam, FACE_KIND.mask)
  }

  // Neck and shoulder strands: streamlines flowing down and out over the body.
  const strandCount = 44
  for (let k = 0; k < strandCount; k++) {
    const phi = -1.95 + (k / (strandCount - 1)) * 3.9 + (rand() - 0.5) * 0.05
    let p = project(headSDF, [Math.sin(phi) * 0.16, -0.5 - rand() * 0.05, -0.05 + Math.cos(phi) * 0.16])
    if (!p) continue
    const line: V3[] = [p]
    const side = Math.sign(Math.sin(phi)) || 1
    const sway = (rand() - 0.5) * 0.6
    for (let i = 0; i < 240 && p; i++) {
      const g = gradient(headSDF, p[0], p[1], p[2])
      const out = smoothstep(-0.78, -1.02, p[1]) * (2.2 + sway) * side
      let d: V3 = [out + Math.sin(i * 0.05 + phi * 3) * 0.08, -1, 0]
      const dn = d[0] * g[0] + d[1] * g[1] + d[2] * g[2]
      d = [d[0] - g[0] * dn, d[1] - g[1] * dn, d[2] - g[2] * dn]
      const l = Math.hypot(d[0], d[1], d[2]) || 1
      const next = project(headSDF, [p[0] + (d[0] / l) * 0.012, p[1] + (d[1] / l) * 0.012, p[2] + (d[2] / l) * 0.012], 3)
      // Stop at the bottom, at the edge of the shoulders, or when a strand
      // starts curling back inward or around to the back.
      if (!next || next[1] < -1.2 || Math.abs(next[0]) > 0.86 || next[2] < -0.12) break
      if (i > 20 && (next[0] - p[0]) * side < -0.002) break
      p = next
      line.push(p)
    }
    if (line.length > 8) traces.push({ points: line, kind: FACE_KIND.strand })
  }

  // ── Particles along the traces, each kind within its own budget ──
  const budget: Record<number, number> = {
    [FACE_KIND.feature]: Math.round(total * 0.1),
    [FACE_KIND.strand]: Math.round(total * 0.14),
    [FACE_KIND.mask]: Math.round(total * 0.09),
  }
  for (const kind of [FACE_KIND.feature, FACE_KIND.strand, FACE_KIND.mask]) {
    const candidates: V3[] = []
    for (const t of traces) {
      if (t.kind !== kind && !(kind === FACE_KIND.mask && t.kind === FACE_KIND.maskEdge)) continue
      for (let i = 1; i < t.points.length; i++) {
        const a = t.points[i - 1]
        const b = t.points[i]
        for (let j = 0; j < 4; j++) {
          const u = (j + rand()) / 4
          candidates.push([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u])
        }
      }
    }
    const want = Math.min(budget[kind], candidates.length)
    const f = kind === FACE_KIND.mask ? maskSDF : headSDF
    for (let n = 0; n < want; n++) {
      const p = candidates[Math.floor(rand() * candidates.length)]
      push(p, gradient(f, p[0], p[1], p[2]), kind, kind === FACE_KIND.strand ? 0.8 : 1)
    }
  }

  const traceBudget = pts.length
  const maskCount = Math.round(total * 0.12)
  const dustCount = Math.round(total * 0.04)
  const skinCount = Math.max(0, total - traceBudget - maskCount - dustCount)

  // ── Mask surface ──
  for (let made = 0, guard = 0; made < maskCount && guard < maskCount * 40; guard++) {
    const p = project(maskSDF, [(rand() - 0.5) * 0.62, -0.56 + rand() * 0.54, 0.1 + rand() * 0.4])
    if (!p || !inMaskRegion(p[0], p[1], p[2])) continue
    push(p, gradient(maskSDF, p[0], p[1], p[2]), FACE_KIND.mask, 0.5 + 0.3 * rand())
    made++
  }

  // ── Skin ──
  for (let made = 0, guard = 0; made < skinCount && guard < skinCount * 60; guard++) {
    const p = project(headSDF, [(rand() - 0.5) * 1.8, -1.28 + rand() * 1.9, -0.5 + rand() * 1.05])
    if (!p || p[1] < -1.27) continue
    // Hidden under the mask.
    if (inMaskRegion(p[0], p[1], p[2]) && maskSDF(p[0], p[1], p[2]) < 0.01) continue
    const w = skinWeight(p[0], p[1], p[2])
    if (rand() * 1.6 > w) continue
    push(p, gradient(headSDF, p[0], p[1], p[2]), FACE_KIND.skin, Math.min(1, w))
    made++
  }

  // ── Dust: motes leaving the silhouette ──
  for (let made = 0, guard = 0; made < dustCount && guard < dustCount * 40; guard++) {
    const p = project(headSDF, [(rand() - 0.5) * 1.4, -0.9 + rand() * 1.5, -0.4 + rand() * 0.9])
    if (!p) continue
    const g = gradient(headSDF, p[0], p[1], p[2])
    const off = 0.03 + Math.pow(rand(), 2) * 0.22
    push([p[0] + g[0] * off, p[1] + g[1] * off, p[2] + g[2] * off], g, FACE_KIND.dust, 0.3 + rand() * 0.4)
    made++
  }

  // Trim or pad to exactly `total` points.
  while (pts.length > total) {
    const i = Math.floor(rand() * pts.length)
    pts.splice(i, 1); nrm.splice(i, 1); kinds.splice(i, 1); weights.splice(i, 1)
  }
  while (pts.length < total) {
    const i = Math.floor(rand() * pts.length)
    push([...pts[i]] as V3, nrm[i], FACE_KIND.dust, 0.2)
  }

  const position = new Float32Array(total * 3)
  const normal = new Float32Array(total * 3)
  pts.forEach((p, i) => position.set(p, i * 3))
  nrm.forEach((n, i) => normal.set(n, i * 3))
  return {
    count: total,
    position,
    normal,
    kind: Float32Array.from(kinds),
    weight: Float32Array.from(weights),
    traces,
  }
}
