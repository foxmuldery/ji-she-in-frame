(function(){
'use strict';
/*
 * RetroZone — CRT shader overlay (vendored, MIT)
 * https://github.com/TheMarco/retrozone
 * Original: src/ShaderOverlay.js
 * Local changes: classic-script wrapper, configurable virtual resolution,
 * lower default CRT strengths for this game, z-index 3, no module export.
 */
/**
 * WebGL shader overlay for CRT and Vector display effects.
 *
 * Creates a WebGL canvas that sits on top of your game canvas and applies
 * real-time post-processing effects. Two display modes are supported:
 *
 * CRT Mode (single-pass):
 *   256x224 NTSC simulation with gaussian beam scanlines, aperture grille mask,
 *   bloom, halation, barrel distortion, warm color temperature, interlace flicker.
 *
 * Vector Mode (5-pass):
 *   Blue phosphor CRT with multi-pass bloom, per-channel phosphor persistence,
 *   color grading, chromatic aberration, grain, and edge beam defocus.
 */

// ── Shared vertex shader ──
const vertexShaderSource = `
attribute vec2 a_position;
attribute vec2 a_texCoord;
varying vec2 v_texCoord;

void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
  v_texCoord = a_texCoord;
}
`;

// ── CRT raster display shader ──
const crtFragmentSource = `
precision mediump float;

uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform float u_time;

varying vec2 v_texCoord;

#define PI 3.14159265359
#define BLOOM_STRENGTH 0.65
#define HALATION_STRENGTH 0.35
#define MASK_STRENGTH 0.12
#define NOISE_STRENGTH 0.025
#define FLICKER_STRENGTH 0.08
#define CURVATURE_STRENGTH 0.04
#define CORNER_RADIUS 0.15

const vec2 vRes = vec2(256.0, 224.0);
const vec2 vTexel = vec2(1.0 / 256.0, 1.0 / 224.0);

vec3 toLinear(vec3 c) { return c * c; }
vec3 toGamma(vec3 c) { return sqrt(c); }

vec3 noise3(vec2 co, float t) {
  float r = fract(sin(dot(co + t, vec2(12.9898, 78.233))) * 43758.5453);
  float g = fract(sin(dot(co + t, vec2(93.9898, 67.345))) * 43758.5453);
  float b = fract(sin(dot(co + t, vec2(41.9898, 29.876))) * 43758.5453);
  return vec3(r, g, b) * 2.0 - 1.0;
}

vec2 curveUV(vec2 uv) {
  vec2 c = uv * 2.0 - 1.0;
  c *= 1.0 + dot(c, c) * CURVATURE_STRENGTH;
  return c * 0.5 + 0.5;
}

float roundedRectSDF(vec2 uv, vec2 s, float r) {
  vec2 d = abs(uv - 0.5) * 2.0 - s + r;
  return min(max(d.x, d.y), 0.0) + length(max(d, 0.0)) - r;
}

vec3 maxSample(vec2 uv) {
  vec2 vs = vec2(0.0, 0.4 * vTexel.y);
  vec2 hs = vec2(0.4 * vTexel.x, 0.0);
  vec3 s0 = toLinear(texture2D(u_texture, uv).rgb);
  vec3 s1 = toLinear(texture2D(u_texture, uv - vs).rgb);
  vec3 s2 = toLinear(texture2D(u_texture, uv + vs).rgb);
  vec3 s3 = toLinear(texture2D(u_texture, uv - hs).rgb);
  vec3 s4 = toLinear(texture2D(u_texture, uv + hs).rgb);
  return max(max(max(s0, s1), max(s2, s3)), s4);
}

vec3 getBlur(vec2 uv) {
  vec3 r = toLinear(texture2D(u_texture, uv).rgb) * 0.4;
  r += toLinear(texture2D(u_texture, uv + vec2(-vTexel.x, 0.0)).rgb) * 0.15;
  r += toLinear(texture2D(u_texture, uv + vec2( vTexel.x, 0.0)).rgb) * 0.15;
  r += toLinear(texture2D(u_texture, uv + vec2(0.0, -vTexel.y)).rgb) * 0.15;
  r += toLinear(texture2D(u_texture, uv + vec2(0.0,  vTexel.y)).rgb) * 0.15;
  return r;
}

void main() {
  vec2 uv = v_texCoord;

  if (roundedRectSDF(uv, vec2(1.0, 1.0), CORNER_RADIUS) > 0.0) {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }

  vec2 curved = curveUV(uv);
  const float margin = 0.001;
  if (curved.x < -margin || curved.x > 1.0 + margin ||
      curved.y < -margin || curved.y > 1.0 + margin) {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }
  curved = clamp(curved, 0.0, 1.0);

  float pitch = u_resolution.y / vRes.y;

  // Virtual pixel sampling with NTSC horizontal blend
  vec2 vPos = curved * vRes;
  vec2 pxCenter = (floor(vPos) + 0.5) / vRes;
  vec3 center = maxSample(pxCenter);
  vec3 colL = toLinear(texture2D(u_texture, pxCenter - vec2(vTexel.x, 0.0)).rgb);
  vec3 colR = toLinear(texture2D(u_texture, pxCenter + vec2(vTexel.x, 0.0)).rgb);
  float blendAmt = mix(0.18, 0.10, smoothstep(1.5, 3.0, pitch));
  float fx = fract(vPos.x);
  float wL = blendAmt * (1.0 - fx);
  float wR = blendAmt * fx;
  vec3 color = center * (1.0 - wL - wR) + colL * wL + colR * wR;

  // Bloom + halation
  vec3 tightBlur = getBlur(pxCenter);
  color += max(tightBlur - 0.6, 0.0) * 2.5 * BLOOM_STRENGTH;
  vec2 ht = vTexel * 3.0;
  vec3 halation = toLinear(texture2D(u_texture, pxCenter + vec2(-ht.x, 0.0)).rgb)
                + toLinear(texture2D(u_texture, pxCenter + vec2( ht.x, 0.0)).rgb)
                + toLinear(texture2D(u_texture, pxCenter + vec2(0.0, -ht.y)).rgb)
                + toLinear(texture2D(u_texture, pxCenter + vec2(0.0,  ht.y)).rgb);
  color += max(halation * 0.25 - 0.45, 0.0) * 1.5 * HALATION_STRENGTH;

  // Gaussian beam scanlines with brightness-dependent bloom
  float virtualY = curved.y * vRes.y;
  float d = fract(virtualY) - 0.5;
  float baseSigma = mix(0.65, 0.35, smoothstep(1.5, 3.0, pitch));
  float bright = max(max(color.r, color.g), color.b);
  float sigma = baseSigma + bright * 0.12;
  float beam = exp(-0.5 * d * d / (sigma * sigma));
  color *= mix(1.0, beam, smoothstep(1.0, 2.0, pitch));

  // Aperture grille (Trinitron-style vertical RGB stripes)
  float mx = mod(gl_FragCoord.x, 3.0);
  vec3 mask;
  if (mx < 1.0) {
    mask = vec3(1.0 + MASK_STRENGTH, 1.0 - MASK_STRENGTH * 0.5, 1.0 - MASK_STRENGTH * 0.5);
  } else if (mx < 2.0) {
    mask = vec3(1.0 - MASK_STRENGTH * 0.5, 1.0 + MASK_STRENGTH, 1.0 - MASK_STRENGTH * 0.5);
  } else {
    mask = vec3(1.0 - MASK_STRENGTH * 0.5, 1.0 - MASK_STRENGTH * 0.5, 1.0 + MASK_STRENGTH);
  }
  float sep = smoothstep(0.0, 0.5, mx) * smoothstep(3.0, 2.5, mx);
  mask *= mix(0.88, 1.0, sep);
  color *= mix(vec3(1.0), mask, smoothstep(1.0, 2.0, pitch));

  // Warm color temperature
  color *= vec3(1.04, 1.01, 0.95);

  // Interlace flicker
  float fieldPhase = mod(floor(u_time * 30.0), 2.0);
  float scanIdx = floor(virtualY);
  float interlace = mod(scanIdx + fieldPhase, 2.0);
  color *= 1.0 - interlace * 0.015 * smoothstep(1.5, 2.5, pitch);

  // Vignette
  vec2 ctr = curved * 2.0 - 1.0;
  color *= 1.0 - dot(ctr, ctr) * 0.12;

  // RGB static noise
  color += noise3(gl_FragCoord.xy, u_time) * NOISE_STRENGTH;

  // Power supply flicker
  float flicker = sin(u_time * 13.7) * 0.5 + sin(u_time * 7.3) * 0.3 + sin(u_time * 23.1) * 0.2;
  float cb = max(max(color.r, color.g), color.b);
  color *= 1.0 + flicker * FLICKER_STRENGTH * (1.0 + cb * 0.5);

  gl_FragColor = vec4(clamp(toGamma(color), 0.0, 1.0), 1.0);
}
`;

// ── Bloom downsample shader ──
const bloomDownsampleFragSrc = `
precision mediump float;

uniform sampler2D u_texture;
uniform vec2 u_resolution;

varying vec2 v_texCoord;

void main() {
  vec2 texelSize = 1.0 / u_resolution;
  vec2 halfTexel = texelSize * 0.5;

  vec3 a = texture2D(u_texture, v_texCoord + vec2(-halfTexel.x, -halfTexel.y)).rgb;
  vec3 b = texture2D(u_texture, v_texCoord + vec2( halfTexel.x, -halfTexel.y)).rgb;
  vec3 c = texture2D(u_texture, v_texCoord + vec2(-halfTexel.x,  halfTexel.y)).rgb;
  vec3 d = texture2D(u_texture, v_texCoord + vec2( halfTexel.x,  halfTexel.y)).rgb;

  vec3 color = (a + b + c + d) * 0.25;

  float luma = dot(color, vec3(0.299, 0.587, 0.114));
  float knee = 0.25;
  float threshold = 0.15;
  float soft = luma - threshold + knee;
  soft = clamp(soft / (2.0 * knee), 0.0, 1.0);
  soft = soft * soft;
  float contribution = max(soft, step(threshold + knee, luma));

  gl_FragColor = vec4(color * contribution, 1.0);
}
`;

// ── Separable Gaussian blur shader ──
const blurFragSrc = `
precision mediump float;

uniform sampler2D u_texture;
uniform vec2 u_direction;
uniform vec2 u_resolution;

varying vec2 v_texCoord;

void main() {
  vec2 texelSize = u_direction / u_resolution;

  vec3 result = vec3(0.0);
  result += texture2D(u_texture, v_texCoord + texelSize * -4.0).rgb * 0.0162;
  result += texture2D(u_texture, v_texCoord + texelSize * -3.0).rgb * 0.0540;
  result += texture2D(u_texture, v_texCoord + texelSize * -2.0).rgb * 0.1216;
  result += texture2D(u_texture, v_texCoord + texelSize * -1.0).rgb * 0.1945;
  result += texture2D(u_texture, v_texCoord).rgb * 0.2270;
  result += texture2D(u_texture, v_texCoord + texelSize *  1.0).rgb * 0.1945;
  result += texture2D(u_texture, v_texCoord + texelSize *  2.0).rgb * 0.1216;
  result += texture2D(u_texture, v_texCoord + texelSize *  3.0).rgb * 0.0540;
  result += texture2D(u_texture, v_texCoord + texelSize *  4.0).rgb * 0.0162;

  gl_FragColor = vec4(result, 1.0);
}
`;

// ── Vector composite shader ──
const vectorCompositeFragSrc = `
precision mediump float;

uniform sampler2D u_texture;
uniform sampler2D u_bloom;
uniform sampler2D u_prevFrame;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_phosphorDecay;

varying vec2 v_texCoord;

#define CURVATURE 0.04
#define CORNER_RADIUS 0.08

float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

float hash(vec2 co, float t) {
  return fract(sin(dot(co + t, vec2(12.9898, 78.233))) * 43758.5453);
}

float hash2(vec2 co) {
  return fract(sin(dot(co, vec2(127.1, 311.7))) * 43758.5453);
}

vec2 curveUV(vec2 uv) {
  vec2 c = uv * 2.0 - 1.0;
  c *= 1.0 + dot(c, c) * CURVATURE;
  return c * 0.5 + 0.5;
}

float roundedRectSDF(vec2 uv, vec2 s, float r) {
  vec2 d = abs(uv - 0.5) * 2.0 - s + r;
  return min(max(d.x, d.y), 0.0) + length(max(d, 0.0)) - r;
}

vec3 rgb2hsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0/3.0, 2.0/3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  float e = 1.0e-10;
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}

// Color grading: maps source colors to blue phosphor aesthetic
vec3 vectorColorGrade(vec3 src) {
  float l = luma(src);
  if (l < 0.01) return vec3(0.0);

  vec3 hsv = rgb2hsv(src);
  float sat = hsv.y;

  // Unsaturated content -> blue phosphor with white-hot core
  if (sat < 0.12) {
    float e = pow(l, 1.1);
    float r = e * 0.3;
    float g = e * 0.85;
    float b = e * 1.0;
    if (e > 0.8) {
      float hotness = (e - 0.8) / 0.2;
      r += hotness * 0.5;
      g += hotness * 0.1;
    }
    return vec3(r, g, b);
  }

  // Green-dominant content -> blue phosphor
  bool greenDominant = src.g > src.r * 1.15 && src.g > src.b;

  if (greenDominant) {
    float e = pow(l, 1.1);
    float r = e * 0.3;
    float g = e * 0.85;
    float b = e * 1.0;
    if (e > 0.8) {
      float hotness = (e - 0.8) / 0.2;
      r += hotness * 0.5;
      g += hotness * 0.1;
    }
    return vec3(r, g, b);
  }

  // Cyan with high blue/green ratio -> preserve with slight blue shift
  if (src.g > src.r * 1.5 && src.b > src.r * 1.5 && src.b / (src.g + 0.001) > 0.78) {
    vec3 tinted = src;
    tinted.r *= 0.85;
    tinted.b = mix(tinted.b, tinted.b * 1.1, 0.3);
    return tinted * 1.1;
  }

  // Everything else: preserve with subtle blue tint
  vec3 result = src;
  vec3 blueTinted = src * vec3(0.85, 0.9, 1.15);
  result = mix(src, blueTinted, 0.12);
  float gray = luma(result);
  result = mix(vec3(gray), result, 1.15);
  return result;
}

// Edge beam defocus
vec3 defocusedSample(vec2 uv) {
  vec2 texel = vec2(1.0) / u_resolution;
  vec2 fromCenter = uv - 0.5;
  float edgeDist = dot(fromCenter, fromCenter) * 2.0;
  float defocusRadius = edgeDist * 3.0;

  if (defocusRadius < 0.3) {
    return texture2D(u_texture, uv).rgb;
  }

  float r = defocusRadius;
  vec3 sum = texture2D(u_texture, uv).rgb * 0.40;
  sum += texture2D(u_texture, clamp(uv + vec2(-texel.x * r, 0.0), 0.0, 1.0)).rgb * 0.10;
  sum += texture2D(u_texture, clamp(uv + vec2( texel.x * r, 0.0), 0.0, 1.0)).rgb * 0.10;
  sum += texture2D(u_texture, clamp(uv + vec2(0.0, -texel.y * r), 0.0, 1.0)).rgb * 0.10;
  sum += texture2D(u_texture, clamp(uv + vec2(0.0,  texel.y * r), 0.0, 1.0)).rgb * 0.10;
  sum += texture2D(u_texture, clamp(uv + vec2(-texel.x * r, -texel.y * r) * 0.7, 0.0, 1.0)).rgb * 0.05;
  sum += texture2D(u_texture, clamp(uv + vec2( texel.x * r, -texel.y * r) * 0.7, 0.0, 1.0)).rgb * 0.05;
  sum += texture2D(u_texture, clamp(uv + vec2(-texel.x * r,  texel.y * r) * 0.7, 0.0, 1.0)).rgb * 0.05;
  sum += texture2D(u_texture, clamp(uv + vec2( texel.x * r,  texel.y * r) * 0.7, 0.0, 1.0)).rgb * 0.05;
  return sum;
}

void main() {
  vec2 uv = v_texCoord;

  if (roundedRectSDF(uv, vec2(1.0, 1.0), CORNER_RADIUS) > 0.0) {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }

  vec2 curved = curveUV(uv);
  if (curved.x < 0.0 || curved.x > 1.0 || curved.y < 0.0 || curved.y > 1.0) {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }

  vec3 core = defocusedSample(curved);
  vec3 color = vectorColorGrade(core);

  // Bloom (half-res, Y-flipped for FBO convention)
  vec3 bloomSample = texture2D(u_bloom, vec2(curved.x, 1.0 - curved.y)).rgb;
  vec3 bloomGraded = vectorColorGrade(bloomSample);
  color += bloomGraded * 0.55;

  // Chromatic aberration
  vec2 fromCenter = curved - 0.5;
  float caStrength = dot(fromCenter, fromCenter) * 0.008;
  if (caStrength > 0.0005) {
    vec2 caOffset = fromCenter * caStrength;
    float rShift = luma(vectorColorGrade(texture2D(u_texture, clamp(curved + caOffset, 0.0, 1.0)).rgb));
    float bShift = luma(vectorColorGrade(texture2D(u_texture, clamp(curved - caOffset, 0.0, 1.0)).rgb));
    color.r = mix(color.r, color.r * (1.0 + (rShift - luma(color)) * 0.3), 0.5);
    color.b = mix(color.b, color.b * (1.0 + (bShift - luma(color)) * 0.3), 0.5);
  }

  // Phosphor grain
  vec2 grainCoord = gl_FragCoord.xy;
  float grain = hash2(grainCoord) * 0.08 - 0.04;
  float intensity = luma(color);
  float grainAmt = smoothstep(0.08, 0.6, intensity);
  color += grain * grainAmt;

  // Glass surface reflection
  vec2 glassCoord = curved * 2.0 - 1.0;
  float glassHighlight = 1.0 - dot(glassCoord, glassCoord) * 0.5;
  glassHighlight = max(glassHighlight, 0.0);
  color += vec3(0.002, 0.003, 0.006) * glassHighlight;

  // Blue phosphor glass tint
  float blueVar = 0.7 + 0.3 * sin(u_time * 0.4 + curved.y * 4.0 + curved.x * 2.5);
  float blueNoise = hash2(floor(gl_FragCoord.xy * 0.5)) * 0.15;
  vec3 blueTint = vec3(0.02, 0.03, 0.08) * (blueVar + blueNoise);
  float blueGate = max(0.55, smoothstep(0.15, 1.0, luma(color)));
  color += blueTint * blueGate;

  // Analog noise
  float n = (hash(gl_FragCoord.xy, u_time) - 0.5) * 0.01;
  color += n;

  // Beam flicker
  float flicker = sin(u_time * 8.3) * 0.008 + sin(u_time * 17.1) * 0.004;
  color *= 1.0 + flicker;

  // Per-channel phosphor persistence
  vec2 jitter = vec2(
    (hash(gl_FragCoord.xy, u_time) - 0.5),
    (hash(gl_FragCoord.yx, u_time + 17.0) - 0.5)
  ) * 0.0004;
  vec3 prev = texture2D(u_prevFrame, vec2(uv.x, 1.0 - uv.y) + jitter).rgb;
  color = max(color, prev * u_phosphorDecay);

  gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
`;

// ── Passthrough shader (blit FBO to screen) ──
const passthroughFragmentSource = `
precision mediump float;
uniform sampler2D u_texture;
varying vec2 v_texCoord;
void main() {
  gl_FragColor = texture2D(u_texture, vec2(v_texCoord.x, 1.0 - v_texCoord.y));
}
`;

// ── WebGL helpers ──

function compileGL(gl, src, type) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    console.error('RetroZone shader compile error:', gl.getShaderInfoLog(s));
    gl.deleteShader(s);
    return null;
  }
  return s;
}

function buildProgram(gl, vertSrc, fragSrc) {
  const vs = compileGL(gl, vertSrc, gl.VERTEX_SHADER);
  const fs = compileGL(gl, fragSrc, gl.FRAGMENT_SHADER);
  if (!vs || !fs) return null;
  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.error('RetroZone program link error:', gl.getProgramInfoLog(prog));
    return null;
  }
  return {
    program: prog,
    aPosition: gl.getAttribLocation(prog, 'a_position'),
    aTexCoord: gl.getAttribLocation(prog, 'a_texCoord'),
    uResolution: gl.getUniformLocation(prog, 'u_resolution'),
    uTime: gl.getUniformLocation(prog, 'u_time'),
  };
}

/**
 * Create a shader overlay on top of the given canvas.
 *
 * @param {HTMLCanvasElement} gameCanvas - The source canvas to apply effects to
 * @param {Object} [options]
 * @param {string} [options.mode='vector'] - Initial display mode: 'vector' or 'crt'
 * @param {number} [options.phosphorDecay=0.78] - Phosphor persistence decay (0-1, vector mode only)
 * @returns {Object} Overlay control object
 */
function createShaderOverlay(gameCanvas, options = {}) {
  const initialMode = options.mode || 'vector';
  const initialDecay = options.phosphorDecay ?? 0.78;
  const vw = options.virtualWidth ?? 640;
  const vh = options.virtualHeight ?? 360;
  const zIndex = options.zIndex ?? 3;
  const crtFrag = crtFragmentSource
    .replace('const vec2 vRes = vec2(256.0, 224.0);', `const vec2 vRes = vec2(${vw}.0, ${vh}.0);`)
    .replace('const vec2 vTexel = vec2(1.0 / 256.0, 1.0 / 224.0);', `const vec2 vTexel = vec2(1.0 / ${vw}.0, 1.0 / ${vh}.0);`)
    .replace('#define BLOOM_STRENGTH 0.65', '#define BLOOM_STRENGTH 0.40')
    .replace('#define HALATION_STRENGTH 0.35', '#define HALATION_STRENGTH 0.22')
    .replace('#define MASK_STRENGTH 0.12', '#define MASK_STRENGTH 0.065')
    .replace('#define NOISE_STRENGTH 0.025', '#define NOISE_STRENGTH 0.014')
    .replace('#define FLICKER_STRENGTH 0.08', '#define FLICKER_STRENGTH 0.030')
    .replace('#define CURVATURE_STRENGTH 0.04', '#define CURVATURE_STRENGTH 0.018')
    .replace('#define CORNER_RADIUS 0.15', '#define CORNER_RADIUS 0.07');

  const overlay = document.createElement('canvas');
  overlay.style.position = 'absolute';
  overlay.style.pointerEvents = 'none';
  overlay.style.zIndex = String(zIndex);
  overlay.id = 'retrozone-overlay';

  const updateOverlayPosition = () => {
    const rect = gameCanvas.getBoundingClientRect();
    overlay.style.left = rect.left + 'px';
    overlay.style.top = rect.top + 'px';
    overlay.width = rect.width;
    overlay.height = rect.height;
    overlay.style.width = rect.width + 'px';
    overlay.style.height = rect.height + 'px';
  };

  document.body.appendChild(overlay);
  setTimeout(updateOverlayPosition, 0);
  window.addEventListener('resize', updateOverlayPosition);
  window.addEventListener('scroll', updateOverlayPosition);

  const gl = overlay.getContext('webgl') || overlay.getContext('experimental-webgl');
  if (!gl) { console.error('RetroZone: WebGL not supported'); return null; }

  // Build all shader programs
  const programs = {
    crt: buildProgram(gl, vertexShaderSource, crtFrag),
    bloomDownsample: buildProgram(gl, vertexShaderSource, bloomDownsampleFragSrc),
    blur: buildProgram(gl, vertexShaderSource, blurFragSrc),
    vectorComposite: buildProgram(gl, vertexShaderSource, vectorCompositeFragSrc),
    passthrough: buildProgram(gl, vertexShaderSource, passthroughFragmentSource),
  };

  const blurUDirection = gl.getUniformLocation(programs.blur.program, 'u_direction');
  const compositeUTexture = gl.getUniformLocation(programs.vectorComposite.program, 'u_texture');
  const compositeUBloom = gl.getUniformLocation(programs.vectorComposite.program, 'u_bloom');
  const compositeUPrevFrame = gl.getUniformLocation(programs.vectorComposite.program, 'u_prevFrame');
  const compositeUPhosphorDecay = gl.getUniformLocation(programs.vectorComposite.program, 'u_phosphorDecay');

  let currentPhosphorDecay = initialDecay;

  // Persistence FBOs (ping-pong, full-res)
  let persistA = null, persistB = null;
  let persistW = 0, persistH = 0;
  let pingPong = 0;

  // Bloom FBOs (half-res)
  let bloomA = null, bloomB = null;
  let bloomW = 0, bloomH = 0;

  function makeFBO(w, h) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { fb, tex };
  }

  function ensurePersistFBOs(w, h) {
    if (persistW === w && persistH === h) return;
    if (persistA) { gl.deleteFramebuffer(persistA.fb); gl.deleteTexture(persistA.tex); }
    if (persistB) { gl.deleteFramebuffer(persistB.fb); gl.deleteTexture(persistB.tex); }
    persistA = makeFBO(w, h);
    persistB = makeFBO(w, h);
    persistW = w;
    persistH = h;
    pingPong = 0;
  }

  function ensureBloomFBOs(w, h) {
    const halfW = Math.max(1, Math.floor(w / 2));
    const halfH = Math.max(1, Math.floor(h / 2));
    if (bloomW === halfW && bloomH === halfH) return;
    if (bloomA) { gl.deleteFramebuffer(bloomA.fb); gl.deleteTexture(bloomA.tex); }
    if (bloomB) { gl.deleteFramebuffer(bloomB.fb); gl.deleteTexture(bloomB.tex); }
    bloomA = makeFBO(halfW, halfH);
    bloomB = makeFBO(halfW, halfH);
    bloomW = halfW;
    bloomH = halfH;
  }

  // Full-screen quad
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    -1, -1,  0, 1,
     1, -1,  1, 1,
    -1,  1,  0, 0,
     1,  1,  1, 0,
  ]), gl.STATIC_DRAW);

  // Source texture
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  gl.clearColor(0, 0, 0, 0);

  let activeShaderName = (initialMode === 'crt') ? 'crt' : 'vector';

  function applyTextureFilter(mode) {
    gl.bindTexture(gl.TEXTURE_2D, texture);
    const filter = mode === 'crt' ? gl.NEAREST : gl.LINEAR;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  }
  applyTextureFilter(activeShaderName);

  function activateProgram(prog) {
    gl.useProgram(prog.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.enableVertexAttribArray(prog.aPosition);
    gl.vertexAttribPointer(prog.aPosition, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(prog.aTexCoord);
    gl.vertexAttribPointer(prog.aTexCoord, 2, gl.FLOAT, false, 16, 8);
  }

  let running = true;
  let rafId = null;

  function render() {
    if (!running) return;

    updateOverlayPosition();
    if (overlay.width <= 0 || overlay.height <= 0 ||
        !gameCanvas || gameCanvas.width <= 0 || gameCanvas.height <= 0) {
      rafId = requestAnimationFrame(render);
      return;
    }

    const now = performance.now() / 1000;

    // Upload game canvas
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    try {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, gameCanvas);
    } catch (e) {
      running = false;
      if (overlay) overlay.style.display = 'none';
      console.warn('RetroZone: canvas upload failed, falling back to CSS CRT', e);
      return;
    }

    if (activeShaderName === 'vector') {
      ensurePersistFBOs(overlay.width, overlay.height);
      ensureBloomFBOs(overlay.width, overlay.height);

      // Pass 1: Bloom downsample + threshold
      activateProgram(programs.bloomDownsample);
      gl.bindFramebuffer(gl.FRAMEBUFFER, bloomA.fb);
      gl.viewport(0, 0, bloomW, bloomH);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.uniform1i(gl.getUniformLocation(programs.bloomDownsample.program, 'u_texture'), 0);
      gl.uniform2f(programs.bloomDownsample.uResolution, gameCanvas.width, gameCanvas.height);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      // Pass 2: Horizontal blur
      activateProgram(programs.blur);
      gl.bindFramebuffer(gl.FRAMEBUFFER, bloomB.fb);
      gl.viewport(0, 0, bloomW, bloomH);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, bloomA.tex);
      gl.uniform1i(gl.getUniformLocation(programs.blur.program, 'u_texture'), 0);
      gl.uniform2f(blurUDirection, 1.0, 0.0);
      gl.uniform2f(programs.blur.uResolution, bloomW, bloomH);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      // Pass 3: Vertical blur
      activateProgram(programs.blur);
      gl.bindFramebuffer(gl.FRAMEBUFFER, bloomA.fb);
      gl.viewport(0, 0, bloomW, bloomH);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, bloomB.tex);
      gl.uniform1i(gl.getUniformLocation(programs.blur.program, 'u_texture'), 0);
      gl.uniform2f(blurUDirection, 0.0, 1.0);
      gl.uniform2f(programs.blur.uResolution, bloomW, bloomH);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      // Pass 4: Vector composite
      const writeFBO = pingPong === 0 ? persistA : persistB;
      const readFBO  = pingPong === 0 ? persistB : persistA;

      activateProgram(programs.vectorComposite);
      gl.bindFramebuffer(gl.FRAMEBUFFER, writeFBO.fb);
      gl.viewport(0, 0, persistW, persistH);
      gl.clear(gl.COLOR_BUFFER_BIT);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.uniform1i(compositeUTexture, 0);

      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, bloomA.tex);
      gl.uniform1i(compositeUBloom, 1);

      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, readFBO.tex);
      gl.uniform1i(compositeUPrevFrame, 2);

      gl.uniform2f(programs.vectorComposite.uResolution, overlay.width, overlay.height);
      gl.uniform1f(programs.vectorComposite.uTime, now);
      gl.uniform1f(compositeUPhosphorDecay, currentPhosphorDecay);

      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      // Pass 5: Blit to screen
      activateProgram(programs.passthrough);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, overlay.width, overlay.height);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, writeFBO.tex);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      pingPong = 1 - pingPong;
    } else {
      // CRT mode: single-pass
      activateProgram(programs.crt);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, overlay.width, overlay.height);
      gl.clear(gl.COLOR_BUFFER_BIT);

      gl.uniform2f(programs.crt.uResolution, overlay.width, overlay.height);
      gl.uniform1f(programs.crt.uTime, now);

      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    rafId = requestAnimationFrame(render);
  }

  setTimeout(render, 50);

  return {
    /** The overlay canvas element */
    overlay,

    /**
     * Switch display mode.
     * @param {'vector'|'crt'} name
     */
    setShader(name) {
      if (name === 'crt' || name === 'vector') {
        activeShaderName = name;
        applyTextureFilter(name);
      }
    },

    /**
     * Set phosphor persistence decay (vector mode only).
     * @param {number} value - 0 (no persistence) to 1 (infinite persistence). Default: 0.78
     */
    setPhosphorDecay(value) {
      currentPhosphorDecay = value;
    },

    /**
     * Get the current display mode name.
     * @returns {'vector'|'crt'}
     */
    getShaderName() {
      return activeShaderName;
    },

    /**
     * Stop the render loop and clean up resources.
     */
    destroy() {
      running = false;
      if (rafId) cancelAnimationFrame(rafId);
      window.removeEventListener('resize', updateOverlayPosition);
      window.removeEventListener('scroll', updateOverlayPosition);
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    },
  };
}

window.RetroZoneShader = { createShaderOverlay };

})();
