import * as THREE from 'three'

/**
 * Screen-space ribbon lines. WebGL lines are always 1px, which is too thin
 * to carry light; these are quads expanded in the vertex shader so a line
 * keeps a constant pixel width (with a soft glowing profile) at any angle.
 *
 * Attributes: position, aPrev, aNext, aSide (±1), aT (0..1 along the line),
 * aId (line index).
 */
export function createRibbonGeometry(lines: THREE.Vector3[][], closed = false) {
  const pos: number[] = []
  const prev: number[] = []
  const next: number[] = []
  const side: number[] = []
  const ts: number[] = []
  const ids: number[] = []
  const index: number[] = []
  let base = 0

  lines.forEach((loop, id) => {
    // A closed line repeats its first point at the end; neighbours wrap.
    const m = loop.length
    const pts = closed ? [...loop, loop[0]] : loop
    const n = pts.length
    for (let i = 0; i < n; i++) {
      const p = pts[i]
      const a = closed ? loop[(i - 1 + m) % m] : pts[Math.max(0, i - 1)]
      const b = closed ? loop[(i + 1) % m] : pts[Math.min(n - 1, i + 1)]
      const t = i / (n - 1)
      for (const s of [-1, 1]) {
        pos.push(p.x, p.y, p.z)
        prev.push(a.x, a.y, a.z)
        next.push(b.x, b.y, b.z)
        side.push(s)
        ts.push(t)
        ids.push(id)
      }
      if (i < n - 1) {
        const v = base + i * 2
        index.push(v, v + 1, v + 2, v + 1, v + 3, v + 2)
      }
    }
    base += n * 2
  })

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.setAttribute('aPrev', new THREE.Float32BufferAttribute(prev, 3))
  geo.setAttribute('aNext', new THREE.Float32BufferAttribute(next, 3))
  geo.setAttribute('aSide', new THREE.Float32BufferAttribute(side, 1))
  geo.setAttribute('aT', new THREE.Float32BufferAttribute(ts, 1))
  geo.setAttribute('aId', new THREE.Float32BufferAttribute(ids, 1))
  geo.setIndex(index)
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 3)
  return geo
}

/** Vertex shader for ribbons. Fragment shaders receive vT, vId, vSide, vDepth, vView. */
export const ribbonVertex = /* glsl */ `
  uniform vec2 uResolution;
  uniform float uWidth;
  // Optional (0 when unset): each line turns about uSwirlAxis at its own pace,
  // and lines behind the centre draw wider and softer (depth of field).
  uniform float uSwirl;
  uniform vec3 uSwirlAxis;
  uniform float uDof;
  attribute vec3 aPrev;
  attribute vec3 aNext;
  attribute float aSide;
  attribute float aT;
  attribute float aId;
  varying float vT;
  varying float vId;
  varying float vSide;
  varying float vDepth;
  varying vec2 vView;

  vec3 swirl(vec3 p) {
    float ang = uSwirl * (0.55 + 0.9 * fract(aId * 0.618 + 0.21));
    float c = cos(ang), s = sin(ang);
    return p * c + cross(uSwirlAxis, p) * s + uSwirlAxis * dot(uSwirlAxis, p) * (1.0 - c);
  }

  void main() {
    vec3 P = swirl(position);
    mat4 mvp = projectionMatrix * modelViewMatrix;
    vec4 c = mvp * vec4(P, 1.0);
    vec4 a = mvp * vec4(swirl(aPrev), 1.0);
    vec4 b = mvp * vec4(swirl(aNext), 1.0);
    float aspect = uResolution.x / uResolution.y;
    vec2 sa = a.xy / a.w * vec2(aspect, 1.0);
    vec2 sb = b.xy / b.w * vec2(aspect, 1.0);
    vec2 dir = sb - sa;
    dir = length(dir) < 1e-6 ? vec2(1.0, 0.0) : normalize(dir);
    vec2 normal = vec2(-dir.y, dir.x);
    normal.x /= aspect;
    vec4 mv = modelViewMatrix * vec4(P, 1.0);
    vec4 centre = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    vDepth = mv.z - centre.z;
    float width = uWidth * (1.0 + uDof * smoothstep(0.2, -0.6, vDepth));
    c.xy += normal * aSide * width / uResolution.y * c.w;
    gl_Position = c;

    vView = mv.xy - centre.xy;
    vT = aT;
    vId = aId;
    vSide = aSide;
  }
`

/** Soft line profile: a bright hairline core inside a wider glow. */
export const ribbonProfile = /* glsl */ `
  float ribbonProfile(float side) {
    float d = abs(side);
    float core = smoothstep(0.28, 0.0, d);
    float glow = pow(1.0 - d, 2.2) * 0.5;
    return core + glow;
  }
`
