import { fathiRig, helpers, palette } from '../glsl'

/** FATHI's strands (neck flow, throat, shoulder links, jaw guide), drawn as the original did. */
export const traceVertex = /* glsl */ `
  ${palette}
  ${helpers}
  ${fathiRig}
  attribute float aStrength;
  attribute float aWarm;
  varying float vAlpha;
  varying vec3 vColor;
  void main() {
    vec3 p = rigPosition(position, aWarm);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(faceToWorld(p), 1.0);
    vec2 finish = finishAt(position, aWarm);
    float lip = lipTrace(position) * aWarm;
    float speechGlow = (1.0 + uJaw * .06 * aWarm) * mix(uPresence.x, uPresence.y, aWarm);
    vAlpha = aStrength * (.55 + .45 * fathiDepth(position.z)) * smoothstep(-1.96, -1.74, position.y) * finish.x * speechGlow * 1.08
           * (1.0 + lip * (.24 + uJaw * .15));
    vColor = avatarColor(finish.y, aWarm, lip, .20 + uJaw * .07);
  }
`

export const traceFragment = /* glsl */ `
  uniform float uOpacity;
  varying float vAlpha;
  varying vec3 vColor;
  void main() {
    float a = vAlpha * uOpacity;
    if (a < 0.003) discard;
    gl_FragColor = vec4(vColor, a);
  }
`
