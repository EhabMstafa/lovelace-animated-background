import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { presence, type PresenceState } from '../../core/presence'
import { getPointer } from '../../hooks/usePointer'
import { createEllipse, createFilaments, createOrbParticles, type ParticleCounts } from './geometry'
import { MORPH_TAU, ORB_STATES, PARAM_KEYS, type OrbParams } from './stateParams'
import {
  filamentFragment,
  glowFragment,
  glowVertex,
  lineVertex,
  nodeFragment,
  nodeVertex,
  orbitFragment,
  particleFragment,
  particleVertex,
  skinFragment,
  skinVertex,
} from './shaders'

interface OrbitSpec {
  rx: number
  ry: number
  /** Free-floating orientation (Euler, radians). */
  free: [number, number, number]
  /** Orientation when PEPO is organising its thoughts. */
  aligned: [number, number, number]
  /** Laps per second of the travelling light. */
  speed: number
  /** Precession rate of the orbit plane itself. */
  drift: number
  tint: string
  alpha: number
}

const ORBITS: OrbitSpec[] = [
  { rx: 1.42, ry: 1.42, free: [1.2, 0.15, 0.32], aligned: [1.32, 0, 0.12], speed: 0.034, drift: 0.021, tint: '#4BC8FF', alpha: 0.26 },
  { rx: 1.78, ry: 1.18, free: [1.36, -0.2, -0.55], aligned: [1.32, 0, -0.06], speed: 0.021, drift: -0.013, tint: '#8B5CFF', alpha: 0.2 },
]

const RADIUS = 1

interface OrbProps {
  state: PresenceState
  reducedMotion: boolean
  counts: ParticleCounts
}

const damp = (current: number, target: number, tau: number, dt: number) =>
  current + (target - current) * (1 - Math.exp(-dt / tau))

export function Orb({ state, reducedMotion, counts }: OrbProps) {
  const root = useRef<THREE.Group>(null)
  const spinGroup = useRef<THREE.Group>(null)
  const orbitRefs = useRef<(THREE.Group | null)[]>([])
  const { gl } = useThree()

  const params = useRef<OrbParams>({ ...ORB_STATES.idle })
  const clock = useRef({ t: 0, rot: 0, flow: 0, energy: 0 })

  const particleGeo = useMemo(() => createOrbParticles(counts), [counts])
  const filamentGeo = useMemo(() => createFilaments(7, RADIUS * 1.004, 11), [])
  const innerFilamentGeo = useMemo(() => createFilaments(5, RADIUS * 0.58, 23, 56), [])
  const orbitGeos = useMemo(() => ORBITS.map((o) => createEllipse(o.rx, o.ry)), [])

  const pixelRatio = gl.getPixelRatio()

  const particleMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: particleVertex,
        fragmentShader: particleFragment,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: {
          uTime: { value: 0 },
          uRot: { value: 0 },
          uFlow: { value: 0 },
          uScale: { value: 1 },
          uBreath: { value: 0 },
          uConverge: { value: 0 },
          uDepth: { value: 0 },
          uViolet: { value: 0 },
          uListen: { value: 0 },
          uSpeak: { value: 0 },
          uEnergy: { value: 0 },
          uGlow: { value: 1 },
          uSize: { value: 2.3 },
          uPixelRatio: { value: pixelRatio },
        },
      }),
    [pixelRatio],
  )

  const makeFilamentMat = (tint: string) =>
    new THREE.ShaderMaterial({
      vertexShader: lineVertex,
      fragmentShader: filamentFragment,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uAlpha: { value: 0.04 },
        uPulse: { value: 0.2 },
        uViolet: { value: 0 },
        uTint: { value: new THREE.Color(tint) },
      },
    })
  const filamentMat = useMemo(() => makeFilamentMat('#4BC8FF'), [])
  const innerFilamentMat = useMemo(() => makeFilamentMat('#8B5CFF'), [])

  const orbitMats = useMemo(
    () =>
      ORBITS.map(
        (o) =>
          new THREE.ShaderMaterial({
            vertexShader: lineVertex,
            fragmentShader: orbitFragment,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            uniforms: {
              uHead: { value: Math.random() },
              uAlpha: { value: o.alpha },
              uViolet: { value: 0 },
              uTint: { value: new THREE.Color(o.tint) },
            },
          }),
      ),
    [],
  )

  const nodeMats = useMemo(
    () =>
      ORBITS.map(
        (o, i) =>
          new THREE.ShaderMaterial({
            vertexShader: nodeVertex,
            fragmentShader: nodeFragment,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            uniforms: {
              uHead: orbitMats[i].uniforms.uHead,
              uRx: { value: o.rx },
              uRy: { value: o.ry },
              uSize: { value: 9 },
              uPixelRatio: { value: pixelRatio },
              uTint: { value: new THREE.Color(o.tint) },
              uAlpha: { value: 0.85 },
            },
          }),
      ),
    [orbitMats, pixelRatio],
  )
  // THREE.Line is created imperatively: the <line> JSX tag collides with SVG's.
  const orbitLines = useMemo(
    () =>
      orbitGeos.map((g, i) => {
        const line = new THREE.Line(g, orbitMats[i])
        line.frustumCulled = false
        return line
      }),
    [orbitGeos, orbitMats],
  )

  const nodeGeo = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3), 3))
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 2.5)
    return g
  }, [])

  const skinMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: skinVertex,
        fragmentShader: skinFragment,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: {
          uGlow: { value: 1 },
          uViolet: { value: 0 },
          uSpeak: { value: 0 },
          uDepth: { value: 0 },
        },
      }),
    [],
  )

  const GLOW_SIZE = 4.6
  const glowMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: glowVertex,
        fragmentShader: glowFragment,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: {
          uGlow: { value: 1 },
          uViolet: { value: 0 },
          uSpeak: { value: 0 },
          uRadius: { value: RADIUS / GLOW_SIZE },
        },
      }),
    [],
  )

  useEffect(
    () => () => {
      particleGeo.dispose()
      filamentGeo.dispose()
      innerFilamentGeo.dispose()
      orbitGeos.forEach((g) => g.dispose())
      nodeGeo.dispose()
      ;[particleMat, filamentMat, innerFilamentMat, skinMat, glowMat, ...orbitMats, ...nodeMats].forEach((m) =>
        m.dispose(),
      )
    },
    [particleGeo, filamentGeo, innerFilamentGeo, orbitGeos, nodeGeo, particleMat, filamentMat, innerFilamentMat, skinMat, glowMat, orbitMats, nodeMats],
  )

  const qFree = useMemo(() => new THREE.Quaternion(), [])
  const qAligned = useMemo(() => new THREE.Quaternion(), [])
  const euler = useMemo(() => new THREE.Euler(), [])

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1)
    const timeScale = reducedMotion ? 0.35 : 1
    const c = clock.current
    const p = params.current
    const target = ORB_STATES[state]

    for (const key of PARAM_KEYS) {
      // Anticipation: the Orb leans in a little faster than it settles.
      const tau = key === 'scale' && state === 'listening' ? MORPH_TAU * 0.6 : MORPH_TAU
      p[key] = damp(p[key], target[key], tau, dt)
    }

    // Energy: quick attack, slow release, so speech fades out gently.
    const e = presence.getEnergy()
    c.energy = damp(c.energy, e, e > c.energy ? 0.06 : 0.35, dt)

    c.t += dt * timeScale
    c.rot += dt * timeScale * p.spin * Math.PI * 2 * 0.25
    c.flow += dt * timeScale * p.activity * 0.6

    const u = particleMat.uniforms
    u.uTime.value = c.t
    u.uRot.value = c.rot
    u.uFlow.value = c.flow
    u.uScale.value = p.scale
    u.uBreath.value = reducedMotion ? p.breath * 0.4 : p.breath
    u.uConverge.value = p.converge
    u.uDepth.value = p.depth
    u.uViolet.value = p.violet
    u.uListen.value = p.listen
    u.uSpeak.value = p.speak
    u.uEnergy.value = c.energy
    u.uGlow.value = p.glow

    if (spinGroup.current) {
      spinGroup.current.rotation.y = c.rot
      spinGroup.current.scale.setScalar(p.scale)
    }

    filamentMat.uniforms.uTime.value = c.t
    filamentMat.uniforms.uAlpha.value = (0.08 + p.organize * 0.14) * p.glow
    filamentMat.uniforms.uPulse.value = 0.3 + p.organize * 0.5 + p.activity * 0.25
    filamentMat.uniforms.uViolet.value = p.violet
    innerFilamentMat.uniforms.uTime.value = c.t * 1.3
    innerFilamentMat.uniforms.uAlpha.value = Math.max(0, p.depth - 0.3) * 0.12
    innerFilamentMat.uniforms.uPulse.value = Math.max(0, p.depth - 0.3) * 0.5
    innerFilamentMat.uniforms.uViolet.value = 0.6

    skinMat.uniforms.uGlow.value = p.glow
    skinMat.uniforms.uViolet.value = p.violet
    skinMat.uniforms.uSpeak.value = p.speak * c.energy
    skinMat.uniforms.uDepth.value = p.depth
    glowMat.uniforms.uGlow.value = p.glow
    glowMat.uniforms.uViolet.value = p.violet
    glowMat.uniforms.uSpeak.value = p.speak * c.energy

    ORBITS.forEach((o, i) => {
      const group = orbitRefs.current[i]
      const mat = orbitMats[i]
      mat.uniforms.uHead.value = (mat.uniforms.uHead.value + dt * timeScale * o.speed * (1 + p.activity * 0.8)) % 1
      mat.uniforms.uAlpha.value = o.alpha * (1 + p.organize * 0.9) * p.glow
      mat.uniforms.uViolet.value = p.violet * 0.6
      nodeMats[i].uniforms.uAlpha.value = (0.55 + p.organize * 0.4) * p.glow
      if (group) {
        const precess = c.t * o.drift
        qFree.setFromEuler(euler.set(o.free[0], o.free[1] + precess, o.free[2]))
        qAligned.setFromEuler(euler.set(o.aligned[0], o.aligned[1] + precess * 0.3, o.aligned[2]))
        group.quaternion.slerpQuaternions(qFree, qAligned, p.organize * 0.85)
        group.scale.setScalar(p.scale * (1 - p.converge * 0.6))
      }
    })

    // Tiny parallax toward the pointer: the Orb notices you, it doesn't chase you.
    if (root.current) {
      const ptr = reducedMotion ? { x: 0, y: 0 } : getPointer()
      root.current.rotation.y = damp(root.current.rotation.y, ptr.x * 0.07, 1.2, dt)
      root.current.rotation.x = damp(root.current.rotation.x, ptr.y * 0.05, 1.2, dt)
      root.current.position.x = damp(root.current.position.x, ptr.x * 0.04, 1.2, dt)
      root.current.position.y = damp(root.current.position.y, -ptr.y * 0.03, 1.2, dt)
    }
  })

  return (
    <group ref={root}>
      <mesh material={glowMat} position={[0, 0, -1.2]} renderOrder={0}>
        <planeGeometry args={[GLOW_SIZE, GLOW_SIZE]} />
      </mesh>

      <group rotation={[0.18, 0, -0.12]}>
        <group ref={spinGroup}>
          <mesh material={skinMat} renderOrder={1}>
            <sphereGeometry args={[RADIUS * 0.995, 64, 48]} />
          </mesh>
          <lineSegments geometry={filamentGeo} material={filamentMat} renderOrder={2} />
          <lineSegments geometry={innerFilamentGeo} material={innerFilamentMat} renderOrder={2} />
        </group>
        <points geometry={particleGeo} material={particleMat} renderOrder={3} />
      </group>

      {ORBITS.map((_, i) => (
        <group key={i} ref={(el) => void (orbitRefs.current[i] = el)}>
          <primitive object={orbitLines[i]} />
          <points geometry={nodeGeo} material={nodeMats[i]} renderOrder={4} />
        </group>
      ))}
    </group>
  )
}
