import { noise, palette } from '../glsl'
import { ribbonProfile } from '../lines'

/**
 * GLSL for the Orb's light: an energy volume (no glass), its localized
 * glow, the field filaments inside it, the orbit and a few active points.
 * Rim colour and edge energy are computed in view space, so they behave like
 * lighting (stable while the Orb turns), not like a texture.
 */

/** Screen-space angle helpers for "light from the lower left, violet upper right". */
const lightRig = /* glsl */ `
  vec3 rimLight(vec2 sn, float violet) {
    float ur = 0.5 + 0.5 * dot(sn, VIOLET_DIR2);
    float top = 0.5 + 0.5 * sn.y;
    vec3 c = mix(C_CYAN, C_BLUE, smoothstep(0.06, 0.42, ur));
    c = mix(c, C_LILAC, smoothstep(0.62, 0.97, ur) * clamp(0.3 + violet * 0.6, 0.0, 1.0));
    c = mix(c, C_WHITE, smoothstep(0.88, 1.0, top) * 0.12);
    return c;
  }
`

export const skinVertex = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vPos;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vPos = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

export const skinFragment = /* glsl */ `
  ${palette}
  ${noise}
  ${lightRig}
  uniform float uGlow;
  uniform float uViolet;
  uniform float uSpeak;
  uniform float uDepth;
  uniform float uFade;
  uniform float uTime;
  uniform float uBreath;   // -1..1 (orbMotion.ts)
  uniform float uListen;
  uniform float uEmphasis; // 0..1, a semantic cue
  uniform float uLight;    // 1 on the light theme
  varying vec3 vNormal;
  varying vec3 vPos;

  float gaussF(float d, float s) { return exp(-(d * d) / (s * s)); }

  void main() {
    float facing = clamp(vNormal.z, 0.0, 1.0);
    vec2 sn = normalize(vNormal.xy + 1e-5);
    float rho = clamp(length(vNormal.xy), 0.0, 1.0); // 0 at the centre, 1 at the silhouette
    float edge = 1.0 - facing;

    // An energy volume, not glass: the boundary exists because the field
    // gathers there, unevenly. Breath moves the edge energy, not the size.
    float energy = edgeEnergy(sn, uTime) * (1.0 + 0.12 * uBreath);
    vec3 rim = rimLight(sn, uViolet);
    vec3 col = rim * (pow(edge, 2.8) * 0.6 + pow(edge, 10.0) * 0.55) * energy;

    // Mid volume: deep blue, cyan gathering lower left, violet depth upper right.
    vec3 body = mix(C_DEEP, C_BLUE, 0.3) * (0.1 + 0.3 * pow(edge, 1.5));
    body += C_SKY * smoothstep(0.0, 1.0, dot(sn, vec2(-0.62, -0.78))) * pow(rho, 1.3) * 0.2 * energy;
    body += C_VIOLET * smoothstep(0.2, 1.0, dot(sn, VIOLET_DIR2)) * rho * (0.04 + 0.12 * uViolet);
    // A slow inner nebula, drifting on its own.
    float neb = smoothstep(0.36, 0.78, fbm3(vPos * 1.9 + vec3(0.0, uTime * 0.02, uTime * 0.013)));
    body += mix(C_BLUE, C_VIOLET, clamp(0.12 + uViolet * 0.7, 0.0, 1.0)) * neb * (0.22 + 0.12 * uDepth) * (0.5 + 0.5 * rho);

    // Deep core: a diffuse concentration that changes density slowly. Never a dot.
    // Slightly off-centre, toward the light, so it never reads as a target.
    float core = gaussF(length(vNormal.xy - vec2(-0.06, -0.04)), 0.46) * (0.45 + 0.55 * fbm3(vPos * 2.6 + vec3(uTime * 0.03, 0.0, -uTime * 0.02)));
    float coreLevel = 0.2 + 0.05 * uBreath + 0.12 * uSpeak + 0.06 * uDepth;
    body += mix(C_BLUE, C_SKY, 0.5) * core * coreLevel;
    col += body;

    // Listening: a few tiny cyan impulses travel inward from the edge.
    if (uListen > 0.01) {
      float impulse = 0.0;
      for (int i = 0; i < 3; i++) {
        float fi = float(i);
        float cyc = uTime * 0.3 + fi * 0.37;
        float ph = fract(cyc);
        float ang = 6.2831 * hash3(vec3(floor(cyc), fi, 4.0));
        float across = gaussF(1.0 - dot(sn, vec2(cos(ang), sin(ang))), 0.0009);
        // A small point with a short trail behind it (toward the edge).
        float d = rho - (1.0 - ph * 0.75);
        float along = d < 0.0 ? gaussF(d, 0.009) : exp(-d / 0.05);
        impulse += across * along * sin(ph * 3.1416);
      }
      col += C_CYAN * impulse * 0.5 * uListen;
    }

    // Emphasis: one small, local highlight where the energy happens to be.
    vec2 ed = vec2(cos(uTime * 0.11 + 1.3), sin(uTime * 0.11 + 1.3)) * 0.42;
    vec2 dv = vNormal.xy - ed;
    col += mix(C_SKY, C_WHITE, 0.25) * exp(-dot(dv, dv) / 0.025) * uEmphasis * 0.6;

    // Where the field meets the horizon: a faint cyan touch, no flare.
    col += C_SKY * smoothstep(0.88, 1.0, -sn.y) * pow(edge, 10.0) * 0.1;

    // On a pale sky the volume lets some of the sky through and leans to
    // blue, so it reads as luminous energy rather than a dark disc.
    col += mix(C_DEEP * 0.45, C_BLUE, pow(edge, 1.3)) * uLight * (0.18 + 0.34 * edge);
    float cover = mix(0.92, 0.84, uLight);
    gl_FragColor = vec4(col * uGlow * uFade, cover * uFade);
  }
`

export const glowVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

export const glowFragment = /* glsl */ `
  ${palette}
  ${noise}
  ${lightRig}
  uniform float uGlow;
  uniform float uViolet;
  uniform float uRadius;  // orb radius as a fraction of the quad (0..0.5)
  uniform float uSpeak;
  uniform float uFade;    // 1 = Orb, lower while PEPO wears its face
  uniform float uTime;
  varying vec2 vUv;
  void main() {
    vec2 p = (vUv - 0.5) * 2.0;
    float d = length(p);
    float r = uRadius * 2.0;
    vec2 sn = p / max(d, 1e-4);
    float outside = max(d - r, 0.0);
    // Localized glow: only where the edge carries energy; no halo around it all.
    float energy = edgeEnergy(sn, uTime);
    float bloom = exp(-outside / (r * 0.05)) * step(r * 0.985, d);
    float halo = exp(-outside / (r * 0.28)) * smoothstep(r * 0.985, r * 1.0, d);
    float orb = uFade;
    float a = (bloom * 0.3 + halo * 0.12) * energy * energy * orb;
    vec3 col = rimLight(sn, uViolet);
    // A faint cyan light on the water line beneath it.
    float flare = exp(-pow(p.x / (r * 0.3), 2.0) - pow((p.y + r * 1.01) / (r * 0.035), 2.0));
    col = mix(col, C_SKY, clamp(flare * 2.0, 0.0, 1.0));
    a += flare * 0.12 * orb;
    a *= smoothstep(1.0, 0.7, d) * (uGlow + uSpeak * 0.15);
    gl_FragColor = vec4(col, a);
  }
`

/**
 * Field filaments: a few curved paths through the volume, shaped like
 * magnetic field lines. Each emerges from the core, arcs out and returns,
 * fades in and out on its own slow cycle, and dims and softens when it
 * passes behind the centre.
 */
export const streamFragment = /* glsl */ `
  ${palette}
  ${ribbonProfile}
  uniform float uTime;
  uniform float uAlpha;
  uniform float uPulse;
  uniform float uViolet;
  uniform float uFade;
  varying float vT;
  varying float vId;
  varying float vSide;
  varying float vDepth;
  varying vec2 vView;
  void main() {
    float ends = smoothstep(0.0, 0.2, vT) * smoothstep(1.0, 0.8, vT);
    // Emerge, fade, reconnect: each path has its own slow life.
    float life = smoothstep(-0.4, 0.75, sin(uTime * 0.05 + vId * 2.4));
    float speed = 0.03 + fract(vId * 0.618) * 0.035;
    float head = fract(uTime * speed + vId * 0.37);
    float pulse = exp(-pow((vT - head) * 7.0, 2.0));
    float behind = smoothstep(0.2, -0.5, vDepth);

    vec2 dir = normalize(vView + 1e-4);
    float ur = 0.5 + 0.5 * dot(dir, VIOLET_DIR2);
    vec3 c = mix(C_BLUE, C_SKY, 0.3 + 0.4 * sin(vT * 3.1416 + vId));
    c = mix(c, C_CYAN, smoothstep(0.45, 0.05, ur) * 0.6);
    c = mix(c, C_LILAC, smoothstep(0.65, 0.97, ur) * clamp(0.2 + uViolet, 0.0, 1.0));
    c = mix(c, C_WHITE, pulse * 0.25);

    float a = (uAlpha * (0.5 + 0.5 * sin(vT * 3.1416)) + pulse * uPulse) * ends * life * mix(1.15, 0.28, behind);
    gl_FragColor = vec4(c, a * ribbonProfile(vSide) * uFade);
  }
`

export const orbitFragment = /* glsl */ `
  ${palette}
  ${ribbonProfile}
  uniform float uHead;
  uniform float uAlpha;
  uniform float uViolet;
  uniform float uFade;
  uniform vec3 uTint;
  uniform vec3 uTint2;
  varying float vT;
  varying float vSide;
  varying float vDepth;
  varying vec2 vView;
  void main() {
    float behind = smoothstep(0.3, -0.5, vDepth);
    // Gone where it passes behind the Orb; a little clearer in front of it.
    float occluded = behind * smoothstep(1.06, 0.97, length(vView));
    float trail = fract(uHead - vT);
    float comet = pow(1.0 - trail, 12.0);
    // Never the whole ring at once: stretches fade in and out as it travels.
    float seen = 0.12 + 0.88 * smoothstep(-0.25, 0.75, sin((vT - uHead * 0.35) * 6.2831 + 0.9));
    vec3 c = mix(uTint, uTint2, 0.5 + 0.5 * sin(vT * 6.2831 + 0.8));
    c = mix(c, C_VIOLET, uViolet * 0.25);
    c = mix(c, C_WHITE, comet * 0.35);
    float a = (uAlpha * seen + comet * uAlpha * 1.4) * mix(1.15, 0.4, behind) * (1.0 - occluded);
    gl_FragColor = vec4(c, a * ribbonProfile(vSide) * uFade);
  }
`

/** A few active points of light inside the volume (no flare, no glint). */
export const starVertex = /* glsl */ `
  attribute float aSeed;
  uniform float uTime;
  uniform float uSize;
  uniform float uPixelRatio;
  varying float vDepth;
  varying float vTwinkle;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vec4 centre = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    vDepth = mv.z - centre.z;
    vTwinkle = 0.65 + 0.35 * sin(uTime * (0.6 + aSeed) + aSeed * 40.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = uSize * (0.75 + aSeed * 0.5) * uPixelRatio * (9.0 / -mv.z);
  }
`

export const starFragment = /* glsl */ `
  ${palette}
  uniform float uAlpha;
  uniform vec3 uTint;
  varying float vDepth;
  varying float vTwinkle;
  void main() {
    vec2 p = gl_PointCoord - 0.5;
    float d = length(p);
    float core = pow(smoothstep(0.16, 0.0, d), 1.5);
    float halo = pow(smoothstep(0.5, 0.0, d), 3.0) * 0.35;
    float behind = smoothstep(0.3, -0.5, vDepth);
    float a = (core + halo) * uAlpha * vTwinkle * mix(1.0, 0.15, behind);
    if (a < 0.004) discard;
    gl_FragColor = vec4(mix(uTint, C_WHITE, core * 0.45), a);
  }
`
