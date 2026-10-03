import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { presence, type PresenceForm, type PresenceState } from '../core/presence'
import { getPointer } from '../hooks/usePointer'
import { bodyFragment, bodyVertex } from './body/particleShaders'
import { createRibbonGeometry, ribbonVertex } from './lines'
import {
  createCoreNetwork,
  createFlowArcs,
  createOrbParticles,
  createStarNodes,
  ellipsePoints,
  FIELD_AXIS,
  type FlowArc,
  type ParticleCounts,
} from './orb/geometry'
import { glowFragment, glowVertex, linkFragment, orbitFragment, skinFragment, skinVertex, starFragment, starVertex, streamFragment } from './orb/shaders'
import { createOrbMotion } from './orb/orbMotion'
import { MORPH_TAU, ORB_STATES, PARAM_KEYS, type OrbParams } from './orb/stateParams'
import { pepoEvents } from '../core/events'
import { useTheme } from '../core/theme'

interface OrbitSpec {
  r: [number, number]
  /** Free-floating orientation (Euler, radians). */
  free: [number, number, number]
  /** Orientation while PEPO organises its thoughts. */
  aligned: [number, number, number]
  /** Laps per second of the travelling light. */
  speed: number
  /** Precession of the orbit plane itself. */
  drift: number
  tint: string
  tint2: string
  alpha: number
  width: number
  node: boolean
}

const ORBITS: OrbitSpec[] = [
  // One primary orbit: thin, blue into a violet accent, partly visible, gone behind the Orb.
  { r: [1.74, 1.74], free: [1.3, 0.05, -0.3], aligned: [1.38, 0, -0.12], speed: 0.014, drift: 0.005, tint: '#6F93FF', tint2: '#9C7BFF', alpha: 0.24, width: 1.4, node: true },
  // And a barely-there second trajectory crossing the other way.
  { r: [1.36, 1.36], free: [1.12, -0.35, 0.62], aligned: [1.38, 0, 0.1], speed: 0.022, drift: -0.008, tint: '#4BC8FF', tint2: '#3B82FF', alpha: 0.08, width: 1, node: false },
]

/**
 * Five internal flows, unequal on purpose: three long ones at different
 * depths, one that dips close to the core, and one short fragment.
 * Deeper, smaller ones appear while thinking.
 */
const FILAMENTS: FlowArc[] = [
  { frame: [0.5, 0.2, 0.35], lon: 0.4, sweep: 2.9, lat: 0.25, wave: 0.22, rEnd: 0.96, rMid: 0.6 },
  { frame: [-0.6, 1.1, -0.2], lon: 2.2, sweep: 2.5, lat: -0.15, wave: 0.28, rEnd: 0.94, rMid: 0.52 },
  { frame: [1.2, -0.4, 0.9], lon: 4.0, sweep: 3.2, lat: 0.1, wave: 0.18, rEnd: 0.97, rMid: 0.7 },
  { frame: [0.15, 2.3, -0.75], lon: 5.3, sweep: 2.2, lat: -0.35, wave: 0.25, rEnd: 0.9, rMid: 0.3 },
  { frame: [-1.0, -0.7, 0.4], lon: 1.3, sweep: 1.1, lat: 0.3, wave: 0.15, rEnd: 0.82, rMid: 0.58 },
]
const DEEP_FILAMENTS: FlowArc[] = [
  { frame: [0.9, 0.6, -0.4], lon: 1.0, sweep: 3.6, lat: 0.2, wave: 0.35, rEnd: 0.55, rMid: 0.3 },
  { frame: [-0.3, -1.2, 0.7], lon: 3.4, sweep: 3.1, lat: -0.25, wave: 0.3, rEnd: 0.5, rMid: 0.25 },
  { frame: [1.5, 2.0, 0.2], lon: 5.0, sweep: 2.8, lat: 0.05, wave: 0.4, rEnd: 0.58, rMid: 0.35 },
]

const RADIUS = 1
const GLOW_SIZE = 4.6
const TILT = new THREE.Euler(0.18, 0, -0.12)
/** Switching to the Avatar fades the Orb away while FATHI fades in over it (a presentation change only). */
const SWITCH_SECONDS = 0.35

export const CAMERA_Z = 8.2
/** Final motion pass: ambient movement kept ~12% quieter than first drafted. */
const AMBIENT = 0.88

interface PresenceBodyProps {
  state: PresenceState
  form: PresenceForm
  reducedMotion: boolean
  counts: ParticleCounts
}

const damp = (current: number, target: number, tau: number, dt: number) =>
  current + (target - current) * (1 - Math.exp(-dt / tau))

const additive = (params: THREE.ShaderMaterialParameters) =>
  new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, ...params })

/**
 * The Orb: PEPO's ambient body. When the viewer chooses the Avatar, the Orb
 * fades away and FATHI (FathiAvatar) is drawn on its own canvas above it.
 */
export function PresenceBody({ state, form, reducedMotion, counts }: PresenceBodyProps) {
  const root = useRef<THREE.Group>(null)
  const spinGroup = useRef<THREE.Group>(null)
  const glowMesh = useRef<THREE.Mesh>(null)
  const coreGroup = useRef<THREE.Group>(null)
  const orbitRefs = useRef<(THREE.Group | null)[]>([])
  const orbitNodeRefs = useRef<(THREE.Object3D | null)[]>([])
  /** Layers that exist only in the Orb; hidden (not drawn) in the Avatar. */
  const orbOnly = useRef<(THREE.Object3D | null)[]>([])
  const keep = (i: number) => (el: THREE.Object3D | null) => void (orbOnly.current[i] = el)
  const { gl, size, invalidate } = useThree()
  const light = useTheme() === 'light'
  const pixelRatio = gl.getPixelRatio()

  const params = useRef<OrbParams>({ ...ORB_STATES.idle })
  const clock = useRef<{ t: number; rot: number; flow: number; energy: number; morph: number; swirl?: number }>({ t: 0, rot: 0, flow: 0, energy: 0, morph: 0, swirl: 0 })
  // Breath, voice envelopes and emphasis: the Orb's living signals (orbMotion.ts).
  const orbMotion = useMemo(() => createOrbMotion(), [])
  useEffect(() => pepoEvents.on('cue', ({ kind }) => orbMotion.cue(kind)), [orbMotion])

  // ── Geometry ──
  const flowPaths = useMemo(() => createFlowArcs(FILAMENTS), [])
  // Part of the volume's particles follow the flows (aLine), so the inside reads as organised.
  const particleGeo = useMemo(() => createOrbParticles(counts, flowPaths), [counts, flowPaths])
  const streamGeo = useMemo(() => createRibbonGeometry(flowPaths), [flowPaths])
  const core = useMemo(() => createCoreNetwork(), [])
  const linkGeo = useMemo(() => createRibbonGeometry(core.links), [core])
  const innerStreamGeo = useMemo(() => createRibbonGeometry(createFlowArcs(DEEP_FILAMENTS, 100)), [])
  const orbitGeos = useMemo(() => ORBITS.map((o) => createRibbonGeometry([ellipsePoints(o.r[0], o.r[1])], true)), [])
  const starGeo = useMemo(() => createStarNodes(5, 5), [])
  const nodeGeo = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3), 3))
    g.setAttribute('aSeed', new THREE.BufferAttribute(new Float32Array([0.6]), 1))
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 3)
    return g
  }, [])

  // ── Materials ──
  const resolution = useMemo(() => new THREE.Vector2(1, 1), [])
  useEffect(() => {
    resolution.set(size.width * pixelRatio, size.height * pixelRatio)
  }, [size, pixelRatio, resolution])

  const bodyUniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uRot: { value: 0 },
      uFlow: { value: 0 },
      uScale: { value: 1 },
      uOrbBreath: { value: 0 },
      uBreathWave: { value: 0 },
      uConverge: { value: 0 },
      uDepth: { value: 0 },
      uViolet: { value: 0 },
      uListen: { value: 0 },
      uSpeak: { value: 0 },
      uEnergy: { value: 0 },
      uGlow: { value: 1 },
      uSize: { value: 2.2 },
      uPixelRatio: { value: pixelRatio },
      uOrbTilt: { value: new THREE.Matrix3().setFromMatrix4(new THREE.Matrix4().makeRotationFromEuler(TILT)) },
      uSwirl: { value: 0 },
      uSwirlAxis: { value: FIELD_AXIS },
      uCoreOffset: { value: new THREE.Vector3() },
      uActivity: { value: 0 },
    }),
    [pixelRatio],
  )
  const bodyMat = useMemo(
    () =>
      additive({
        vertexShader: bodyVertex,
        fragmentShader: bodyFragment,
        uniforms: { ...bodyUniforms, uOpacity: { value: 1 } },
      }),
    [bodyUniforms],
  )
  const fade = useMemo(() => ({ value: 1 }), [])

  const makeStreamMat = (alpha: number, width: number) =>
    additive({
      vertexShader: ribbonVertex,
      fragmentShader: streamFragment,
      side: THREE.DoubleSide,
      uniforms: {
        uResolution: { value: resolution },
        uWidth: { value: width * pixelRatio },
        uTime: { value: 0 },
        uAlpha: { value: alpha },
        uPulse: { value: 0.4 },
        uViolet: { value: 0 },
        uFade: fade,
        uSwirl: { value: 0 },
        uSwirlAxis: { value: FIELD_AXIS },
        uDof: { value: 0.8 },
        uCoherence: { value: 0 },
      },
    })
  const streamMat = useMemo(() => makeStreamMat(0.3, 7), [pixelRatio])
  const innerStreamMat = useMemo(() => makeStreamMat(0, 4), [pixelRatio])
  const linkMat = useMemo(
    () =>
      additive({
        vertexShader: ribbonVertex,
        fragmentShader: linkFragment,
        side: THREE.DoubleSide,
        uniforms: { uResolution: { value: resolution }, uWidth: { value: 2.4 * pixelRatio }, uTime: { value: 0 }, uAlpha: { value: 0.2 }, uFade: fade },
      }),
    [pixelRatio, resolution, fade],
  )

  const orbitMats = useMemo(
    () =>
      ORBITS.map((o, i) =>
        additive({
          vertexShader: ribbonVertex,
          fragmentShader: orbitFragment,
          side: THREE.DoubleSide,
          uniforms: {
            uResolution: { value: resolution },
            uWidth: { value: o.width * 2 * pixelRatio },
            uHead: { value: (i * 0.37) % 1 },
            uAlpha: { value: o.alpha },
            uViolet: { value: 0 },
            uFade: fade,
            uTint: { value: new THREE.Color(o.tint) },
            uTint2: { value: new THREE.Color(o.tint2) },
            uOrbR: { value: 1 },
            uDof: { value: 0.6 },
          },
        }),
      ),
    [pixelRatio, resolution, fade],
  )

  const makeStarMat = (size: number, tint: string) =>
    additive({
      vertexShader: starVertex,
      fragmentShader: starFragment,
      uniforms: {
        uTime: { value: 0 },
        uSize: { value: size },
        uPixelRatio: { value: pixelRatio },
        uAlpha: { value: 1 },
        uTint: { value: new THREE.Color(tint) },
      },
    })
  const starMat = useMemo(() => makeStarMat(16, '#4BC8FF'), [pixelRatio])
  const coreNodeMat = useMemo(() => makeStarMat(11, '#6F8CFF'), [pixelRatio])
  const nodeMats = useMemo(() => ORBITS.map((o) => makeStarMat(12, o.tint)), [pixelRatio])

  const skinMat = useMemo(
    () =>
      additive({
        vertexShader: skinVertex,
        fragmentShader: skinFragment,
        uniforms: {
          uGlow: { value: 1 },
          uViolet: { value: 0 },
          uSpeak: { value: 0 },
          uDepth: { value: 0 },
          uTime: { value: 0 },
          uBreath: { value: 0 },
          uListen: { value: 0 },
          uEmphasis: { value: 0 },
          uLight: { value: 0 },
          uCore: { value: new THREE.Vector2() },
          uWave: { value: 0 },
          uActivity: { value: 0 },
          uFade: fade,
        },
      }),
    [fade],
  )

  const glowMat = useMemo(
    () =>
      additive({
        vertexShader: glowVertex,
        fragmentShader: glowFragment,
        uniforms: {
          uGlow: { value: 1 },
          uViolet: { value: 0 },
          uSpeak: { value: 0 },
          // Silhouette radius of the sphere as seen from the camera, in quad units.
          uRadius: { value: (CAMERA_Z * Math.tan(Math.asin(RADIUS / CAMERA_Z))) / GLOW_SIZE },
          uFade: fade,
          uTime: { value: 0 },
        },
      }),
    [fade],
  )

  const orbitMeshes = useMemo(
    () =>
      orbitGeos.map((g, i) => {
        const mesh = new THREE.Mesh(g, orbitMats[i])
        mesh.frustumCulled = false
        return mesh
      }),
    [orbitGeos, orbitMats],
  )

  useEffect(
    () => () => {
      ;[particleGeo, streamGeo, innerStreamGeo, starGeo, nodeGeo, linkGeo, core.points, ...orbitGeos].forEach((g) => g.dispose())
      ;[bodyMat, streamMat, innerStreamMat, starMat, coreNodeMat, linkMat, skinMat, glowMat, ...orbitMats, ...nodeMats].forEach((m) => m.dispose())
    },
    [particleGeo, streamGeo, innerStreamGeo, starGeo, nodeGeo, linkGeo, core, orbitGeos, bodyMat, streamMat, innerStreamMat, starMat, coreNodeMat, linkMat, skinMat, glowMat, orbitMats, nodeMats],
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
    // Back after a pause (the Avatar was shown, or the tab was hidden): join
    // the current state at once instead of easing in from a stale one.
    if (rawDt > 0.5) for (const key of PARAM_KEYS) p[key] = target[key]

    for (const key of PARAM_KEYS) {
      // Anticipation: the Orb leans in a little faster than it settles.
      const tau = key === 'scale' && state === 'listening' ? MORPH_TAU * 0.6 : MORPH_TAU
      p[key] = damp(p[key], target[key], tau, dt)
    }

    // Voice: gated, normalised and smoothed to phrase level, so the Orb never
    // pulses with syllables and audio stays a minority of its motion.
    const sig = orbMotion.step(dt * timeScale, state, presence.getEnergy())
    c.energy = state === 'speaking' ? sig.speak : sig.listen

    c.t += dt * timeScale
    c.rot += dt * timeScale * AMBIENT * p.spin * Math.PI * 2 * 0.25
    c.flow += dt * timeScale * AMBIENT * p.activity * 0.6

    // Orb ↔ Avatar: the Orb fades away (FATHI fades in on its own canvas).
    const morphTarget = form === 'avatar' ? 1 : 0
    const step = dt / (reducedMotion ? SWITCH_SECONDS * 0.6 : SWITCH_SECONDS)
    c.morph = morphTarget > c.morph ? Math.min(1, c.morph + step) : Math.max(0, c.morph - step)
    const m = c.morph
    // The canvas pauses while the Avatar is shown; until the Orb has fully
    // faded (or come back), keep drawing so it never freezes half-visible.
    if (m !== morphTarget) invalidate()
    // One presentation leaves, then the other arrives: the Orb is gone within
    // the first ~0.2 s, while FATHI fades in over the last ~0.2 s.
    const orbVisible = 1 - THREE.MathUtils.smoothstep(m, 0, 0.55)
    fade.value = orbVisible
    for (const obj of orbOnly.current) if (obj) obj.visible = orbVisible > 0.001
    bodyMat.uniforms.uOpacity.value = orbVisible

    const u = bodyMat.uniforms
    u.uTime.value = c.t
    u.uRot.value = c.rot
    u.uFlow.value = c.flow
    u.uScale.value = p.scale
    u.uOrbBreath.value = reducedMotion ? p.breath * 0.4 : p.breath
    u.uBreathWave.value = sig.breath
    u.uConverge.value = p.converge
    u.uDepth.value = p.depth
    u.uViolet.value = p.violet
    u.uListen.value = p.listen
    u.uSpeak.value = p.speak
    u.uEnergy.value = c.energy
    // Emphasis is a local highlight (skin), not a brighter Orb.
    u.uGlow.value = p.glow

    // The sphere itself never turns as one body; only its inner layers move.
    if (spinGroup.current) spinGroup.current.scale.setScalar(p.scale * (1 + m * 0.06))
    // The core gathers slightly off centre and wanders slowly (two unrelated periods).
    const coreX = -0.05 + 0.05 * Math.sin(c.t * 0.029 + 0.7) + 0.02 * Math.sin(c.t * 0.071)
    const coreY = -0.03 + 0.04 * Math.sin(c.t * 0.023 + 2.1) + 0.015 * Math.sin(c.t * 0.057 + 1.0)
    u.uCoreOffset.value.set(coreX, coreY, 0)
    u.uActivity.value = p.activity
    if (coreGroup.current) {
      coreGroup.current.position.set(coreX, coreY, 0)
      coreGroup.current.rotation.set(c.t * 0.011 + 0.4, c.t * 0.017, c.t * 0.007)
      coreGroup.current.scale.setScalar(p.scale * (1 - 0.18 * p.activity))
    }
    // The glow follows the Orb's size, so it stays just outside the edge.
    glowMesh.current?.scale.setScalar(p.scale * (1 + m * 0.06))

    // Filaments drift on their own (each at its own pace about the field
    // axis); thinking makes them a little more active, speech lifts them.
    c.swirl = (c.swirl ?? 0) + dt * timeScale * AMBIENT * (0.05 + p.activity * 0.07)
    u.uSwirl.value = c.swirl
    streamMat.uniforms.uTime.value = c.t
    streamMat.uniforms.uSwirl.value = c.swirl
    streamMat.uniforms.uCoherence.value = p.listen
    streamMat.uniforms.uAlpha.value = 0.68 * (1 + p.organize * 0.25) * p.glow
    streamMat.uniforms.uPulse.value = 0.22 + p.organize * 0.2 + p.activity * 0.25 + p.speak * c.energy * 0.35 + p.listen * c.energy * 0.15
    streamMat.uniforms.uViolet.value = p.violet
    innerStreamMat.uniforms.uTime.value = c.t * 1.2
    innerStreamMat.uniforms.uSwirl.value = -c.swirl * 1.3
    innerStreamMat.uniforms.uAlpha.value = Math.max(0, p.depth - 0.3) * 0.4
    innerStreamMat.uniforms.uPulse.value = Math.max(0, p.depth - 0.3) * 0.5
    innerStreamMat.uniforms.uViolet.value = 0.4 + p.violet * 0.6
    linkMat.uniforms.uTime.value = c.t
    // Links are barely there at rest; while thinking they form and connect.
    linkMat.uniforms.uAlpha.value = (0.07 + 0.32 * p.activity + 0.08 * p.organize) * p.glow
    coreNodeMat.uniforms.uTime.value = c.t
    coreNodeMat.uniforms.uAlpha.value = (0.32 + 0.25 * p.activity + 0.2 * p.speak * c.energy) * p.glow * orbVisible
    starMat.uniforms.uTime.value = c.t
    starMat.uniforms.uAlpha.value = (0.45 + p.organize * 0.15 + p.speak * c.energy * 0.3) * p.glow * orbVisible

    skinMat.uniforms.uTime.value = c.t
    skinMat.uniforms.uGlow.value = p.glow
    skinMat.uniforms.uViolet.value = p.violet
    skinMat.uniforms.uSpeak.value = p.speak * c.energy
    skinMat.uniforms.uDepth.value = p.depth
    skinMat.uniforms.uBreath.value = reducedMotion ? sig.breath * 0.5 : sig.breath
    skinMat.uniforms.uListen.value = p.listen
    skinMat.uniforms.uEmphasis.value = sig.emphasis * 10
    skinMat.uniforms.uLight.value = damp(skinMat.uniforms.uLight.value, light ? 1 : 0, 0.12, dt)
    skinMat.uniforms.uCore.value.set(coreX, coreY)
    skinMat.uniforms.uWave.value = sig.wave
    skinMat.uniforms.uActivity.value = p.activity
    glowMat.uniforms.uTime.value = c.t
    glowMat.uniforms.uGlow.value = p.glow
    glowMat.uniforms.uViolet.value = p.violet
    glowMat.uniforms.uSpeak.value = p.speak * c.energy

    ORBITS.forEach((o, i) => {
      const group = orbitRefs.current[i]
      const mat = orbitMats[i]
      mat.uniforms.uHead.value = (mat.uniforms.uHead.value + dt * timeScale * AMBIENT * o.speed * (1 + p.activity * 0.8)) % 1
      mat.uniforms.uAlpha.value = o.alpha * (1 + p.organize * 0.4 + p.listen * c.energy * 0.3 + p.speak * c.energy * 0.2) * p.glow
      mat.uniforms.uViolet.value = p.violet
      mat.uniforms.uOrbR.value = p.scale * (1 + m * 0.06)
      const nodeMat = nodeMats[i]
      nodeMat.uniforms.uTime.value = c.t
      nodeMat.uniforms.uAlpha.value = (0.4 + p.organize * 0.15) * p.glow * orbVisible
      const node = orbitNodeRefs.current[i]
      if (node) {
        const a = mat.uniforms.uHead.value * Math.PI * 2
        node.position.set(Math.cos(a) * o.r[0], Math.sin(a) * o.r[1], 0)
      }
      if (group) {
        const precess = c.t * o.drift
        qFree.setFromEuler(euler.set(o.free[0], o.free[1] + precess, o.free[2]))
        qAligned.setFromEuler(euler.set(o.aligned[0], o.aligned[1] + precess * 0.3, o.aligned[2]))
        group.quaternion.slerpQuaternions(qFree, qAligned, p.organize * 0.8)
        // Orbits widen a touch and fade as the Orb gives way to the Avatar.
        group.scale.setScalar(p.scale * (1 - p.converge * 0.5) * (1 + m * 0.06))
      }
    })

    // Tiny parallax toward the pointer: PEPO notices you; it doesn't chase you.
    const ptr = reducedMotion ? { x: 0, y: 0 } : getPointer()
    if (root.current) {
      root.current.rotation.y = damp(root.current.rotation.y, ptr.x * 0.07, 1.2, dt)
      root.current.rotation.x = damp(root.current.rotation.x, ptr.y * 0.05, 1.2, dt)
      root.current.position.x = damp(root.current.position.x, ptr.x * 0.04, 1.2, dt)
      root.current.position.y = damp(root.current.position.y, -ptr.y * 0.03, 1.2, dt)
    }
  })

  return (
    <group ref={root}>
      <mesh ref={glowMesh} material={glowMat} renderOrder={0}>
        <planeGeometry args={[GLOW_SIZE, GLOW_SIZE]} />
      </mesh>

      <group rotation={TILT} ref={keep(0)}>
        <group ref={spinGroup}>
          <mesh material={skinMat} renderOrder={1}>
            <sphereGeometry args={[RADIUS * 0.995, 72, 54]} />
          </mesh>
          <mesh geometry={streamGeo} material={streamMat} renderOrder={2} frustumCulled={false} />
          <mesh geometry={innerStreamGeo} material={innerStreamMat} renderOrder={2} frustumCulled={false} />
          <points geometry={starGeo} material={starMat} renderOrder={5} />
        </group>
      </group>

      <points geometry={particleGeo} material={bodyMat} renderOrder={3} frustumCulled={false} />

      {/* The core's quiet network: a few dim points and the links between them. */}
      <group ref={(el) => { coreGroup.current = el; orbOnly.current[ORBITS.length + 2] = el }}>
        <mesh geometry={linkGeo} material={linkMat} renderOrder={2} frustumCulled={false} />
        <points geometry={core.points} material={coreNodeMat} renderOrder={5} />
      </group>


      {ORBITS.map((o, i) => (
        <group
          key={i}
          ref={(el) => {
            orbitRefs.current[i] = el
            orbOnly.current[i + 1] = el
          }}
        >
          <primitive object={orbitMeshes[i]} />
          {o.node && (
            <points ref={(el) => void (orbitNodeRefs.current[i] = el)} geometry={nodeGeo} material={nodeMats[i]} renderOrder={5} />
          )}
        </group>
      ))}
    </group>
  )
}
