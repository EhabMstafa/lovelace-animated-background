import * as THREE from 'three'

/** Deterministic PRNG so the Orb looks identical on every load. */
export function mulberry32(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function randomDir(rand: () => number, out = new THREE.Vector3()) {
  const u = rand() * 2 - 1
  const phi = rand() * Math.PI * 2
  const s = Math.sqrt(1 - u * u)
  return out.set(s * Math.cos(phi), u, s * Math.sin(phi))
}

export interface ParticleCounts {
  shell: number
  inner: number
  halo: number
}

export const PARTICLE_KIND = { shell: 0, inner: 1, halo: 2 } as const

/**
 * One geometry, three populations distinguished by `aKind`:
 *  - shell:  the field's boundary, gathered in uneven patches (not an even skin)
 *  - inner:  the volume: a diffuse core near the centre, particles that follow
 *            the field filaments (aLine = which filament), and a few loose
 *            clusters with empty space between them
 *  - halo:   a few motes just outside, only seen while listening
 * Brightness tiers (faint / medium / bright) come from aSeed.w in the shader.
 */
export function createOrbParticles(counts: ParticleCounts, streams: THREE.Vector3[][] = [], seed = 7) {
  const rand = mulberry32(seed)
  const total = counts.shell + counts.inner + counts.halo
  const position = new Float32Array(total * 3)
  const seeds = new Float32Array(total * 4)
  const kind = new Float32Array(total)
  const axis = new Float32Array(total * 3)
  const line = new Float32Array(total).fill(-1)
  const dir = new THREE.Vector3()
  const ax = new THREE.Vector3()

  let i = 0
  const put = (k: number, p: THREE.Vector3, l = -1) => {
    position.set([p.x, p.y, p.z], i * 3)
    seeds.set([rand(), rand(), rand(), rand()], i * 4)
    kind[i] = k
    line[i] = l
    randomDir(rand, ax)
    axis.set([ax.x, ax.y, ax.z], i * 3)
    i++
  }
  const gauss = () => (rand() + rand() + rand() - 1.5) / 1.5

  // Boundary: denser in a few patches, sparse between them.
  const patches = Array.from({ length: 7 }, () => randomDir(rand, new THREE.Vector3()))
  for (let n = 0; n < counts.shell; ) {
    randomDir(rand, dir)
    const near = Math.max(...patches.map((c) => Math.exp(-(dir.angleTo(c) ** 2) / 0.35)))
    if (rand() > 0.3 + 0.7 * near) continue
    put(PARTICLE_KIND.shell, dir.multiplyScalar(1 + gauss() * 0.018))
    n++
  }

  // Volume: a core (~30%), the filaments (~40%, if any), loose clusters (the rest).
  const clusters = Array.from({ length: 6 }, () => randomDir(rand, new THREE.Vector3()).multiplyScalar(0.35 + rand() * 0.45))
  const nCore = Math.round(counts.inner * 0.3)
  const nLine = streams.length ? Math.round(counts.inner * 0.4) : 0
  for (let n = 0; n < counts.inner; n++) {
    if (n < nCore) {
      // Irregular: two overlapping lobes rather than one ball.
      const lobe = rand() < 0.6 ? new THREE.Vector3(-0.04, -0.02, 0.03) : new THREE.Vector3(0.06, 0.05, -0.04)
      put(PARTICLE_KIND.inner, randomDir(rand, dir).multiplyScalar(0.03 + 0.17 * Math.pow(rand(), 1.4)).add(lobe))
    } else if (n < nCore + nLine) {
      const l = (n - nCore) % streams.length
      const pts = streams[l]
      const p = pts[Math.floor(rand() * pts.length)].clone()
      put(PARTICLE_KIND.inner, p.add(randomDir(rand, dir).multiplyScalar(0.035 * rand())), l)
    } else {
      const c = clusters[Math.floor(rand() * clusters.length)]
      put(PARTICLE_KIND.inner, randomDir(rand, dir).multiplyScalar(0.05 + 0.13 * rand()).add(c))
    }
  }
  for (let n = 0; n < counts.halo; n++) put(PARTICLE_KIND.halo, randomDir(rand, dir).multiplyScalar(1.06 + Math.pow(rand(), 1.5) * 0.42))

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(position, 3))
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4))
  geo.setAttribute('aKind', new THREE.BufferAttribute(kind, 1))
  geo.setAttribute('aAxis', new THREE.BufferAttribute(axis, 3))
  geo.setAttribute('aLine', new THREE.BufferAttribute(line, 1))
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 3)
  return geo
}

/**
 * The core's quiet network: a few dim points close to the centre and the
 * short curved links between them (links come and go in the shader).
 */
export function createCoreNetwork(seed = 13) {
  const rand = mulberry32(seed)
  const nodes = [
    new THREE.Vector3(-0.1, 0.04, 0.06),
    new THREE.Vector3(0.05, 0.12, -0.05),
    new THREE.Vector3(0.13, -0.03, 0.04),
    new THREE.Vector3(-0.02, -0.12, -0.03),
    new THREE.Vector3(-0.15, -0.08, -0.08),
  ]
  const pairs = [[0, 1], [1, 2], [2, 3], [3, 0], [0, 4], [4, 3]]
  const links = pairs.map(([a, b]) => {
    const A = nodes[a], B = nodes[b]
    const mid = A.clone().add(B).multiplyScalar(0.5).add(randomDir(rand, new THREE.Vector3()).multiplyScalar(0.05))
    const curve = new THREE.QuadraticBezierCurve3(A, mid, B)
    return curve.getPoints(24)
  })
  const pos = new Float32Array(nodes.length * 3)
  const s = new Float32Array(nodes.length)
  nodes.forEach((n, k) => {
    pos.set([n.x, n.y, n.z], k * 3)
    s[k] = rand()
  })
  const points = new THREE.BufferGeometry()
  points.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  points.setAttribute('aSeed', new THREE.BufferAttribute(s, 1))
  points.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1)
  return { points, links }
}

export interface FlowArc {
  /** Orientation of the arc's own frame (Euler, radians), so no two arcs are parallel. */
  frame: [number, number, number]
  /** Start longitude and sweep (radians). */
  lon: number
  sweep: number
  /** Base latitude and the amplitude of its slow meander (radians). */
  lat: number
  wave: number
  /** Radius at the ends (near the boundary) and at the middle (deep in the volume). */
  rEnd: number
  rMid: number
}

/** The shared field axis the filaments turn about. */
export const FIELD_AXIS = new THREE.Vector3(0.38, 1, 0.22).normalize()

/**
 * Field filaments: a few single curved paths that follow the sphere, enter
 * near the boundary, dive through the volume and come back out, meandering a
 * little like lines of a field. Each has its own frame, so they cross in
 * depth instead of running parallel.
 */
export function createFlowArcs(arcs: FlowArc[], segments = 140) {
  const e = new THREE.Euler()
  const q = new THREE.Quaternion()
  return arcs.map(({ frame, lon, sweep, lat, wave, rEnd, rMid }) => {
    q.setFromEuler(e.set(frame[0], frame[1], frame[2]))
    const pts: THREE.Vector3[] = []
    for (let s = 0; s <= segments; s++) {
      const t = s / segments
      const lo = lon + sweep * t
      const la = lat + wave * Math.sin(t * Math.PI * 1.4 + lon)
      const r = rEnd + (rMid - rEnd) * Math.sin(t * Math.PI) ** 1.5
      pts.push(new THREE.Vector3(Math.cos(la) * Math.cos(lo), Math.sin(la), Math.cos(la) * Math.sin(lo)).multiplyScalar(r).applyQuaternion(q))
    }
    return pts
  })
}

/** A closed ellipse in the XY plane, as a point list. */
export function ellipsePoints(rx: number, ry: number, segments = 200) {
  const pts: THREE.Vector3[] = []
  for (let s = 0; s < segments; s++) {
    const a = (s / segments) * Math.PI * 2
    pts.push(new THREE.Vector3(Math.cos(a) * rx, Math.sin(a) * ry, 0))
  }
  return pts
}

/** A few active points of light at different depths inside the volume. */
export function createStarNodes(count: number, seed: number) {
  const rand = mulberry32(seed)
  const pos = new Float32Array(count * 3)
  const s = new Float32Array(count)
  const v = new THREE.Vector3()
  for (let i = 0; i < count; i++) {
    randomDir(rand, v).multiplyScalar(0.3 + rand() * 0.62)
    pos.set([v.x, v.y, v.z], i * 3)
    s[i] = rand()
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  geo.setAttribute('aSeed', new THREE.BufferAttribute(s, 1))
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 2)
  return geo
}
