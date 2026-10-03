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
