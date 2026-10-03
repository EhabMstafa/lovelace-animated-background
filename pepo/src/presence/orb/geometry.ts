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
 *  - shell: the sphere's skin, where most of the light lives
 *  - inner: sparse depth particles, revealed while thinking
 *  - halo:  a few drifting motes outside, which react to the voice
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
    push(PARTICLE_KIND.inner, 0.12 + 0.8 * Math.pow(rand(), 0.7))
  }
  for (let n = 0; n < counts.halo; n++) {
    push(PARTICLE_KIND.halo, 1.12 + Math.pow(rand(), 2.2) * 0.95)
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(position, 3))
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4))
  geo.setAttribute('aKind', new THREE.BufferAttribute(kind, 1))
  geo.setAttribute('aAxis', new THREE.BufferAttribute(axis, 3))
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 2.4)
  return geo
}

/**
 * Light filaments: gently bent arcs hugging a sphere of radius `radius`.
 * Each vertex carries its parametric position `aT` and the curve id `aId`
 * so the shader can run energy pulses along them.
 */
export function createFilaments(count: number, radius: number, seed: number, segments = 72) {
  const rand = mulberry32(seed)
  const verts: number[] = []
  const ts: number[] = []
  const ids: number[] = []
  const indices: number[] = []
  const start = new THREE.Vector3()
  const axis = new THREE.Vector3()
  const bend = new THREE.Vector3()
  const p = new THREE.Vector3()
  const q = new THREE.Quaternion()
  const qb = new THREE.Quaternion()

  for (let c = 0; c < count; c++) {
    randomDir(rand, start)
    randomDir(rand, axis)
    axis.sub(start.clone().multiplyScalar(axis.dot(start))).normalize()
    bend.copy(start)
    const len = 0.9 + rand() * 1.5
    const bendAmt = (rand() - 0.5) * 0.7
    const wobble = rand() * 6.28
    const base = verts.length / 3
    for (let s = 0; s <= segments; s++) {
      const t = s / segments
      q.setFromAxisAngle(axis, t * len)
      qb.setFromAxisAngle(bend, Math.sin(t * Math.PI) * bendAmt)
      p.copy(start).applyQuaternion(q).applyQuaternion(qb)
      p.multiplyScalar(radius * (1 + 0.015 * Math.sin(t * 9 + wobble)))
      verts.push(p.x, p.y, p.z)
      ts.push(t)
      ids.push(c)
      if (s > 0) indices.push(base + s - 1, base + s)
    }
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3))
  geo.setAttribute('aT', new THREE.Float32BufferAttribute(ts, 1))
  geo.setAttribute('aId', new THREE.Float32BufferAttribute(ids, 1))
  geo.setIndex(indices)
  return geo
}

/** A closed ellipse in the XY plane with a parametric `aT` attribute. */
export function createEllipse(rx: number, ry: number, segments = 256) {
  const verts = new Float32Array((segments + 1) * 3)
  const ts = new Float32Array(segments + 1)
  for (let s = 0; s <= segments; s++) {
    const t = s / segments
    const a = t * Math.PI * 2
    verts.set([Math.cos(a) * rx, Math.sin(a) * ry, 0], s * 3)
    ts[s] = t
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(verts, 3))
  geo.setAttribute('aT', new THREE.BufferAttribute(ts, 1))
  return geo
}
