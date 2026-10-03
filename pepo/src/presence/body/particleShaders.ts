import { helpers, noise, palette } from '../glsl'

/** The Orb's particles: boundary, volume and core, and a few outer motes, all animated on the GPU. */
export const bodyVertex = /* glsl */ `
  ${palette}
  ${helpers}
  ${noise}

  uniform float uTime;
  uniform float uRot;
  uniform float uFlow;
  uniform float uScale;
  uniform float uOrbBreath;
  uniform float uBreathWave; // -1..1, varied cycle length (orbMotion.ts)
  uniform float uConverge;
  uniform float uDepth;
  uniform float uViolet;
  uniform float uListen;
  uniform float uSpeak;
  uniform float uEnergy;
  uniform float uGlow;
  uniform float uSize;
  uniform float uPixelRatio;
  uniform mat3 uOrbTilt;
  uniform float uOpacity;
  uniform float uSwirl;      // the filaments' drift (same as their ribbons)
  uniform vec3 uSwirlAxis;
  uniform vec3 uCoreOffset;  // where the core currently gathers (slowly wanders)
  uniform float uActivity;

  attribute vec4 aSeed;
  attribute float aKind;     // 0 shell, 1 inner, 2 halo
  attribute vec3 aAxis;
  attribute float aLine;     // which filament this particle follows (-1: none)

  varying vec3 vColor;
  varying float vAlpha;
  varying float vSoft;

  // ── Orb body ──────────────────────────────────────────────
  void orbBody(out vec4 mv, out vec3 color, out float alpha, out float size, out float soft) {
    float shell = 1.0 - step(0.5, aKind);
    float inner = step(0.5, aKind) * (1.0 - step(1.5, aKind));
    float halo  = step(1.5, aKind);
    float t = uTime;

    vec3 p = position;
    float r0 = length(p);
    float onLine = inner * step(-0.5, aLine);
    float coreW = inner * (1.0 - onLine) * (1.0 - smoothstep(0.24, 0.3, r0));
    float loose = inner * (1.0 - onLine) * (1.0 - coreW);
    vec3 drift = sin(vec3(0.21, 0.17, 0.19) * t + aSeed.xyz * 6.2831);
    p += drift * (0.004 * shell + 0.012 * inner + 0.03 * halo);
    // No layer turns as one body. Flow particles drift with their filament;
    // the core turns slowly on its own axes and tightens while thinking; the
    // loose clusters wander in depth. The boundary itself stays put.
    p = rotateAxis(p, uSwirlAxis, uSwirl * (0.55 + 0.9 * fract(aLine * 0.618 + 0.21)) * onLine);
    p = rotateAxis(p, aAxis, (t * 0.03 + uFlow * 0.6) * coreW * (0.4 + aSeed.x));
    p *= 1.0 - coreW * 0.22 * uActivity;
    p = rotateAxis(p, aAxis, (t * 0.018 + uFlow) * loose * (0.3 + aSeed.x));

    float r = length(p);
    vec3 dir = p / max(r, 1e-4);
    float breath = uBreathWave;
    r *= 1.0 + uOrbBreath * breath * (shell + 0.6 * inner);
    r *= 1.0 - uConverge * (shell + 0.4 * inner + 1.6 * halo);
    // Listening: the outer motes drift in toward the boundary, one after another.
    float inward = fract(t * 0.22 + aSeed.x);
    r = mix(r, mix(r, 1.04, inward), halo * uListen);

    p = uOrbTilt * (dir * r * uScale) + uCoreOffset * coreW;
    dir = uOrbTilt * dir;

    mv = modelViewMatrix * vec4(p, 1.0);
    vec3 vn = normalize(normalMatrix * dir);
    float facing = vn.z;
    float fres = 1.0 - abs(facing);
    // The far side: smaller, dimmer, softer. The near side: a touch sharper.
    float far = smoothstep(0.15, -0.55, (mv.z - (modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0)).z) / max(uScale, 0.5));
    soft = far;

    // Brightness tiers: most are barely there, some define the volume, few are
    // active, and those only on the near side (the front layer is sparse and crisp).
    float bright = step(0.93, aSeed.w) * (1.0 - far);
    float faint = 1.0 - step(0.56, aSeed.w);
    float tier = mix(1.0, 0.32, faint) * (1.0 + bright * 1.2);
    size = shell * (0.9 + 0.6 * aSeed.y) + inner * (0.55 + 0.5 * aSeed.y) + halo * (0.6 + 0.5 * aSeed.y);
    size *= mix(1.0, 0.75, faint) * (1.0 + bright * 0.7) * mix(1.0, 0.72, far) * (1.0 + coreW * 0.3);

    float diag = 0.5 + 0.5 * dot(dir, VIOLET_DIR);
    color = mix(C_CYAN, C_BLUE, smoothstep(0.08, 0.5, diag));
    color = mix(color, C_VIOLET, smoothstep(0.72, 1.0, diag) * clamp(0.15 + uViolet * 0.8, 0.0, 1.0) * (shell + halo));
    color = mix(color, mix(C_VIOLET, C_LILAC, aSeed.z), inner * (1.0 - coreW) * uViolet * (0.35 + 0.65 * aSeed.z));
    color = mix(color, mix(C_BLUE, C_VIOLET, 0.25 + 0.35 * uViolet), coreW * 0.7);
    color = mix(color, mix(C_BLUE, C_SKY, 0.45), onLine * 0.5);
    color = mix(color, C_CYAN, halo * uListen * 0.6);
    color = mix(color, C_WHITE, bright * 0.4);

    // The boundary follows the same uneven, migrating energy as the skin.
    float edgeE = edgeEnergy(normalize(vn.xy + 1e-5), t);
    float speak = uSpeak * uEnergy;
    alpha =
        shell * (0.12 + 0.45 * pow(fres, 3.0) * edgeE) * mix(1.0, 0.3, far)
      + loose * (0.17 + 0.3 * uDepth) * (0.4 + 0.6 * aSeed.z) * (1.0 + 0.15 * breath)
      // Flow particles: a faint stream along each filament, clearer while thinking.
      + onLine * (0.28 + 0.24 * uActivity + 0.1 * uListen) * (0.4 + 0.6 * aSeed.z)
      // The core: slow changes of density, a little more attention while
      // listening, a rise while speaking.
      + coreW * (0.3 + 0.08 * breath + 0.26 * speak + 0.1 * uDepth + 0.06 * uListen) * (0.4 + 0.6 * aSeed.z)
      + halo * 0.12 * uListen * sin(inward * 3.1416) * (0.35 + 0.65 * aSeed.x);
    alpha *= tier;
    alpha *= 0.75 + 0.25 * sin(t * (0.5 + aSeed.z * 1.3) + aSeed.x * 40.0);
    alpha *= mix(1.0, 0.4, far * (1.0 - shell));
  }

  void main() {
    vec4 mv;
    vec3 color;
    float alpha, size, soft;
    orbBody(mv, color, alpha, size, soft);
    vAlpha = alpha * uGlow * uOpacity;
    if (vAlpha < 0.002) {
      // Invisible (faded out): skip rasterising.
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      gl_PointSize = 0.0;
      return;
    }
    gl_Position = projectionMatrix * mv;
    gl_PointSize = uSize * size * uPixelRatio * (9.0 / -mv.z);
    vColor = color;
    vSoft = soft;
  }
`

export const bodyFragment = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  varying float vSoft;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    // Near particles a little crisper, far ones softer (a hint of depth of field).
    float core = pow(smoothstep(0.5, 0.0, d), mix(2.6, 1.3, vSoft));
    if (core * vAlpha < 0.004) discard;
    gl_FragColor = vec4(vColor, core * vAlpha);
  }
`
