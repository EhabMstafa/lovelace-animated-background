import { faceLight, facePose, helpers, palette } from '../glsl'

/** Hairline traces: the anatomy the particles hang on (eyes, brows, ears, mask weave, neck strands). */
export const traceVertex = /* glsl */ `
  ${palette}
  ${helpers}
  ${facePose}
  ${faceLight}
  attribute float aT;
  attribute float aKind;
  attribute vec3 aNormal;
  uniform float uReveal;
  varying float vAlpha;
  varying vec3 vColor;
  varying float vT;
  void main() {
    vec3 n = aNormal;
    vec3 p = poseFace(position, n);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    vec3 vn = normalize(normalMatrix * n);
    vec4 light = faceLighting(vn);
    float mask = step(0.5, aKind) * (1.0 - step(1.5, aKind));
    float feature = step(1.5, aKind) * (1.0 - step(2.5, aKind));
    float strand = step(2.5, aKind) * (1.0 - step(3.5, aKind));
    float edge = step(4.5, aKind) * (1.0 - step(5.5, aKind));
    float contour = step(5.5, aKind);
    vColor = mask * mix(C_BLUE, C_LILAC, 0.45) + edge * mix(C_LILAC, C_WHITE, 0.45) + feature * C_SKY
           + strand * mix(C_SKY, C_DEEP, smoothstep(-0.6, -1.15, position.y))
           + contour * mix(C_DEEP, C_SKY, light.x);
    vColor += C_LILAC * light.z * 0.5;
    vAlpha = (mask * 0.22 + edge * 0.6 + feature * 0.22 + strand * 0.2 + contour * 0.16)
           * (0.35 + 0.65 * light.x + 0.5 * light.y + 0.5 * light.z)
           * mix(0.08, 1.0, light.w)
           * smoothstep(-1.38, -1.02, position.y) * (1.0 - smoothstep(0.7, 1.05, abs(position.x)));
    vT = aT;
  }
`

export const traceFragment = /* glsl */ `
  uniform float uReveal;
  varying float vAlpha;
  varying vec3 vColor;
  varying float vT;
  void main() {
    // Lines draw themselves along their length as the face forms.
    float shown = smoothstep(vT, vT + 0.15, uReveal * 1.15);
    float a = vAlpha * shown;
    if (a < 0.003) discard;
    gl_FragColor = vec4(vColor, a);
  }
`
