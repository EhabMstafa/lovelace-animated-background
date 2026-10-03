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
  uniform float uVolume;   // 0 = FATHI's shallow relief, 1 = a rounded head, neck and chest

  // FATHI is drawn as a shallow relief (depth ≈ a tenth of its width), so it
  // reads flat. Volume lays the same points onto a simple body: the head is
  // an egg whose width follows FATHI's own silhouette, the neck a cylinder,
  // the chest a shallow barrel with shoulders falling back. The original
  // relief rides on top as detail.
  float headWidth(float y) { float h = (y - .06) / .96; return .66 * sqrt(max(0.0, 1.0 - h * h)); }
  float bodyHeight(vec2 q) {
    float w = max(headWidth(q.y), 1e-3);
    float u = abs(q.x) / w;
    float crown = sqrt(max(0.0, 1.0 - pow(max(0.0, q.y - .06) / .96, 2.0)));
    float centre = .62 * crown - .16 * smoothstep(-.45, -.9, q.y);
    float head = centre * sqrt(max(0.0, 1.0 - u * u)) - .14 * clamp((u - 1.0) * 3.0, 0.0, 1.0);
    float neck = .30 * sqrt(max(0.0, 1.0 - pow(q.x / .46, 2.0)));
    float chest = .34 * sqrt(max(0.0, 1.0 - pow(q.x / 1.8, 2.0))) - .24 * smoothstep(.5, 1.5, abs(q.x));
    float h = mix(chest, neck, smoothstep(-1.42, -1.10, q.y));
    return mix(h, head, smoothstep(-.98, -.70, q.y));
  }
  /** Surface normal of the body at a FATHI point (before any pose). */
  vec3 bodyNormal(vec2 q) {
    const float e = .025;
    float dx = bodyHeight(q + vec2(e, 0.0)) - bodyHeight(q - vec2(e, 0.0));
    float dy = bodyHeight(q + vec2(0.0, e)) - bodyHeight(q - vec2(0.0, e));
    return normalize(vec3(-dx, -dy, 2.0 * e));
  }
  /** Set by rigPosition: how much the volume moved a point toward the camera (size compensation). */
  float gNear = 1.0;

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
    // Volume, with perspective compensated so the front view keeps FATHI's exact drawing.
    float lift = uVolume * (bodyHeight(bind.xy) - .17);
    float cam = 8.2 / uFaceScale;
    gNear = (cam - bind.z) / (cam - bind.z - lift);
    p.z += lift;
    p.x *= gNear;
    p.y = uFaceOffset.y + (p.y - uFaceOffset.y) * gNear;
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

  /** Turns a bind-space direction with the head, as rigPosition turns points. */
  vec3 poseDirection(vec3 n, vec3 bind) {
    vec3 q = n;
    float cy = cos(uHead.x), sy = sin(uHead.x); q = vec3(cy * q.x + sy * q.z, q.y, -sy * q.x + cy * q.z);
    float cp = cos(uHead.y), sp = sin(uHead.y); q = vec3(q.x, cp * q.y - sp * q.z, sp * q.y + cp * q.z);
    float cr = cos(uHead.z), sr = sin(uHead.z); q = vec3(cr * q.x - sr * q.y, sr * q.x + cr * q.y, q.z);
    return normalize(mix(n, q, smoothstep(-1.35, -.48, bind.y)));
  }

  // Soft key light from above-left and in front, in view space.
  const vec3 KEY_LIGHT = vec3(-0.38, 0.30, 0.87);
  /** Form shading: lit planes a little brighter, turning planes a little dimmer. */
  float bodyShade(vec3 bind, mat3 nm) {
    vec3 n = normalize(nm * poseDirection(bodyNormal(bind.xy), bind));
    float key = max(dot(n, normalize(KEY_LIGHT)), 0.0);
    float turn = 1.0 - max(n.z, 0.0);
    return mix(1.0, .66 + .48 * key + .20 * turn * turn, uVolume);
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

  // FATHI's original colours, exactly as its renderer drew them: the
  // #20dcff and #ff7b36 uniforms in three.js's linear working space.
  const vec3 F_CYAN  = vec3(0.0144, 0.7157, 1.0);
  const vec3 F_AMBER = vec3(1.0, 0.1980, 0.0369);

  vec3 avatarColor(float warmTint, float warm, float lip, float lipGain) {
    vec3 c = mix(F_CYAN, F_AMBER, warmTint);
    c = mix(c, vec3(1.0, .50, .30), lip * lipGain);
    return mix(c, vec3(1.0, .53, .29), uPresence.z * .22 * (1.0 - warm));
  }

  /** Brightness falls off with distance, as in the original camera setup. */
  float fathiDepth(float z) { return clamp(0.5 + 0.57 * (z - 0.11), 0.0, 1.0); }
`
