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
  /** Total particles, including latent ones that only appear in the Avatar. */
  total: number
}

export const PARTICLE_KIND = { shell: 0, inner: 1, halo: 2, latent: 3 } as const

/**
 * One geometry, four populations distinguished by `aKind`:
 *  - shell:  the sphere's skin, where most of the light lives
 *  - inner:  sparse depth particles, revealed while thinking
 *  - halo:   a few drifting motes outside, which react to the voice
 *  - latent: invisible in the Orb; they wake up to help draw the face
 * Avatar targets (`aFace`…) are filled in later by `assignFaceTargets`.
 */
export function createOrbParticles(counts: ParticleCounts, seed = 7) {
  const rand = mulberry32(seed)
  const total = Math.max(counts.total, counts.shell + counts.inner + counts.halo)
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
  for (let n = 0; n < counts.inner; n++) push(PARTICLE_KIND.inner, 0.12 + 0.8 * Math.pow(rand(), 0.7))
  for (let n = 0; n < counts.halo; n++) push(PARTICLE_KIND.halo, 1.12 + Math.pow(rand(), 2.2) * 0.95)
  while (i < total) push(PARTICLE_KIND.latent, 0.3 + 0.7 * Math.pow(rand(), 0.4))

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(position, 3))
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4))
  geo.setAttribute('aKind', new THREE.BufferAttribute(kind, 1))
  geo.setAttribute('aAxis', new THREE.BufferAttribute(axis, 3))
  geo.setAttribute('aFace', new THREE.BufferAttribute(new Float32Array(total * 3), 3))
  geo.setAttribute('aFaceN', new THREE.BufferAttribute(new Float32Array(total * 3), 3))
  geo.setAttribute('aFaceKind', new THREE.BufferAttribute(new Float32Array(total), 1))
  geo.setAttribute('aFaceW', new THREE.BufferAttribute(new Float32Array(total), 1))
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 3)
  return geo
}

export interface FaceData {
  position: Float32Array
  normal: Float32Array
  weight: Float32Array
  warm: Float32Array
}

/**
 * Pair every Orb particle with a point of the Avatar. Both sets are ordered
 * by height, so particles at the top of the Orb become the crown and those
 * at the bottom become the shoulders: the flow between forms reads as one
 * coherent movement instead of a shuffle.
 */
export function assignFaceTargets(geo: THREE.BufferGeometry, face: FaceData) {
  const orbPos = geo.getAttribute('position') as THREE.BufferAttribute
  const seeds = geo.getAttribute('aSeed') as THREE.BufferAttribute
  const n = orbPos.count
  const m = face.weight.length
  const orbOrder = Array.from({ length: n }, (_, i) => i).sort(
    (a, b) => orbPos.getY(a) + seeds.getX(a) * 0.15 - (orbPos.getY(b) + seeds.getX(b) * 0.15),
  )
  const faceOrder = Array.from({ length: m }, (_, i) => i).sort((a, b) => face.position[a * 3 + 1] - face.position[b * 3 + 1])
  const fp = geo.getAttribute('aFace') as THREE.BufferAttribute
  const fn = geo.getAttribute('aFaceN') as THREE.BufferAttribute
  const fk = geo.getAttribute('aFaceKind') as THREE.BufferAttribute
  const fw = geo.getAttribute('aFaceW') as THREE.BufferAttribute
  for (let r = 0; r < n; r++) {
    const o = orbOrder[r]
    const f = faceOrder[Math.min(m - 1, Math.floor((r / n) * m))]
    fp.setXYZ(o, face.position[f * 3], face.position[f * 3 + 1], face.position[f * 3 + 2])
    fn.setXYZ(o, face.normal[f * 3], face.normal[f * 3 + 1], face.normal[f * 3 + 2])
    fk.setX(o, face.warm[f])
    fw.setX(o, face.weight[f])
  }
  for (const a of [fp, fn, fk, fw]) a.needsUpdate = true
}

/**
 * Light streams, organised: a few bands of parallel ribbons sweeping around
 * one shared, tilted axis. Ribbons in a band are evenly spaced and nested in
 * depth, follow the same gentle wave and start and end in a staggered fan,
 * so the light inside the glass reads as calm, ordered currents.
 */
export function createStreams(bands: number, perBand: number, seed: number, rMin: number, rMax: number, segments = 120) {
  const rand = mulberry32(seed)
  const lines: THREE.Vector3[][] = []
  const axis = new THREE.Vector3(0.38, 1, 0.22).normalize()
  const frame = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis)
  for (let b = 0; b < bands; b++) {
    const lat0 = bands === 1 ? 0 : -0.5 + (1.0 * b) / (bands - 1)
    const lon0 = (b / bands) * Math.PI * 2 + rand() * 0.3
    const len = 2.6
    const wave = 0.07
    for (let k = 0; k < perBand; k++) {
      const u = perBand === 1 ? 0.5 : k / (perBand - 1)
      const lat = lat0 + (u - 0.5) * 0.2
      const r = rMin + (rMax - rMin) * u
      const startT = u * 0.12
      const endT = 0.82 + u * 0.12
      const line: THREE.Vector3[] = []
      for (let s = 0; s <= segments; s++) {
        const t = startT + (endT - startT) * (s / segments)
        const lon = lon0 + t * len
        const la = lat + Math.sin(t * Math.PI * 1.2 + b * 1.7) * wave
        const p = new THREE.Vector3(Math.cos(la) * Math.cos(lon), Math.sin(la), Math.cos(la) * Math.sin(lon))
        line.push(p.multiplyScalar(r).applyQuaternion(frame))
      }
      lines.push(line)
    }
  }
  return lines
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

/** Star nodes scattered on (and just under) the Orb's surface. */
export function createStarNodes(count: number, seed: number) {
  const rand = mulberry32(seed)
  const pos = new Float32Array(count * 3)
  const s = new Float32Array(count)
  const v = new THREE.Vector3()
  for (let i = 0; i < count; i++) {
    randomDir(rand, v).multiplyScalar(0.9 + rand() * 0.1)
    pos.set([v.x, v.y, v.z], i * 3)
    s[i] = rand()
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  geo.setAttribute('aSeed', new THREE.BufferAttribute(s, 1))
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 2)
  return geo
}
