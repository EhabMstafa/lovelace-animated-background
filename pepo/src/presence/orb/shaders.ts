/**
 * GLSL for the Orb. Every layer shares the same palette and the same
 * "front is bright, back is faint" depth rule so they read as one object.
 */

const palette = /* glsl */ `
  const vec3 C_CYAN   = vec3(0.251, 0.902, 1.000); // #40E6FF
  const vec3 C_BLUE   = vec3(0.231, 0.510, 1.000); // #3B82FF
  const vec3 C_DEEP   = vec3(0.153, 0.420, 1.000); // #276BFF
  const vec3 C_VIOLET = vec3(0.545, 0.361, 1.000); // #8B5CFF
  const vec3 C_LILAC  = vec3(0.690, 0.400, 1.000); // #B066FF
  const vec3 C_WHITE  = vec3(0.933, 0.957, 1.000); // #EEF4FF
  // Light comes from the lower left (cyan); cognition gathers upper right (violet).
  const vec3 VIOLET_DIR = normalize(vec3(0.72, 0.62, 0.25));
`

const rotateAxis = /* glsl */ `
  vec3 rotateAxis(vec3 p, vec3 axis, float a) {
    float c = cos(a), s = sin(a);
    return p * c + cross(axis, p) * s + axis * dot(axis, p) * (1.0 - c);
  }
`

export const particleVertex = /* glsl */ `
  ${palette}
  ${rotateAxis}
  uniform float uTime;
  uniform float uRot;
  uniform float uFlow;
  uniform float uScale;
  uniform float uBreath;
  uniform float uConverge;
  uniform float uDepth;
  uniform float uViolet;
  uniform float uListen;
  uniform float uSpeak;
  uniform float uEnergy;
  uniform float uGlow;
  uniform float uSize;
  uniform float uPixelRatio;

  attribute vec4 aSeed;
  attribute float aKind;
  attribute vec3 aAxis;

  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    float shell = 1.0 - step(0.5, aKind);
    float inner = step(0.5, aKind) * (1.0 - step(1.5, aKind));
    float halo  = step(1.5, aKind);
    float t = uTime;

    vec3 p = position;

    // Organic drift, largest for the loose outer motes.
    vec3 drift = sin(vec3(0.21, 0.17, 0.19) * t + aSeed.xyz * 6.2831);
    p += drift * (0.005 * shell + 0.018 * inner + 0.05 * halo);

    // Thinking: inner points travel along their own curved paths.
    p = rotateAxis(p, aAxis, uFlow * inner * (0.35 + aSeed.x));

    // Each population turns at its own slow rate.
    float a = uRot * (shell + 1.4 * inner + 0.55 * halo);
    float ca = cos(a), sa = sin(a);
    p.xz = mat2(ca, -sa, sa, ca) * p.xz;

    float r = length(p);
    vec3 dir = p / max(r, 1e-4);

    // Breathing: one slow cycle every ~6 s.
    float breath = sin(t * 6.2831 / 6.0);
    r *= 1.0 + uBreath * breath * (shell + 0.6 * inner + 1.5 * halo);

    // Understanding: everything gathers inward, the halo most of all.
    r *= 1.0 - uConverge * (shell + 0.4 * inner + 2.6 * halo);

    // Listening: a thin ripple travels through; outer motes follow the voice.
    float ripple = sin(dir.y * 8.0 - t * 2.6 + dir.x * 1.5);
    r += uListen * uEnergy * (halo * (0.10 + 0.07 * ripple) + shell * 0.022 * ripple);

    // Speaking: energy starts at the core and travels to the surface.
    float wave = sin(r * 7.0 - t * 4.0);
    float speak = uSpeak * uEnergy;
    r += speak * 0.028 * wave * (shell + halo);

    p = dir * r * uScale;
    // Lean towards the user while listening.
    p.z += uListen * 0.07 * (0.5 + 0.5 * dir.z);

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;

    vec3 vn = normalize(normalMatrix * dir);
    float facing = vn.z;
    float fres = 1.0 - abs(facing);

    float sparkle = step(0.968, aSeed.w);
    float size = shell * (0.95 + 0.7 * aSeed.y) + inner * (0.55 + 0.5 * aSeed.y) + halo * (0.7 + 0.7 * aSeed.y);
    size *= 1.0 + sparkle * 1.7;
    gl_PointSize = uSize * size * uPixelRatio * (9.0 / -mv.z);

    // Colour: cyan where the light enters, blue body, violet with cognition.
    float diag = 0.5 + 0.5 * dot(dir, VIOLET_DIR);
    vec3 c = mix(C_CYAN, C_BLUE, smoothstep(0.15, 0.75, diag));
    c = mix(c, C_VIOLET, smoothstep(0.6, 1.0, diag) * clamp(0.3 + uViolet, 0.0, 1.0) * (shell + halo));
    c = mix(c, mix(C_VIOLET, C_LILAC, aSeed.z), inner * uViolet * (0.35 + 0.65 * aSeed.z));
    c = mix(c, C_WHITE, sparkle * 0.55);

    float alpha =
        shell * (0.3 + 0.75 * pow(fres, 2.0)) * mix(0.3, 1.0, step(0.0, facing))
      + inner * (0.16 + 0.55 * uDepth) * (0.4 + 0.6 * aSeed.z)
      + halo * (0.1 + 0.3 * uListen * uEnergy) * (0.35 + 0.65 * aSeed.x);

    alpha *= 0.72 + 0.28 * sin(t * (0.5 + aSeed.z * 1.3) + aSeed.x * 40.0);
    alpha *= 1.0 + sparkle * 1.3;
    alpha *= 1.0 + speak * 0.7 * smoothstep(0.2, 1.0, wave);
    alpha *= 1.0 + uListen * (0.35 + 1.2 * uEnergy) * smoothstep(0.82, 1.0, ripple) * shell;

    vColor = c;
    vAlpha = alpha * uGlow;
  }
`

export const particleFragment = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float core = pow(smoothstep(0.5, 0.0, d), 2.0);
    if (core < 0.01) discard;
    gl_FragColor = vec4(vColor, core * vAlpha);
  }
`

/** Shared by orbits and filaments: parametric lines with travelling light. */
export const lineVertex = /* glsl */ `
  attribute float aT;
  attribute float aId;
  varying float vT;
  varying float vId;
  varying float vDepth;
  void main() {
    vT = aT;
    vId = aId;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vec4 centre = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    vDepth = mv.z - centre.z;
    gl_Position = projectionMatrix * mv;
  }
`

export const orbitFragment = /* glsl */ `
  ${palette}
  uniform float uHead;
  uniform float uAlpha;
  uniform float uViolet;
  uniform vec3 uTint;
  varying float vT;
  varying float vDepth;
  void main() {
    float behind = smoothstep(0.4, -0.6, vDepth);
    float trail = fract(uHead - vT);
    float comet = pow(1.0 - trail, 14.0) * 0.9;
    vec3 c = mix(uTint, C_VIOLET, uViolet * (0.5 + 0.5 * sin(vT * 6.2831)));
    float a = (uAlpha * (0.55 + 0.45 * sin(vT * 12.566 + 1.0) * 0.5) + comet * uAlpha * 3.0) * mix(1.0, 0.28, behind);
    gl_FragColor = vec4(c, a);
  }
`

export const nodeVertex = /* glsl */ `
  uniform float uHead;
  uniform float uRx;
  uniform float uRy;
  uniform float uSize;
  uniform float uPixelRatio;
  varying float vDepth;
  void main() {
    float a = uHead * 6.2831853;
    vec3 p = vec3(cos(a) * uRx, sin(a) * uRy, 0.0);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vec4 centre = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    vDepth = mv.z - centre.z;
    gl_Position = projectionMatrix * mv;
    gl_PointSize = uSize * uPixelRatio * (9.0 / -mv.z);
  }
`

export const nodeFragment = /* glsl */ `
  uniform vec3 uTint;
  uniform float uAlpha;
  varying float vDepth;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float core = pow(smoothstep(0.5, 0.0, d), 3.0);
    float halo = smoothstep(0.5, 0.1, d) * 0.25;
    float behind = smoothstep(0.4, -0.6, vDepth);
    float a = (core + halo) * uAlpha * mix(1.0, 0.15, behind);
    if (a < 0.004) discard;
    gl_FragColor = vec4(mix(uTint, vec3(1.0), core * 0.6), a);
  }
`

export const filamentFragment = /* glsl */ `
  ${palette}
  uniform float uTime;
  uniform float uAlpha;
  uniform float uPulse;
  uniform float uViolet;
  uniform vec3 uTint;
  varying float vT;
  varying float vId;
  varying float vDepth;
  void main() {
    float ends = sin(vT * 3.14159);
    float speed = 0.06 + fract(vId * 0.618) * 0.07;
    float head = fract(uTime * speed + vId * 0.37);
    float pulse = exp(-pow((vT - head) * 9.0, 2.0));
    float behind = smoothstep(0.3, -0.5, vDepth);
    vec3 c = mix(uTint, C_VIOLET, uViolet * fract(vId * 0.47 + 0.3));
    c = mix(c, C_WHITE, pulse * 0.35);
    float a = (uAlpha * ends + pulse * uPulse * ends) * mix(1.0, 0.22, behind);
    gl_FragColor = vec4(c, a);
  }
`

/** The faint glass skin: dark centre, light gathering at the rim. */
export const skinVertex = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vWorldNormal;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

export const skinFragment = /* glsl */ `
  ${palette}
  uniform float uGlow;
  uniform float uViolet;
  uniform float uSpeak;
  uniform float uDepth;
  varying vec3 vNormal;
  varying vec3 vWorldNormal;
  void main() {
    float facing = clamp(vNormal.z, 0.0, 1.0);
    float rim = pow(1.0 - facing, 3.2);
    float diag = 0.5 + 0.5 * dot(vWorldNormal, VIOLET_DIR);
    vec3 rimColor = mix(C_CYAN, C_BLUE, smoothstep(0.0, 0.85, diag));
    rimColor = mix(rimColor, C_LILAC, smoothstep(0.62, 1.0, diag) * clamp(0.35 + uViolet, 0.0, 1.0));
    // Interior tint: deep blue, turning violet with cognitive depth.
    // Cyan lives only at the rim; the body stays deep blue so it reads as glass, not a planet.
    vec3 bodyTint = mix(C_BLUE, C_DEEP, smoothstep(0.0, 0.9, diag));
    bodyTint = mix(bodyTint, C_VIOLET, smoothstep(0.4, 1.1, diag) * clamp(0.3 + uViolet, 0.0, 1.0));
    float bodyFall = 0.05 + 0.09 * pow(1.0 - facing, 1.8);
    vec3 body = bodyTint * bodyFall * (1.0 + 0.6 * uDepth);
    // Speech energy begins at the centre of the disc.
    float core = pow(facing, 5.0) * uSpeak;
    vec3 col = rimColor * rim * 0.55 + body + mix(C_CYAN, C_WHITE, 0.4) * core * 0.16;
    gl_FragColor = vec4(col * uGlow, 1.0);
  }
`

/** Soft volumetric bloom painted on a camera-facing quad behind the Orb. */
export const glowVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

export const glowFragment = /* glsl */ `
  ${palette}
  uniform float uGlow;
  uniform float uViolet;
  uniform float uRadius; // orb radius in quad-uv units (0..0.5)
  uniform float uSpeak;
  varying vec2 vUv;
  void main() {
    vec2 p = (vUv - 0.5) * 2.0;
    float d = length(p);
    float r = uRadius * 2.0;
    float bloom = exp(-pow(max(d - r * 0.92, 0.0) / (r * 0.55), 1.35) * 2.2);
    float wide = exp(-pow(d / (r * 2.2), 2.0)) * 0.35;
    float fadeEdge = smoothstep(1.0, 0.62, d);
    float diag = 0.5 + 0.5 * dot(normalize(vec3(p, 0.001)), VIOLET_DIR);
    vec3 c = mix(C_CYAN, C_DEEP, smoothstep(0.2, 0.7, diag));
    c = mix(c, C_VIOLET, smoothstep(0.55, 1.0, diag) * clamp(0.25 + uViolet, 0.0, 1.0));
    // Behind the glass the bloom is deep blue; the cyan only spills outside the rim.
    float rimZone = smoothstep(r * 0.75, r * 1.05, d);
    c = mix(mix(C_DEEP, C_BLUE, 0.35), c, rimZone);
    float inside = mix(0.95, 1.0, rimZone);
    float a = (bloom * 0.2 + wide * 0.24) * inside * fadeEdge * (uGlow + uSpeak * 0.25);
    gl_FragColor = vec4(c, a);
  }
`
