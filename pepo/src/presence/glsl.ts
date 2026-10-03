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
 * Value noise, and the field's boundary energy: how strongly the edge of the
 * Orb is lit in a given screen direction. Uneven (bright stretches, quiet
 * ones, a few where the edge almost dissolves), slowly migrating, and a
 * little stronger lower left, where light enters. Shared by the skin, the
 * glow and the particles so the whole boundary agrees.
 */
export const noise = /* glsl */ `
  float hash3(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
  float vnoise(vec3 p) {
    vec3 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash3(i), hash3(i + vec3(1, 0, 0)), f.x), mix(hash3(i + vec3(0, 1, 0)), hash3(i + vec3(1, 1, 0)), f.x), f.y),
               mix(mix(hash3(i + vec3(0, 0, 1)), hash3(i + vec3(1, 0, 1)), f.x), mix(hash3(i + vec3(0, 1, 1)), hash3(i + vec3(1, 1, 1)), f.x), f.y), f.z);
  }
  float fbm3(vec3 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 3; i++) { v += a * vnoise(p); p = p * 2.03 + 11.7; a *= 0.5; }
    return v / 0.875;
  }
  float edgeEnergy(vec2 sn, float t) {
    // The energy favours one side, which wanders slowly around the lower
    // left; the opposite side always stays quieter, so the edge never closes
    // into an even ring. Noise breaks it into uneven stretches.
    float a = -2.24 + 0.9 * sin(t * 0.031) + 0.4 * sin(t * 0.017 + 1.3);
    float side = pow(0.5 + 0.5 * dot(sn, vec2(cos(a), sin(a))), 1.6);
    // A second, more restrained region (blue, upper left), drifting on its own.
    float b = 2.05 + 0.5 * sin(t * 0.023 + 2.0);
    side = max(side, 0.72 * pow(0.5 + 0.5 * dot(sn, vec2(cos(b), sin(b))), 6.0));
    float n = 0.5 * fbm3(vec3(sn * 1.35 + 3.1, t * 0.035)) + 0.5 * side;
    return mix(0.16, 1.0, smoothstep(0.3, 0.64, n));
  }
`
