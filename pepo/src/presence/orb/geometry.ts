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
 *  - shell:  the field's boundary, where most of the light lives
 *  - inner:  the volume, and a diffuse core (about 40% of them, gathered
 *            near the centre) that suggests something lives inside
 *  - halo:   a few motes just outside, which drift inward while listening
 * Brightness tiers (faint / medium / bright) come from aSeed.w in the shader.
 */
export function createOrbParticles(counts: ParticleCounts, seed = 7) {
  const rand = mulberry32(seed)
  const total = counts.shell + counts.inner + counts.halo
  const position = new Float32Array(total * 3)
  const seeds = new Float32Array(total * 4)
  const kind = new Float32Array(total)
  const axis = new Float32Array(total * 3)
  const dir = new THREE.Vector3()
  const ax = new THREE.Vector3()

  let i = 0
  const push = (k: number, r: number) => {
    randomDir(rand, dir).multiplyScalar(r)
    position.set([dir.x, dir.y, dir.z], i * 3)
    seeds.set([rand(), rand(), rand(), rand()], i * 4)
    kind[i] = k
    randomDir(rand, ax)
    axis.set([ax.x, ax.y, ax.z], i * 3)
    i++
  }

  for (let n = 0; n < counts.shell; n++) {
    // Gaussian-ish thickness keeps the skin crisp but not perfectly thin.
    const g = (rand() + rand() + rand() - 1.5) / 1.5
    push(PARTICLE_KIND.shell, 1 + g * 0.018)
  }
  for (let n = 0; n < counts.inner; n++) {
    const core = rand() < 0.4
    push(PARTICLE_KIND.inner, core ? 0.04 + 0.32 * Math.pow(rand(), 1.6) : 0.3 + 0.62 * Math.pow(rand(), 0.8))
  }
  for (let n = 0; n < counts.halo; n++) push(PARTICLE_KIND.halo, 1.06 + Math.pow(rand(), 1.5) * 0.42)

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(position, 3))
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4))
  geo.setAttribute('aKind', new THREE.BufferAttribute(kind, 1))
  geo.setAttribute('aAxis', new THREE.BufferAttribute(axis, 3))
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 3)
  return geo
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
