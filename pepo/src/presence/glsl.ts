/** GLSL shared by every presence layer, so Orb and Avatar speak one colour language. */

export const palette = /* glsl */ `
  const vec3 C_CYAN   = vec3(0.251, 0.902, 1.000); // #40E6FF
  const vec3 C_SKY    = vec3(0.294, 0.784, 1.000); // #4BC8FF
  const vec3 C_BLUE   = vec3(0.231, 0.510, 1.000); // #3B82FF
  const vec3 C_DEEP   = vec3(0.153, 0.420, 1.000); // #276BFF
  const vec3 C_VIOLET = vec3(0.545, 0.361, 1.000); // #8B5CFF
  const vec3 C_LILAC  = vec3(0.690, 0.400, 1.000); // #B066FF
  const vec3 C_WHITE  = vec3(0.933, 0.957, 1.000); // #EEF4FF
  // Light enters from the lower left (cyan); cognition gathers upper right (violet).
  const vec3 VIOLET_DIR = normalize(vec3(0.72, 0.62, 0.25));
  const vec2 VIOLET_DIR2 = vec2(0.755, 0.656);
`

export const helpers = /* glsl */ `
  vec3 rotateAxis(vec3 p, vec3 axis, float a) {
    float c = cos(a), s = sin(a);
    return p * c + cross(axis, p) * s + axis * dot(axis, p) * (1.0 - c);
  }
  float gauss(float d, float s) { return exp(-(d * d) / (s * s)); }
  mat3 yawPitch(float yaw, float pitch) {
    float cy = cos(yaw), sy = sin(yaw), cp = cos(pitch), sp = sin(pitch);
    mat3 ry = mat3(cy, 0.0, -sy, 0.0, 1.0, 0.0, sy, 0.0, cy);
    mat3 rx = mat3(1.0, 0.0, 0.0, 0.0, cp, sp, 0.0, -sp, cp);
    return ry * rx;
  }
`

/**
 * FATHI's rig, ported from the original avatar: jaw and mouth corners under
 * the mask, blinks and squint, brows, chest breathing and head pose. Every
 * term is zero at rest, so the artwork's topology is preserved.
 */
export const fathiRig = /* glsl */ `
  uniform vec3 uHead;      // yaw, pitch, roll
  uniform vec3 uMouth;     // brow, wide, round
  uniform vec3 uBody;      // sway, roll
  uniform vec3 uEyes;      // left brow, right brow, squint
  uniform vec3 uPresence;  // cool gain, warm gain, thinking tint
  uniform float uJaw;
  uniform float uBlink;
  uniform float uBreath;
  uniform vec2 uGaze;      // eye direction, -1..1
  uniform float uLean;     // forward lean of head and chest
  uniform float uFaceScale;
  uniform vec3 uFaceOffset;

  float lipTrace(vec3 p) {
    float ax = abs(p.x), t = clamp(ax / .32, 0.0, 1.0);
    float upperY = -.505 - .040 * t * t;
    float lowerY = -.585 + .038 * t * t;
    float d = min(abs(p.y - upperY), abs(p.y - lowerY));
    return (1.0 - smoothstep(.012, .036, d)) * (1.0 - smoothstep(.27, .35, ax));
  }

  vec3 rigPosition(vec3 p, float warm) {
    vec3 bind = p;
    float oralX = 1.0 - smoothstep(.20, .44, abs(p.x));
    float oralY = smoothstep(-.76, -.67, p.y) * (1.0 - smoothstep(-.35, -.27, p.y));
    float oral = oralX * oralY * warm;
    float upper = oral * smoothstep(-.56, -.47, p.y);
    float lower = oral * (1.0 - smoothstep(-.59, -.50, p.y));
    float seam = oral * (1.0 - smoothstep(.035, .115, abs(p.y + .535)));
    p.y += uJaw * (.010 * upper - .037 * lower - .010 * seam);
    p.z += uJaw * (.001 * upper + .002 * lower + .001 * seam);
    float corners = (1.0 - smoothstep(.07, .18, abs(abs(bind.x) - .27))) * (1.0 - smoothstep(.07, .18, abs(bind.y + .52))) * warm;
    p.x += sign(p.x) * (uMouth.y * .022 - uMouth.z * .018) * corners;
    p.y += uMouth.y * .009 * corners - uMouth.z * .004 * corners;
    p.z += uMouth.z * .0015 * oral;
    float cheeks = (1.0 - smoothstep(.13, .29, abs(abs(bind.x) - .34))) * (1.0 - smoothstep(.12, .27, abs(bind.y + .43))) * warm;
    p.x += sign(p.x) * (uJaw * .002 + uMouth.y * .004) * cheeks;
    float chin = smoothstep(-.91, -.79, bind.y) * (1.0 - smoothstep(-.69, -.60, bind.y)) * (1.0 - smoothstep(.22, .47, abs(bind.x))) * warm;
    p.y -= uJaw * .011 * chin;
    p.z += uJaw * .001 * chin;
    float eyeLocalY = p.y + .015;
    float eyeX = 1.0 - smoothstep(.075, .155, abs(abs(p.x) - .305));
    float eyeY = 1.0 - smoothstep(.030, .090, abs(eyeLocalY));
    float eyeField = eyeX * eyeY * (1.0 - warm);
    float upperLid = eyeField * smoothstep(-.008, .060, eyeLocalY);
    float lowerLid = eyeField * (1.0 - smoothstep(-.055, .008, eyeLocalY));
    p.y -= uBlink * .047 * upperLid;
    p.y += uBlink * .010 * lowerLid;
    p.y -= uEyes.z * .010 * upperLid;
    p.y += uEyes.z * .004 * lowerLid;
    float browX = 1.0 - smoothstep(.10, .22, abs(abs(p.x) - .29));
    float browY = 1.0 - smoothstep(.028, .085, abs(p.y - .19));
    float browField = browX * browY * (1.0 - warm);
    float sideBrow = mix(uEyes.x, uEyes.y, step(0.0, p.x));
    p.y += sideBrow * .050 * browField;
    // Eyes: the iris area follows the gaze; the upper lid rides a little with it.
    float iris = exp(-pow(length(vec2(abs(bind.x) - .305, bind.y + .015)) / .05, 2.0)) * (1.0 - warm) * eyeX;
    p.x += uGaze.x * .016 * iris;
    p.y += uGaze.y * .009 * iris + uGaze.y * .005 * upperLid;
    float head = smoothstep(-1.35, -.48, bind.y);
    float torso = 1.0 - smoothstep(-1.30, -.78, p.y);
    float shoulder = torso * smoothstep(.34, .78, abs(p.x));
    float lowerNeck = smoothstep(-1.38, -1.18, p.y) * (1.0 - smoothstep(-.98, -.78, p.y));
    p.x += uBody.x * (1.0 - head) + sign(p.x) * uBreath * (.32 * torso + .52 * shoulder);
    p.y += uBreath * (.42 * torso + 1.05 * shoulder + .18 * lowerNeck);
    p.z += uBreath * .14 * torso;
    float bodyRoll = uBody.y * (1.0 - head), bx = p.x, by = p.y + 1.25;
    p.xy = vec2(bx - bodyRoll * by, by + bodyRoll * bx - 1.25);
    vec3 q = p - vec3(0.0, -.48, 0.0);
    float cy = cos(uHead.x), sy = sin(uHead.x); q = vec3(cy * q.x + sy * q.z, q.y, -sy * q.x + cy * q.z);
    float cp = cos(uHead.y), sp = sin(uHead.y); q = vec3(q.x, cp * q.y - sp * q.z, sp * q.y + cp * q.z);
    float cr = cos(uHead.z), sr = sin(uHead.z); q = vec3(cr * q.x - sr * q.y, sr * q.x + cr * q.y, q.z);
    vec3 posed = mix(p, q + vec3(0.0, -.48, 0.0), head);
    // Leaning in: the head leads, the chest follows a little.
    posed.z += uLean * (head + 0.35 * torso);
    posed.y -= uLean * 0.2 * head;
    return posed;
  }

  float softPatch(vec3 p, float cx, float cy, float sx, float sy) {
    vec2 d = vec2((abs(p.x) - cx) / sx, (p.y - cy) / sy);
    return exp(-dot(d, d) * 2.0);
  }
  /** Local finish: calms the busiest patches under the ears and at the temples. */
  vec2 finishAt(vec3 p, float warm) {
    float underEar = softPatch(p, .51, -.35, .115, .23) * warm;
    float temple = softPatch(p, .55, .17, .115, .28) * (1.0 - warm);
    return vec2((1.0 - .53 * underEar) * (1.0 - .48 * temple), warm);
  }

  vec3 faceToWorld(vec3 p) { return (p - uFaceOffset) * uFaceScale; }

  // Saturated avatar palette: kept low in red so dense additive light stays
  // blue instead of washing out to white.
  const vec3 A_ELECTRIC = vec3(0.08, 0.32, 1.00);
  const vec3 A_AZURE    = vec3(0.00, 0.58, 1.00);
  const vec3 A_CYAN     = vec3(0.00, 0.86, 1.00);
  const vec3 A_ICE      = vec3(0.62, 0.93, 1.00);
  /** The mask: FATHI's radiant orange, warming to amber where the light lands. */
  vec3 maskTone(float lit) {
    return mix(vec3(1.00, 0.46, 0.16), vec3(1.00, 0.78, 0.52), smoothstep(0.25, 1.0, lit));
  }

  /** Light on the relief: x wrapped key light, y specular, z edge (relief rim). */
  vec3 reliefLight(vec3 n) {
    const vec3 KEY = normalize(vec3(-0.55, 0.5, 0.68));
    float d = dot(n, KEY);
    float wrap = clamp((d + 0.35) / 1.35, 0.0, 1.0);
    float spec = pow(max(d, 0.0), 10.0);
    float rim = pow(clamp(1.0 - n.z, 0.0, 1.0), 1.4);
    return vec3(wrap, spec, rim);
  }

  /**
   * FATHI lit as a relief, in PEPO's light: electric blue in shadow, azure in
   * light, vivid cyan where the key light lands and along the relief's edges.
   * The mask carries its own tone so it reads as fabric over the face.
   */
  vec3 avatarColor(vec3 bind, float warm, float lip, vec3 light) {
    float wrap = light.x, spec = light.y, rim = light.z;
    vec3 cool = mix(A_ELECTRIC, A_AZURE, smoothstep(0.2, 0.75, wrap));
    cool = mix(cool, A_CYAN, smoothstep(0.6, 1.0, wrap) * 0.75 + rim * 0.45);
    cool = mix(cool, A_ICE, spec * 0.45);
    // Shoulders sink into deeper blue; the far upper right catches a hint of violet, as the Orb does.
    cool = mix(cool, A_ELECTRIC * 0.8, smoothstep(-1.0, -1.7, bind.y) * 0.5);
    vec2 d = bind.xy - vec2(0.0, -0.2);
    float ur = 0.5 + 0.5 * dot(d / max(length(d), 1e-4), VIOLET_DIR2);
    cool = mix(cool, C_VIOLET, smoothstep(0.82, 1.0, ur) * 0.18);
    cool = mix(cool, C_VIOLET, uPresence.z * 0.35);
    vec3 maskCol = mix(maskTone(wrap), A_ICE, spec * 0.3);
    vec3 col = mix(cool, maskCol, warm);
    return mix(col, maskTone(1.0), lip * (0.45 + uJaw * 0.1));
  }
`
