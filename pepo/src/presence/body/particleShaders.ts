import { fathiRig, helpers, palette } from '../glsl'

/**
 * One particle system, two bodies. Every particle knows where it lives in
 * the Orb (`position`) and where it lives in the Avatar (`aFace`). `uMorph`
 * carries each one along its own curved path between the two, so the
 * Orb ↔ Avatar transformation is physically continuous.
 */
export const bodyVertex = /* glsl */ `
  ${palette}
  ${helpers}
  ${fathiRig}

  uniform float uTime;
  uniform float uRot;
  uniform float uFlow;
  uniform float uScale;
  uniform float uOrbBreath;
  uniform float uConverge;
  uniform float uDepth;
  uniform float uViolet;
  uniform float uListen;
  uniform float uSpeak;
  uniform float uEnergy;
  uniform float uGlow;
  uniform float uSize;
  uniform float uPixelRatio;
  uniform float uMorph;
  uniform mat3 uOrbTilt;
  uniform float uFaceGain;

  attribute vec4 aSeed;
  attribute float aKind;     // orb: 0 shell, 1 inner, 2 halo, 3 latent (hidden in the Orb)
  attribute vec3 aAxis;
  attribute vec3 aFace;      // avatar position (FATHI units)
  attribute vec3 aFaceN;     // avatar relief normal
  attribute float aFaceKind; // avatar: 0 cool line work … 1 warm (mask)
  attribute float aFaceW;    // avatar: artwork weight

  varying vec3 vColor;
  varying float vAlpha;

  // ── Orb body ──────────────────────────────────────────────
  void orbBody(out vec4 mv, out vec3 color, out float alpha, out float size) {
    float shell = 1.0 - step(0.5, aKind);
    float inner = step(0.5, aKind) * (1.0 - step(1.5, aKind));
    float halo  = step(1.5, aKind) * (1.0 - step(2.5, aKind));
    float latent = step(2.5, aKind);
    shell += latent;
    float t = uTime;

    vec3 p = position;
    vec3 drift = sin(vec3(0.21, 0.17, 0.19) * t + aSeed.xyz * 6.2831);
    p += drift * (0.005 * shell + 0.018 * inner + 0.05 * halo);
    p = rotateAxis(p, aAxis, uFlow * inner * (0.35 + aSeed.x));
    float a = uRot * (shell + 1.4 * inner + 0.55 * halo);
    float ca = cos(a), sa = sin(a);
    p.xz = mat2(ca, -sa, sa, ca) * p.xz;

    float r = length(p);
    vec3 dir = p / max(r, 1e-4);
    float breath = sin(t * 6.2831 / 6.0);
    r *= 1.0 + uOrbBreath * breath * (shell + 0.6 * inner + 1.5 * halo);
    r *= 1.0 - uConverge * (shell + 0.4 * inner + 2.6 * halo);
    float ripple = sin(dir.y * 8.0 - t * 2.6 + dir.x * 1.5);
    r += uListen * uEnergy * (halo * (0.10 + 0.07 * ripple) + shell * 0.022 * ripple);
    float wave = sin(r * 7.0 - t * 4.0);
    float speak = uSpeak * uEnergy;
    r += speak * 0.028 * wave * (shell + halo);

    p = uOrbTilt * (dir * r * uScale);
    dir = uOrbTilt * dir;
    p.z += uListen * 0.07 * (0.5 + 0.5 * dir.z);

    mv = modelViewMatrix * vec4(p, 1.0);
    vec3 vn = normalize(normalMatrix * dir);
    float facing = vn.z;
    float fres = 1.0 - abs(facing);

    float sparkle = step(0.968, aSeed.w);
    size = shell * (0.95 + 0.7 * aSeed.y) + inner * (0.55 + 0.5 * aSeed.y) + halo * (0.7 + 0.7 * aSeed.y);
    size *= 1.0 + sparkle * 1.7;

    float diag = 0.5 + 0.5 * dot(dir, VIOLET_DIR);
    color = mix(C_CYAN, C_BLUE, smoothstep(0.15, 0.75, diag));
    color = mix(color, C_VIOLET, smoothstep(0.6, 1.0, diag) * clamp(0.3 + uViolet, 0.0, 1.0) * (shell + halo));
    color = mix(color, mix(C_VIOLET, C_LILAC, aSeed.z), inner * uViolet * (0.35 + 0.65 * aSeed.z));
    color = mix(color, C_WHITE, sparkle * 0.55);

    alpha =
        shell * (0.2 + 0.22 * pow(fres, 3.0)) * mix(0.28, 1.0, step(0.0, facing))
      + inner * (0.14 + 0.55 * uDepth) * (0.4 + 0.6 * aSeed.z)
      + halo * (0.1 + 0.3 * uListen * uEnergy) * (0.35 + 0.65 * aSeed.x);
    alpha *= 0.72 + 0.28 * sin(t * (0.5 + aSeed.z * 1.3) + aSeed.x * 40.0);
    alpha *= 1.0 + sparkle * 1.3;
    alpha *= 1.0 + speak * 0.7 * smoothstep(0.2, 1.0, wave);
    alpha *= 1.0 + uListen * (0.35 + 1.2 * uEnergy) * smoothstep(0.82, 1.0, ripple) * shell;
    alpha *= 1.0 - latent;
  }

  // ── Avatar body: FATHI ─────────────────────────────────────
  void faceBody(out vec4 mv, out vec3 color, out float alpha, out float size) {
    vec3 bind = aFace;
    float warm = aFaceKind;
    vec3 p = rigPosition(bind, warm);
    mv = modelViewMatrix * vec4(faceToWorld(p), 1.0);

    // The relief turns with the head, so its light moves with it.
    float headW = smoothstep(-1.35, -.48, bind.y);
    vec3 n = normalize(aFaceN + vec3(uHead.x, -uHead.y, 0.0) * headW * vec3(1.0, 1.0, 0.0));
    vec3 light = reliefLight(n);

    float depth = smoothstep(-0.3, 0.45, bind.z);
    vec2 finish = finishAt(bind, warm);
    float lip = lipTrace(bind) * warm;
    float speechGlow = (1.0 + uJaw * .06 * warm) * mix(uPresence.x, uPresence.y, warm);
    float shade = 0.4 + 0.85 * light.x + 0.45 * light.z + 0.5 * light.y;
    // The mask glows: FATHI's radiant orange carries more light than the line work.
    alpha = aFaceW * (0.5 + 0.5 * depth) * uFaceGain * shade * (1.0 + 0.7 * warm) * smoothstep(-1.96, -1.74, bind.y)
          * finish.x * speechGlow * (1.0 + lip * (.65 + uJaw * .22));
    color = avatarColor(bind, finish.y, lip, light);
    // Full-density artwork: fine points, like a high-resolution drawing.
    size = 0.55 + 0.22 * aSeed.y;
  }

  void main() {
    vec4 mvOrb, mvFace;
    vec3 cOrb, cFace;
    float alphaOrb, alphaFace, sizeOrb, sizeFace;
    orbBody(mvOrb, cOrb, alphaOrb, sizeOrb);

    float e = 0.0;
    vec4 mv = mvOrb;
    vec3 color = cOrb;
    float alpha = alphaOrb;
    float size = sizeOrb;

    if (uMorph > 0.0001) {
      faceBody(mvFace, cFace, alphaFace, sizeFace);
      // Each particle leaves on its own schedule; the crown forms first.
      float height = clamp(aFace.y * 0.55 + 0.7, 0.0, 1.0);
      float delay = aSeed.y * 0.5 + (1.0 - height) * 0.25;
      float lp = clamp((uMorph * 1.6 - delay) / 0.85, 0.0, 1.0);
      e = lp * lp * (3.0 - 2.0 * lp);
      float mid = sin(3.14159 * e);

      vec3 p = mix(mvOrb.xyz, mvFace.xyz, e);
      // Dissolve into a loose swirl of light, then condense into the face.
      vec3 centre = (modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
      vec3 rel = p - centre;
      float ang = mid * (0.6 + aSeed.z * 0.8) * (aSeed.x > 0.5 ? 1.0 : -1.0);
      float c = cos(ang), s = sin(ang);
      rel.xz = mat2(c, -s, s, c) * rel.xz;
      rel += normalize(rel + 1e-4) * mid * (0.18 + 0.32 * aSeed.w);
      rel += (aSeed.xyz - 0.5) * mid * 0.28;
      mv = vec4(centre + rel, 1.0);

      color = mix(cOrb, cFace, e);
      alpha = mix(alphaOrb, alphaFace, e) * (1.0 + mid * 0.5);
      size = mix(sizeOrb, sizeFace, e);
    }

    vAlpha = alpha * uGlow;
    if (vAlpha < 0.002) {
      // Invisible (latent Orb particles): skip rasterising entirely.
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      gl_PointSize = 0.0;
      return;
    }
    gl_Position = projectionMatrix * mv;
    gl_PointSize = uSize * size * uPixelRatio * (9.0 / -mv.z);
    vColor = color;
  }
`

export const bodyFragment = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float core = pow(smoothstep(0.5, 0.0, d), 2.0);
    if (core * vAlpha < 0.004) discard;
    gl_FragColor = vec4(vColor, core * vAlpha);
  }
`
