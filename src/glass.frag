precision highp float;

uniform sampler2D uImage;
uniform vec2 uImageSize;   // source image size, px
uniform vec2 uResolution;  // canvas size, device px
uniform float uDpr;

uniform vec2 uCenter;      // lens centre, device px (origin bottom-left)
uniform vec2 uSize;        // lens half-extents, device px
uniform float uRadius;     // corner radius, device px
uniform float uBevel;      // width of the curved rim, device px
uniform float uRefraction; // displacement at the rim, device px
uniform float uZoom;       // magnification across the whole lens
uniform float uFrost;      // blur radius, device px
uniform float uChroma;     // chromatic aberration amount, 0..1
uniform float uOpacity;    // fade for image swaps

const vec2 LIGHT = vec2(-0.55, 0.83); // top-left
const int FROST_TAPS = 24;

// Map a pixel to image UVs with object-fit: cover
vec2 coverUv(vec2 px) {
  vec2 uv = px / uResolution;
  float screenAspect = uResolution.x / uResolution.y;
  float imageAspect = uImageSize.x / uImageSize.y;
  vec2 scale = screenAspect > imageAspect
    ? vec2(1.0, imageAspect / screenAspect)
    : vec2(screenAspect / imageAspect, 1.0);
  return (uv - 0.5) * scale + 0.5;
}

vec3 sampleImage(vec2 px) {
  return texture2D(uImage, coverUv(px)).rgb;
}

// Golden-angle spiral blur
vec3 frosted(vec2 px) {
  if (uFrost < 0.5) return sampleImage(px);
  vec3 acc = vec3(0.0);
  for (int i = 0; i < FROST_TAPS; i++) {
    float fi = float(i);
    float r = sqrt((fi + 0.5) / float(FROST_TAPS)) * uFrost;
    float a = fi * 2.39996323;
    acc += sampleImage(px + vec2(cos(a), sin(a)) * r);
  }
  return acc / float(FROST_TAPS);
}

float sdRoundBox(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

float lensSdf(vec2 p) {
  return sdRoundBox(p, uSize, min(uRadius, min(uSize.x, uSize.y)));
}

void main() {
  vec2 px = gl_FragCoord.xy;
  vec2 p = px - uCenter;
  float d = lensSdf(p);

  vec3 col = sampleImage(px);

  // Soft drop shadow, nudged downwards
  float ds = lensSdf(p + vec2(0.0, 12.0 * uDpr));
  col *= 1.0 - (1.0 - smoothstep(-10.0 * uDpr, 34.0 * uDpr, ds)) * 0.3;

  float mask = 1.0 - smoothstep(-uDpr, uDpr, d);
  if (mask > 0.0) {
    vec2 e = vec2(1.0, 0.0);
    vec2 n = normalize(vec2(
      lensSdf(p + e.xy) - lensSdf(p - e.xy),
      lensSdf(p + e.yx) - lensSdf(p - e.yx)
    ) + 1e-5);

    // 0 in the flat middle, 1 at the very edge
    float rim = 1.0 - clamp(-d / uBevel, 0.0, 1.0);
    // Circular bevel profile: slope steepens towards the edge
    float bend = 1.0 - sqrt(1.0 - rim * rim);

    vec2 base = uCenter + p / uZoom;
    vec2 offset = -n * bend * uRefraction;

    vec3 glass;
    if (uChroma > 0.001) {
      float c = uChroma * 0.35;
      glass.r = frosted(base + offset * (1.0 + c)).r;
      glass.g = frosted(base + offset).g;
      glass.b = frosted(base + offset * (1.0 - c)).b;
    } else {
      glass = frosted(base + offset);
    }

    // Faint milky body
    glass = mix(glass, vec3(1.0), 0.06);

    // Rim lighting: strong key from the top-left, softer bounce opposite
    float facing = dot(n, normalize(LIGHT));
    float rimLight = pow(rim, 3.0) * (0.55 * max(facing, 0.0) + 0.22 * max(-facing, 0.0));
    float hairline = (1.0 - smoothstep(0.0, 1.5 * uDpr, -d)) * 0.35;
    glass += rimLight + hairline;

    // Gentle top-down sheen
    float sheen = smoothstep(-uSize.y, uSize.y, p.y) * 0.05;
    glass += sheen;

    col = mix(col, clamp(glass, 0.0, 1.0), mask);
  }

  gl_FragColor = vec4(col * uOpacity, 1.0);
}
