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

/**
 * FATHI's solid body: the drawing's own silhouette, filled, following the
 * same rig. Opaque, so the avatar is a person in front of the landscape,
 * never a see-through hologram.
 */
export const shellVertex = /* glsl */ `
  ${palette}
  ${helpers}
  ${fathiRig}
  attribute float aCoverage;
  varying float vCoverage;
  varying float vY;
  void main() {
    vec3 p = rigPosition(position, 0.0);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(faceToWorld(p), 1.0);
    vCoverage = aCoverage;
    vY = position.y;
  }
`

export const shellFragment = /* glsl */ `
  uniform float uOpacity;
  varying float vCoverage;
  varying float vY;
  void main() {
    float inside = smoothstep(0.42, 0.58, vCoverage);
    float a = inside * uOpacity * smoothstep(-1.96, -1.74, vY);
    if (a < 0.003) discard;
    // A deep night blue just under the sky around it, so the body reads as a
    // solid form in front of the landscape rather than a cut-out.
    vec3 c = mix(vec3(0.018, 0.034, 0.078), vec3(0.026, 0.05, 0.11), smoothstep(-1.6, 0.6, vY));
    gl_FragColor = vec4(c, a);
  }
`
