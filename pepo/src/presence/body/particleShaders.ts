import { facePose, helpers, palette } from '../glsl'

/**
 * One particle system, two bodies. Every particle knows where it lives in
 * the Orb (`position`) and where it lives in the Avatar (`aFace`). `uMorph`
 * carries each one along its own curved path between the two, so the
 * Orb ↔ Avatar transformation is physically continuous.
 */
export const bodyVertex = /* glsl */ `
  ${palette}
  ${helpers}
  ${facePose}

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
  uniform float uMorph;
  uniform mat3 uOrbTilt;
  uniform vec2 uGaze;

  attribute vec4 aSeed;
  attribute float aKind;     // orb: 0 shell, 1 inner, 2 halo, 3 latent (hidden in the Orb)
  attribute vec3 aAxis;
  attribute vec3 aFace;
  attribute vec3 aFaceN;
  attribute float aFaceKind; // avatar: 0 skin, 1 mask, 2 feature, 3 strand, 4 dust
  attribute float aFaceW;

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
    r *= 1.0 + uBreath * breath * (shell + 0.6 * inner + 1.5 * halo);
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
        shell * (0.22 + 0.42 * pow(fres, 3.0)) * mix(0.28, 1.0, step(0.0, facing))
      + inner * (0.14 + 0.55 * uDepth) * (0.4 + 0.6 * aSeed.z)
      + halo * (0.1 + 0.3 * uListen * uEnergy) * (0.35 + 0.65 * aSeed.x);
    alpha *= 0.72 + 0.28 * sin(t * (0.5 + aSeed.z * 1.3) + aSeed.x * 40.0);
    alpha *= 1.0 + sparkle * 1.3;
    alpha *= 1.0 + speak * 0.7 * smoothstep(0.2, 1.0, wave);
    alpha *= 1.0 + uListen * (0.35 + 1.2 * uEnergy) * smoothstep(0.82, 1.0, ripple) * shell;
    alpha *= 1.0 - latent;
  }

  // ── Avatar body ───────────────────────────────────────────
  void faceBody(out vec4 mv, out vec3 color, out float alpha, out float size) {
    float t = uTime;
    float skin = 1.0 - step(0.5, aFaceKind);
    float mask = step(0.5, aFaceKind) * (1.0 - step(1.5, aFaceKind));
    float feature = step(1.5, aFaceKind) * (1.0 - step(2.5, aFaceKind));
    float strand = step(2.5, aFaceKind) * (1.0 - step(3.5, aFaceKind));
    float dust = step(3.5, aFaceKind);

    vec3 f = aFace;
    vec3 n = aFaceN;

    // Microscopic drift keeps the cloud alive without blurring the form.
    f += sin(vec3(0.31, 0.23, 0.27) * t + aSeed.xyz * 6.2831) * (0.0018 + dust * 0.02);

    // Dust leaves the silhouette and fades, then quietly returns.
    float life = fract(t * (0.035 + 0.03 * aSeed.y) + aSeed.x);
    f += n * dust * life * 0.12;

    // Listening: the sides of the face, near the ears, respond to the voice.
    float ear = gauss(length(vec2(abs(f.x) - 0.36, f.y + 0.01)), 0.13);
    f += n * ear * uListen * uEnergy * 0.035 * (0.5 + 0.5 * sin(t * 9.0 + f.y * 30.0));

    // Speaking: a soft wave runs down the mask, nothing like lip sync.
    float mw = 0.5 + 0.5 * sin(f.y * 26.0 + t * 6.5);
    f += n * mask * uSpeak * uEnergy * 0.012 * mw;

    // Eye attention.
    float eye = gauss(length(vec2(abs(f.x) - 0.115, f.y - 0.033)), 0.05) * step(0.2, f.z);
    f.xy += uGaze * eye * 0.007;

    vec3 base = f;
    vec3 p = poseFace(f, n);
    mv = modelViewMatrix * vec4(p, 1.0);
    vec3 vn = normalize(normalMatrix * n);
    float facing = vn.z;
    float fres = 1.0 - abs(facing);

    float sparkle = step(0.975, aSeed.w) * (strand + feature) + step(0.993, aSeed.w) * mask;
    size = skin * (0.75 + 0.5 * aSeed.y) + mask * (0.8 + 0.4 * aSeed.y) + feature * 0.95
         + strand * (0.8 + 0.5 * aSeed.y) + dust * (0.6 + 0.6 * aSeed.y);
    size *= 1.0 + sparkle * 1.8;

    float rim = smoothstep(0.55, 1.0, fres);
    color = skin * mix(C_DEEP, C_SKY, 0.2 + 0.7 * rim)
          + mask * mix(mix(C_BLUE, C_LILAC, 0.5), C_WHITE, aFaceW * 0.35)
          + feature * mix(C_SKY, C_WHITE, 0.4)
          + strand * mix(C_SKY, C_DEEP, smoothstep(-0.6, -1.15, base.y))
          + dust * C_BLUE;
    color = mix(color, C_VIOLET, uViolet * 0.35 * (skin + dust));
    color = mix(color, C_WHITE, sparkle * 0.6);

    alpha = skin * (0.3 + 0.45 * aFaceW + 0.75 * rim * (1.0 - 0.6 * uDepth))
          + mask * (0.45 + 0.45 * aFaceW)
          + feature * 0.6
          + strand * 0.6
          + dust * 0.4 * (1.0 - life);

    // Thinking: the silhouette thins, the forehead and eyes gather light.
    float mind = gauss(length(vec2(base.x * 0.7, base.y - 0.13)), 0.2) * step(0.05, base.z);
    alpha *= 1.0 + uDepth * 0.9 * mind;
    alpha *= 1.0 - uDepth * 0.45 * rim * skin;
    // Listening and speaking brighten where the response lives.
    alpha *= 1.0 + ear * uListen * (0.3 + uEnergy);
    alpha *= 1.0 + mask * uSpeak * uEnergy * 0.6 * mw;

    alpha *= mix(0.16, 1.0, smoothstep(-0.25, 0.2, facing));
    alpha *= smoothstep(-1.15, -0.9, base.y);
    alpha *= 0.8 + 0.2 * sin(t * (0.7 + aSeed.z) + aSeed.x * 30.0);
    alpha *= 1.0 + sparkle * 1.2;
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
      size = mix(sizeOrb, sizeFace * 0.78, e);
    }

    gl_Position = projectionMatrix * mv;
    gl_PointSize = uSize * size * uPixelRatio * (9.0 / -mv.z);
    vColor = color;
    vAlpha = alpha * uGlow;
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
