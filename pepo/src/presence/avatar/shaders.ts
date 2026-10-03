import { facePose, helpers, palette } from '../glsl'

/** Hairline traces: the anatomy the particles hang on (eyes, brows, ears, mask weave, neck strands). */
export const traceVertex = /* glsl */ `
  ${palette}
  ${helpers}
  ${facePose}
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
    float facing = normalize(normalMatrix * n).z;
    float mask = step(0.5, aKind) * (1.0 - step(1.5, aKind));
    float feature = step(1.5, aKind) * (1.0 - step(2.5, aKind));
    float strand = step(2.5, aKind) * (1.0 - step(3.5, aKind));
    float edge = step(4.5, aKind);
    vColor = mask * mix(C_BLUE, C_LILAC, 0.45) + edge * mix(C_LILAC, C_WHITE, 0.45) + feature * C_SKY
           + strand * mix(C_SKY, C_DEEP, smoothstep(-0.6, -1.15, position.y));
    vAlpha = (mask * 0.34 + edge * 0.7 + feature * 0.28 + strand * 0.24)
           * mix(0.1, 1.0, smoothstep(-0.2, 0.2, facing))
           * smoothstep(-1.15, -0.9, position.y);
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
