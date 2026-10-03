import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { presence, type PresenceForm, type PresenceState } from '../core/presence'
import { getPointer, pointerActive } from '../hooks/usePointer'
import { createHumanMotion, presenceLight, type AvatarState } from './avatar/humanMotion'
import { traceFragment, traceVertex } from './avatar/shaders'
import { useHeadCloud } from './avatar/useHeadCloud'
import { bodyFragment, bodyVertex } from './body/particleShaders'
import { createRibbonGeometry, ribbonVertex } from './lines'
import {
  assignFaceTargets,
  createOrbParticles,
  createStarNodes,
  createStreams,
  ellipsePoints,
  type ParticleCounts,
} from './orb/geometry'
import { glowFragment, glowVertex, orbitFragment, skinFragment, skinVertex, starFragment, starVertex, streamFragment } from './orb/shaders'
import { MORPH_TAU, ORB_STATES, PARAM_KEYS, type OrbParams } from './orb/stateParams'

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
  // The wide violet orbit that sweeps in front of the Orb.
  { r: [2.02, 2.02], free: [1.3, 0.05, -0.3], aligned: [1.38, 0, -0.12], speed: 0.018, drift: 0.006, tint: '#C9A4FF', tint2: '#B066FF', alpha: 0.75, width: 3.2, node: true },
  // A cyan ellipse crossing the other way.
  { r: [1.62, 1.62], free: [1.12, -0.35, 0.62], aligned: [1.38, 0, 0.1], speed: 0.03, drift: -0.01, tint: '#4BC8FF', tint2: '#3B82FF', alpha: 0.26, width: 2, node: true },
  // Concentric gyroscope rings hugging the glass.
  { r: [1.15, 1.15], free: [0.16, 0.62, 0.08], aligned: [1.38, 0, 0.3], speed: 0.045, drift: 0.012, tint: '#4BC8FF', tint2: '#8B5CFF', alpha: 0.22, width: 1.6, node: true },
  { r: [1.23, 1.23], free: [0.1, 0.7, 0.12], aligned: [1.38, 0, -0.25], speed: 0.038, drift: 0.012, tint: '#3B82FF', tint2: '#4BC8FF', alpha: 0.16, width: 1.4, node: false },
  { r: [1.31, 1.31], free: [0.06, 0.78, 0.16], aligned: [1.38, 0, 0.42], speed: 0.032, drift: 0.012, tint: '#3B82FF', tint2: '#B066FF', alpha: 0.12, width: 1.3, node: false },
]

const RADIUS = 1
const GLOW_SIZE = 4.6
const TILT = new THREE.Euler(0.18, 0, -0.12)
/** Switching between Orb and Avatar is a calm cross-fade; the face never breaks apart. */
const SWITCH_SECONDS = 1.1

/** PEPO's presence states, as the Avatar's body language understands them. */
const AVATAR_STATE: Record<PresenceState, AvatarState> = {
  idle: 'idle',
  waiting: 'idle',
  listening: 'listening',
  understanding: 'thinking',
  thinking: 'thinking',
  working: 'thinking',
  speaking: 'speaking',
}
export const CAMERA_Z = 8.2

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
 * PEPO's body. The Orb (ambient presence) and the point-cloud Avatar
 * (conversational presence) are the same particles in two arrangements.
 */
export function PresenceBody({ state, form, reducedMotion, counts }: PresenceBodyProps) {
  const root = useRef<THREE.Group>(null)
  const spinGroup = useRef<THREE.Group>(null)
  const orbitRefs = useRef<(THREE.Group | null)[]>([])
  const orbitNodeRefs = useRef<(THREE.Object3D | null)[]>([])
  /** Layers that exist only in the Orb; hidden (not drawn) in the Avatar. */
  const orbOnly = useRef<(THREE.Object3D | null)[]>([])
  const keep = (i: number) => (el: THREE.Object3D | null) => void (orbOnly.current[i] = el)
  /** Layers that exist only in the Avatar. */
  const faceOnly = useRef<(THREE.Object3D | null)[]>([])
  const face = (i: number) => (el: THREE.Object3D | null) => void (faceOnly.current[i] = el)
  const { gl, size } = useThree()
  const pixelRatio = gl.getPixelRatio()

  const params = useRef<OrbParams>({ ...ORB_STATES.idle })
  const clock = useRef({ t: 0, rot: 0, flow: 0, energy: 0, morph: 0 })
  const motion = useMemo(() => createHumanMotion(), [])

  const cloud = useHeadCloud(counts.total)

  // ── Geometry ──
  const particleGeo = useMemo(() => createOrbParticles(counts), [counts])
  const streamGeo = useMemo(() => createRibbonGeometry(createStreams(3, 6, 11, 0.86, 0.98)), [])
  const innerStreamGeo = useMemo(() => createRibbonGeometry(createStreams(2, 4, 23, 0.5, 0.7, 90)), [])
  const orbitGeos = useMemo(() => ORBITS.map((o) => createRibbonGeometry([ellipsePoints(o.r[0], o.r[1])], true)), [])
  const starGeo = useMemo(() => createStarNodes(14, 5), [])
  const nodeGeo = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3), 3))
    g.setAttribute('aSeed', new THREE.BufferAttribute(new Float32Array([0.6]), 1))
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 3)
    return g
  }, [])

  const traceGeo = useMemo(() => {
    if (!cloud) return null
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(cloud.traceSegments, 3))
    g.setAttribute('aStrength', new THREE.BufferAttribute(cloud.traceStrength, 1))
    g.setAttribute('aWarm', new THREE.BufferAttribute(cloud.traceWarm, 1))
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 3)
    return g
  }, [cloud])

  useEffect(() => {
    if (cloud) assignFaceTargets(particleGeo, cloud)
  }, [cloud, particleGeo])

  // ── Materials ──
  const resolution = useMemo(() => new THREE.Vector2(1, 1), [])
  useEffect(() => {
    resolution.set(size.width * pixelRatio, size.height * pixelRatio)
  }, [size, pixelRatio, resolution])

  /** FATHI rig uniforms, shared by the particles and the strands. */
  const pose = useMemo(
    () => ({
      uHead: { value: new THREE.Vector3() },
      uMouth: { value: new THREE.Vector3() },
      uBody: { value: new THREE.Vector3() },
      uEyes: { value: new THREE.Vector3() },
      uPresence: { value: new THREE.Vector3(1.03, 1.08, 0) },
      uJaw: { value: 0 },
      uBlink: { value: 0 },
      uBreath: { value: 0 },
      uGaze: { value: new THREE.Vector2() },
      uLean: { value: 0 },
      uFaceScale: { value: 1.18 },
      uFaceOffset: { value: new THREE.Vector3(0, -0.32, 0) },
    }),
    [],
  )

  // One uniform set, two passes over the same particles: the Orb and the Avatar.
  const bodyUniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uRot: { value: 0 },
      uFlow: { value: 0 },
      uScale: { value: 1 },
      uOrbBreath: { value: 0 },
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
          // Full density draws finer, fainter points; the phone subset fewer, brighter ones.
          uFaceGain: { value: counts.total > 100000 ? 0.62 : 1.0 },
          ...pose,
    }),
    [pixelRatio, pose, counts.total],
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
  const faceMat = useMemo(
    () =>
      additive({
        vertexShader: bodyVertex,
        fragmentShader: bodyFragment,
        defines: { FACE_PASS: 1 },
        uniforms: { ...bodyUniforms, uOpacity: { value: 0 } },
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
      },
    })
  const streamMat = useMemo(() => makeStreamMat(0.3, 16), [pixelRatio])
  const innerStreamMat = useMemo(() => makeStreamMat(0, 3.5), [pixelRatio])

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
  const starMat = useMemo(() => makeStarMat(40, '#4BC8FF'), [pixelRatio])
  const nodeMats = useMemo(() => ORBITS.map((o) => makeStarMat(26, o.tint)), [pixelRatio])

  const skinMat = useMemo(
    () =>
      additive({
        vertexShader: skinVertex,
        fragmentShader: skinFragment,
        uniforms: { uGlow: { value: 1 }, uViolet: { value: 0 }, uSpeak: { value: 0 }, uDepth: { value: 0 }, uTime: { value: 0 }, uFade: fade },
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
        },
      }),
    [fade],
  )

  const traceMat = useMemo(
    () =>
      additive({
        vertexShader: traceVertex,
        fragmentShader: traceFragment,
        uniforms: { uOpacity: { value: 0 }, ...pose },
      }),
    [pose],
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
      ;[particleGeo, streamGeo, innerStreamGeo, starGeo, nodeGeo, ...orbitGeos].forEach((g) => g.dispose())
      ;[bodyMat, faceMat, streamMat, innerStreamMat, starMat, skinMat, glowMat, traceMat, ...orbitMats, ...nodeMats].forEach((m) => m.dispose())
    },
    [particleGeo, streamGeo, innerStreamGeo, starGeo, nodeGeo, orbitGeos, bodyMat, faceMat, streamMat, innerStreamMat, starMat, skinMat, glowMat, traceMat, orbitMats, nodeMats],
  )
  useEffect(() => () => traceGeo?.dispose(), [traceGeo])

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

    // Orb ↔ Avatar: the Orb fades away, then FATHI fades in whole.
    const morphTarget = form === 'avatar' && cloud ? 1 : 0
    const step = dt / (reducedMotion ? SWITCH_SECONDS * 0.6 : SWITCH_SECONDS)
    c.morph = morphTarget > c.morph ? Math.min(1, c.morph + step) : Math.max(0, c.morph - step)
    const m = c.morph
    const orbVisible = 1 - THREE.MathUtils.smoothstep(m, 0, 0.6)
    const faceVisible = THREE.MathUtils.smoothstep(m, 0.4, 1)
    fade.value = orbVisible
    for (const obj of orbOnly.current) if (obj) obj.visible = orbVisible > 0.001
    bodyMat.uniforms.uOpacity.value = orbVisible
    faceMat.uniforms.uOpacity.value = faceVisible
    traceMat.uniforms.uOpacity.value = faceVisible
    for (const obj of faceOnly.current) if (obj) obj.visible = faceVisible > 0.001

    // The Avatar's life: natural human motion (see avatar/humanMotion.ts).
    // Only speech output reaches it; the microphone never moves the face.
    const ptr = reducedMotion ? { x: 0, y: 0 } : getPointer()
    const astate = AVATAR_STATE[state]
    motion.setState(astate)
    motion.setReduced(reducedMotion)
    motion.setAmplitude(state === 'speaking' ? e : 0)
    motion.setPointer(ptr.x, -ptr.y, pointerActive())
    const mo = motion.step(dt)
    pose.uHead.value.set(mo.yaw, mo.pitch, mo.roll)
    pose.uMouth.value.set(0, mo.viseme[1], mo.viseme[2])
    pose.uBody.value.set(mo.body[0], mo.body[1], 0)
    pose.uEyes.value.set(mo.brows[0], mo.brows[1], mo.squint)
    pose.uGaze.value.set(mo.gaze[0], mo.gaze[1])
    pose.uLean.value = mo.lean
    pose.uJaw.value = mo.jaw
    pose.uBlink.value = mo.blink
    pose.uBreath.value = mo.breath
    const light = presenceLight(astate, state === 'speaking' ? c.energy : 0)
    const lb = 1 - Math.exp(-dt / 0.28)
    const pl = pose.uPresence.value
    pl.set(pl.x + (light[0] - pl.x) * lb, pl.y + (light[1] - pl.y) * lb, pl.z + (light[2] - pl.z) * lb)

    const u = bodyMat.uniforms
    u.uTime.value = c.t
    u.uRot.value = c.rot
    u.uFlow.value = c.flow
    u.uScale.value = p.scale
    u.uOrbBreath.value = reducedMotion ? p.breath * 0.4 : p.breath
    u.uConverge.value = p.converge
    u.uDepth.value = p.depth
    u.uViolet.value = p.violet
    u.uListen.value = p.listen
    u.uSpeak.value = p.speak
    u.uEnergy.value = c.energy
    u.uGlow.value = p.glow

    if (spinGroup.current) {
      spinGroup.current.rotation.y = c.rot
        spinGroup.current.scale.setScalar(p.scale * (1 + m * 0.25))
    }

    streamMat.uniforms.uTime.value = c.t
    streamMat.uniforms.uAlpha.value = (0.95 + p.organize * 0.25) * p.glow
    // The Orb's own voice: streams surge with speech, orbits brighten while listening.
    streamMat.uniforms.uPulse.value = 0.35 + p.organize * 0.5 + p.activity * 0.3 + p.speak * c.energy * 0.9 + p.listen * c.energy * 0.4
    streamMat.uniforms.uViolet.value = p.violet
    innerStreamMat.uniforms.uTime.value = c.t * 1.3
    innerStreamMat.uniforms.uAlpha.value = Math.max(0, p.depth - 0.3) * 0.35
    innerStreamMat.uniforms.uPulse.value = Math.max(0, p.depth - 0.3) * 0.9
    innerStreamMat.uniforms.uViolet.value = 1
    starMat.uniforms.uTime.value = c.t
    starMat.uniforms.uAlpha.value = (0.75 + p.organize * 0.25) * p.glow * orbVisible

    skinMat.uniforms.uTime.value = c.t
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
      mat.uniforms.uAlpha.value = o.alpha * (1 + p.organize * 0.6 + p.listen * c.energy * 0.8 + p.speak * c.energy * 0.5) * p.glow
      mat.uniforms.uViolet.value = p.violet
      const nodeMat = nodeMats[i]
      nodeMat.uniforms.uTime.value = c.t
      nodeMat.uniforms.uAlpha.value = (0.8 + p.organize * 0.2) * p.glow * orbVisible
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
        // Orbits widen and fade as the Orb opens into the face.
        group.scale.setScalar(p.scale * (1 - p.converge * 0.5) * (1 + m * 0.35))
      }
    })

    // Tiny parallax toward the pointer: PEPO notices you; it doesn't chase you.
    if (root.current) {
      // FATHI is a shallow relief: keep its parallax small so it never turns into a cut-out.
      const tilt = 1 - m * 0.75
      root.current.rotation.y = damp(root.current.rotation.y, ptr.x * 0.07 * tilt, 1.2, dt)
      root.current.rotation.x = damp(root.current.rotation.x, ptr.y * 0.05 * tilt, 1.2, dt)
      root.current.position.x = damp(root.current.position.x, ptr.x * 0.04, 1.2, dt)
      root.current.position.y = damp(root.current.position.y, -ptr.y * 0.03, 1.2, dt)
    }
  })

  return (
    <group ref={root}>
      <mesh material={glowMat} renderOrder={0}>
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
      <points ref={face(1)} geometry={particleGeo} material={faceMat} renderOrder={7} frustumCulled={false} visible={false} />
      {traceGeo && <lineSegments ref={face(2)} geometry={traceGeo} material={traceMat} renderOrder={8} frustumCulled={false} visible={false} />}

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
