import { palette } from '../glsl'
import { ribbonProfile } from '../lines'

/**
 * GLSL for the Orb's light: glass skin, bloom, inner light streams,
 * orbits and star nodes. Rim colour is computed in view space, so it
 * behaves like lighting (stable while the Orb turns), not like a texture.
 */

/** Screen-space angle helpers for "light from the lower left, violet upper right". */
const lightRig = /* glsl */ `
  vec3 rimLight(vec2 sn, float violet) {
    float ur = 0.5 + 0.5 * dot(sn, VIOLET_DIR2);
    float top = 0.5 + 0.5 * sn.y;
    vec3 c = mix(C_CYAN, C_BLUE, smoothstep(0.15, 0.62, ur));
    c = mix(c, C_LILAC, smoothstep(0.55, 0.95, ur) * clamp(0.55 + violet * 0.6, 0.0, 1.0));
    c = mix(c, C_WHITE, smoothstep(0.82, 1.0, top) * 0.55);
    return c;
  }
`

export const skinVertex = /* glsl */ `
  varying vec3 vNormal;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

export const skinFragment = /* glsl */ `
  ${palette}
  ${lightRig}
  uniform float uGlow;
  uniform float uViolet;
  uniform float uSpeak;
  uniform float uDepth;
  uniform float uFade;
  varying vec3 vNormal;
  void main() {
    float facing = clamp(vNormal.z, 0.0, 1.0);
    vec2 sn = normalize(vNormal.xy + 1e-5);
    float edge = 1.0 - facing;
    float rimSoft = pow(edge, 3.2);
    float rimHard = pow(edge, 14.0);

    vec3 rim = rimLight(sn, uViolet);
    // The glass: dark at the heart, blue light gathering towards the rim.
    vec3 body = mix(C_DEEP, C_BLUE, 0.3) * (0.035 + 0.3 * pow(edge, 1.6)) * (1.0 + 0.5 * uDepth);
    float inner = smoothstep(0.2, 1.0, dot(sn, normalize(vec2(-0.62, -0.78)))) * pow(edge, 1.1);
    body += C_SKY * inner * 0.22;
    body += C_VIOLET * 0.1 * uViolet * smoothstep(0.3, 1.0, dot(sn, VIOLET_DIR2)) * edge;
    // The point where the Orb meets the horizon catches the most light.
    float contact = smoothstep(0.86, 1.0, -sn.y) * rimHard;

    vec3 col = body + rim * (rimSoft * 0.62 + rimHard * 1.15) + C_WHITE * contact * 0.35;
    col += mix(C_CYAN, C_WHITE, 0.4) * pow(facing, 5.0) * uSpeak * 0.18;
    // Alpha lets the glass hold back the landscape behind it, and lets go
    // completely when PEPO wears its face.
    gl_FragColor = vec4(col * uGlow * uFade / 0.85, 0.85 * uFade);
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
  ${lightRig}
  uniform float uGlow;
  uniform float uViolet;
  uniform float uRadius;  // orb radius as a fraction of the quad (0..0.5)
  uniform float uSpeak;
  uniform float uFade;    // 1 = Orb, lower while PEPO wears its face
  varying vec2 vUv;
  void main() {
    vec2 p = (vUv - 0.5) * 2.0;
    float d = length(p);
    float r = uRadius * 2.0;
    vec2 sn = p / max(d, 1e-4);
    float outside = max(d - r, 0.0);
    float bloom = exp(-outside / (r * 0.06)) * step(r * 0.985, d);
    float halo = exp(-outside / (r * 0.45)) * smoothstep(r * 0.985, r * 1.0, d);
    float wide = exp(-pow(d / (r * 2.1), 2.0));
    vec3 c = rimLight(sn, uViolet);
    vec3 deep = mix(C_DEEP, C_BLUE, 0.3);
    float orb = uFade;
    float a = bloom * 0.4 * orb + halo * 0.2 * orb + wide * (0.12 + 0.1 * orb);
    vec3 col = mix(deep, c, clamp(bloom + halo * 0.6, 0.0, 1.0) * orb);
    // Contact flare under the Orb.
    float flare = exp(-pow(p.x / (r * 0.42), 2.0) - pow((p.y + r * 1.01) / (r * 0.045), 2.0));
    col += C_WHITE * flare * 0.7 * orb;
    a += flare * 0.4 * orb;
    a *= smoothstep(1.0, 0.7, d) * (uGlow + uSpeak * 0.25);
    gl_FragColor = vec4(col, a);
  }
`

/** Light streams flowing inside the glass. */
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
    float ends = smoothstep(0.0, 0.18, vT) * smoothstep(1.0, 0.7, vT);
    float bands = 0.35 + 0.65 * pow(0.5 + 0.5 * sin(vT * (5.0 + fract(vId * 0.73) * 6.0) + vId * 2.1), 2.0);
    float speed = 0.05 + fract(vId * 0.618) * 0.06;
    float head = fract(uTime * speed + vId * 0.37);
    float pulse = exp(-pow((vT - head) * 8.0, 2.0));
    float behind = smoothstep(0.25, -0.45, vDepth);

    vec2 dir = normalize(vView + 1e-4);
    float ur = 0.5 + 0.5 * dot(dir, VIOLET_DIR2);
    vec3 c = mix(C_CYAN, C_SKY, smoothstep(0.25, 0.6, ur));
    c = mix(c, C_LILAC, smoothstep(0.62, 0.95, ur) * clamp(0.5 + uViolet, 0.0, 1.0));
    c = mix(c, C_WHITE, 0.15 + pulse * 0.5);

    float a = (uAlpha * bands + pulse * uPulse) * ends * mix(1.0, 0.18, behind);
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
    // Hidden behind the glass where the ring passes behind the Orb.
    float occluded = behind * smoothstep(1.08, 0.96, length(vView));
    float trail = fract(uHead - vT);
    float comet = pow(1.0 - trail, 10.0);
    float shimmer = 0.75 + 0.25 * sin(vT * 25.13 + 1.0);
    vec3 c = mix(uTint, uTint2, 0.5 + 0.5 * sin(vT * 6.2831 + 0.8));
    c = mix(c, C_VIOLET, uViolet * 0.35);
    c = mix(c, C_WHITE, comet * 0.6);
    float a = (uAlpha * shimmer + comet * uAlpha * 2.2) * mix(1.0, 0.45, behind) * (1.0 - occluded * 0.85);
    gl_FragColor = vec4(c, a * ribbonProfile(vSide) * uFade);
  }
`

/** Star nodes with a soft four-point glint. */
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
    float halo = pow(smoothstep(0.5, 0.0, d), 3.0) * 0.45;
    float glint = (exp(-abs(p.x) * 70.0) + exp(-abs(p.y) * 70.0)) * smoothstep(0.5, 0.05, d) * 0.5;
    float behind = smoothstep(0.3, -0.5, vDepth);
    float a = (core + halo + glint) * uAlpha * vTwinkle * mix(1.0, 0.12, behind);
    if (a < 0.004) discard;
    gl_FragColor = vec4(mix(uTint, C_WHITE, core * 0.7), a);
  }
`
