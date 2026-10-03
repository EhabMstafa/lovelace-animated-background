import { fathiRig, helpers, palette } from '../glsl'

/** FATHI's strands: neck flow, throat, shoulder links and jaw guide, on the same rig. */
export const traceVertex = /* glsl */ `
  ${palette}
  ${helpers}
  ${fathiRig}
  attribute float aStrength;
  attribute float aProgress;
  attribute float aWarm;
  varying float vAlpha;
  varying vec3 vColor;
  varying float vT;
  void main() {
    vec3 p = rigPosition(position, aWarm);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(faceToWorld(p), 1.0);
    float depth = smoothstep(-0.3, 0.45, position.z);
    vec2 finish = finishAt(position, aWarm);
    float lip = lipTrace(position) * aWarm;
    float speechGlow = (1.0 + uJaw * .06 * aWarm) * mix(uPresence.x, uPresence.y, aWarm);
    vAlpha = aStrength * (.55 + .45 * depth) * smoothstep(-1.96, -1.74, position.y) * finish.x * speechGlow * 1.08
           * (1.0 + lip * (.24 + uJaw * .15)) * mix(1.0, 0.6, aWarm);
    vColor = avatarColor(position, finish.y, lip * 0.5, vec3(0.7, 0.0, 0.25));
    vT = aProgress;
  }
`

export const traceFragment = /* glsl */ `
  uniform float uReveal;
  varying float vAlpha;
  varying vec3 vColor;
  varying float vT;
  void main() {
    // Strands draw themselves along their length as the face forms.
    float shown = smoothstep(vT, vT + 0.15, uReveal * 1.15);
    float a = vAlpha * shown;
    if (a < 0.003) discard;
    gl_FragColor = vec4(vColor, a);
  }
`
