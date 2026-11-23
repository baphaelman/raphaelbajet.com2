// Draws the rupture's ink (SlopRupture.jsx) with WebGL: glossy, near black, purple where it's thin or the zone's light
// comes up through it, clear enough in the split to make out the zone's text under it. The same drawing, run on, is the
// tear that pulls the split open (slopCrack.js, tearAt)
import { PAD, STRANDS, DROPS } from './slopCrack.js';

const VERTEX = `#version 300 es
in vec2 corner;
void main() {
    gl_Position = vec4(corner, 0.0, 1.0);
}`;

const FRAGMENT = `#version 300 es
precision highp float;

#define STRANDS ${STRANDS}
#define DROPS ${DROPS}

uniform sampler2D goo;     // per css px of the crack's box and around it: r the ink (< 0 inside it), g the split, b how far outside the ink
uniform sampler2D rows;    // per row of it, at rest: the split's left side, its right, and its middle
uniform vec2 gooSize;      // css px
uniform float pad;
uniform vec2 origin;       // the canvas's top left, in css px from the crack box's top left
uniform float scale;       // device px a css px
uniform float canvasHeight;
uniform float swell;       // px the ink brims higher
uniform float glow;
// the tear (slopCrack.js, tearAt): the split stretched taller about its middle, its sides pulled apart, the skin of ink
// across it torn away down to its strands
uniform float middle;
uniform float splitLength;
uniform float tall;
uniform float strain;
uniform float pull;
uniform float level;
uniform float fade;
uniform int strandCount;
uniform vec4 strandEnds[STRANDS];
uniform vec4 strandLook[STRANDS];
uniform int dropCount;
uniform vec4 dropEnds[DROPS];
uniform float dropRadius[DROPS];

out vec4 color;

const vec3 INK = vec3(17.0, 4.0, 32.0) / 255.0;
const vec3 THIN = vec3(74.0, 20.0, 128.0) / 255.0;
const vec3 ROOM = vec3(120.0, 80.0, 190.0) / 255.0; // what the ink reflects
const vec3 GLOW = vec3(176.0, 96.0, 255.0) / 255.0;
const vec3 SHINE = vec3(246.0, 238.0, 255.0) / 255.0;
const vec3 STAIN = vec3(16.0, 7.0, 30.0) / 255.0;
const vec3 LIGHT = normalize(vec3(-0.5, -0.7, 0.75)); // from the top left, as on the rest of the page (y runs down)
const vec3 HALFWAY = normalize(LIGHT + vec3(0.0, 0.0, 1.0));
const float PI = 3.14159265;

float hash(vec2 p) {
    vec3 q = fract(vec3(p.xyx) * 0.1031);
    q += dot(q, q.yzx + 33.33);
    return fract((q.x + q.y) * q.z);
}

float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

float fbm(vec2 p, float size) {
    p /= size;
    float sum = 0.0;
    float weight = 0.5;
    float total = 0.0;
    for (int i = 0; i < 3; i++) {
        sum += noise(p) * weight;
        total += weight;
        weight *= 0.5;
        p = p * 2.03 + 17.0;
    }
    return sum / total;
}

float smin(float a, float b, float k) {
    float h = max(k - abs(a - b), 0.0) / k;
    return min(a, b) - h * h * k * 0.25;
}

// the texture at p, growing on past its edges
vec3 sampleGoo(vec2 p) {
    vec2 uv = (p + pad) / gooSize;
    float beyond = length(max(max(-uv, uv - 1.0), 0.0) * gooSize);
    return texture(goo, uv).rgb + beyond;
}

// Where p was in the crack at rest, before the tear: off to the side of the gap, where the side it's on was pulled
// from; in the gap, stretched across from the gap at rest. And, in the gap, how far it is from the nearer side (< 0)
struct Torn {
    vec2 rest;
    bool inGap;
    float gap;
};

Torn torn(vec2 p) {
    float y = middle + (p.y - middle) / tall;
    vec3 side = texture(rows, vec2((y + pad) / gooSize.y, 0.5)).rgb;
    float m = max(0.0, sin(PI * clamp(y / splitLength, 0.0, 1.0))); // sin(π) can come out a hair below 0, and pow() of that is NaN
    float apart = strain * pow(m, 0.8) + pull * pow(m, 0.3); // as slopCrack.js, pullAt
    float left = side.r - apart;
    float right = side.g + apart;
    if (p.x < left) return Torn(vec2(p.x + apart, y), false, 0.0);
    if (p.x > right) return Torn(vec2(p.x - apart, y), false, 0.0);
    float across = right - left > 0.01 ? (p.x - left) / (right - left) : 0.5;
    return Torn(vec2(mix(side.r, side.g, across), y), true, -min(p.x - left, right - p.x));
}

// how far p is from a strand of ink across the gap, < 0 inside it: sagging between its ends, thicker where it holds on;
// once it's snapped, each half whipping back to its side and hanging, with a bead where it broke
float strand(vec2 p, vec4 ends, vec4 look) {
    vec2 a = ends.xy;
    vec2 b = ends.zw;
    float sag = look.x;
    float r = look.y;
    float snapped = look.z;
    float span = b.x - a.x;
    if (span < 1.0 || p.x < a.x - 12.0 || p.x > b.x + 12.0) return 1e4;
    if (p.y < min(a.y, b.y) - 3.0 * r - 4.0 || p.y > max(a.y, b.y) + sag + 50.0 + 3.0 * r) return 1e4;
    if (snapped <= 0.0) {
        float u = clamp((p.x - a.x) / span, 0.0, 1.0);
        float y = mix(a.y, b.y, u) + 4.0 * sag * u * (1.0 - u);
        float slope = (b.y - a.y) / span + 4.0 * sag * (1.0 - 2.0 * u) / span;
        return abs(p.y - y) / sqrt(1.0 + slope * slope) - r * (1.0 + 2.0 * pow(2.0 * u - 1.0, 4.0));
    }
    float d = 1e4;
    for (int end = 0; end < 2; end++) {
        vec2 hold = end == 0 ? a : b;
        float toward = end == 0 ? 1.0 : -1.0;
        float share = end == 0 ? look.w : 1.0 - look.w;
        float reach = share * span * (1.0 - snapped);
        if (reach < 1.0) continue;
        float hang = sag * share + 50.0 * snapped;
        float along = (p.x - hold.x) * toward;
        float v = clamp(along / reach, 0.0, 1.0);
        float rad = r * (1.0 + 2.0 * pow(1.0 - v, 4.0)) + r * smoothstep(0.8, 1.0, v);
        if (along > reach) {
            d = min(d, length(p - vec2(hold.x + toward * reach, hold.y + hang)) - rad);
        } else {
            float y = hold.y + hang * v * v;
            float slope = 2.0 * hang * v / reach;
            d = min(d, abs(p.y - y) / sqrt(1.0 + slope * slope) - rad);
        }
    }
    return d;
}

// how far p is from a drop flung out as it breaks, < 0 inside it: a streak, tapering back along the way it came
float drop(vec2 p, vec4 ends, float r) {
    if (r <= 0.0) return 1e4;
    vec2 a = ends.xy;
    vec2 b = ends.zw;
    if (any(lessThan(p, min(a, b) - r - 2.0)) || any(greaterThan(p, max(a, b) + r + 2.0))) return 1e4;
    vec2 ab = b - a;
    float u = clamp(dot(p - a, ab) / max(dot(ab, ab), 1e-6), 0.0, 1.0);
    return length(p - a - ab * u) - r * (1.0 - 0.5 * u);
}

// the ink at p: as at rest, pulled apart with its sides; in the gap, a skin torn away down to its strands; and the
// drops flung out of it
float inkAt(vec2 p) {
    Torn here = torn(p);
    float ink = sampleGoo(here.rest).r - swell;
    if (here.inGap) {
        float skin = (fbm(vec2(here.rest.x * 0.3, here.rest.y * 0.75), 7.0) - level) * 45.0;
        ink = max(ink, min(-skin, -(here.gap + 5.0)));
    }
    for (int i = 0; i < STRANDS; i++) {
        if (i >= strandCount) break;
        ink = smin(ink, strand(p, strandEnds[i], strandLook[i]), 3.0);
    }
    for (int i = 0; i < DROPS; i++) {
        if (i >= dropCount) break;
        ink = smin(ink, drop(p, dropEnds[i], dropRadius[i]), 2.0);
    }
    return ink;
}

// the ink's surface: a rounded edge, then nearly flat, a little lumpy
float heightAt(vec2 p) {
    float sheet = 1.0 - pow(1.0 - clamp(-inkAt(p) / 13.0, 0.0, 1.0), 2.4);
    return sheet * (4.2 + 1.2 * (fbm(p, 16.0) - 0.5));
}

vec4 over(vec4 top, vec4 under) {
    return top + under * (1.0 - top.a);
}

void main() {
    vec2 p = origin + vec2(gl_FragCoord.x, canvasHeight - gl_FragCoord.y) / scale;
    Torn here = torn(p);
    vec3 at = sampleGoo(here.rest);
    float ink = inkAt(p);
    float split = here.inGap ? here.gap : at.g;

    // the page around it: stained where the ink's soaked in, in its shadow, and lit faintly from the split
    float away = max(0.0, at.b - swell);
    float reach = 5.0 + 16.0 * pow(fbm(p, 20.0), 1.5);
    float stain = here.inGap ? 0.0 : 0.75 * smoothstep(0.0, 1.0, exp(-away / reach) + 0.45 * (fbm(p, 3.5) - 0.5));
    float shadow = 0.55 * smoothstep(2.0, -2.0, inkAt(p - vec2(2.0, 2.6)));
    vec4 c = vec4(STAIN * stain * (1.0 - shadow), 1.0 - (1.0 - stain) * (1.0 - shadow));
    float light = glow * (0.1 * exp(-max(split, 0.0) / 8.0) + 0.04 * exp(-max(split, 0.0) / 40.0)) * smoothstep(48.0, 30.0, split);
    c = over(vec4(GLOW * light, light), c);

    // how much of the ink here is a strand or a drop: thin enough for the zone's light to come through it
    float thread = 1e4;
    for (int i = 0; i < STRANDS; i++) {
        if (i >= strandCount) break;
        thread = min(thread, strand(p, strandEnds[i], strandLook[i]));
    }
    for (int i = 0; i < DROPS; i++) {
        if (i >= dropCount) break;
        thread = min(thread, drop(p, dropEnds[i], dropRadius[i]));
    }
    // (only once the skin of ink round them has torn away)
    float threadness = smoothstep(1.0, -1.0, thread) * step(-3.0, ink - thread) * smoothstep(0.0, 0.5, level);

    if (ink < 1.0) {
        float h = heightAt(p);
        vec3 n = normalize(vec3(
            -(heightAt(p + vec2(1.0, 0.0)) - heightAt(p - vec2(1.0, 0.0))) / 2.0,
            -(heightAt(p + vec2(0.0, 1.0)) - heightAt(p - vec2(0.0, 1.0))) / 2.0,
            1.0));
        float lit = max(0.0, dot(n, LIGHT));
        float sheen = max(0.0, dot(n, HALFWAY));
        float shine = 2.6 * pow(sheen, 160.0) + 0.16 * pow(sheen, 20.0);
        // dark and glossy: mostly what it reflects, the light side of the room, more of it at grazing angles
        vec2 bounce = 2.0 * n.z * n.xy;
        float room = smoothstep(-0.1, 0.8, -(bounce.x * 0.55 + bounce.y * 0.85)) * (0.12 + 0.88 * pow(1.0 - n.z, 2.5));
        float thick = mix(sqrt(min(1.0, h / 1.4)), 0.2, threadness);
        // light coming up through it near the split, where it's thin, and a faint sickly swirl of it inside
        float through = glow * (0.3 * exp(-max(0.0, split + 1.0) / 3.0) * (1.0 - 0.8 * thick) * (split < 0.0 ? 0.3 : 1.0)
            + 0.22 * smoothstep(0.45, 0.8, fbm(p, 14.0)) * smoothstep(60.0, 0.0, -ink)
            + 0.5 * threadness);
        // clear enough in the split to see the zone through
        float clear = smoothstep(2.0, -6.0, split);
        float body = 1.0 - 0.65 * clear;
        vec3 rgb = mix(THIN, INK, thick) * (0.55 + 0.45 * lit) * body + GLOW * through + SHINE * shine + ROOM * room;
        float cover = smoothstep(0.6, -0.6, ink * scale / 2.0) * (0.88 + 0.12 * thick);
        c = mix(c, vec4(rgb, max(body, max(rgb.r, max(rgb.g, rgb.b)))), cover);
    }

    color = c * (1.0 - fade);
}`;

function compile(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
    return shader;
}

function texture(gl, unit) {
    const tex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return tex;
}

const AT_REST = { tall: 1, strain: 0, pull: 0, level: -1, fade: 0 };
const NO_STRANDS = { count: 0, ends: new Float32Array(4 * STRANDS), look: new Float32Array(4 * STRANDS) };
const NO_DROPS = { count: 0, ends: new Float32Array(4 * DROPS), radius: new Float32Array(DROPS) };

// Draws the ink onto `canvas`, or returns null where there's no WebGL 2. `setGoo` takes the ink's shape (slopGoo.js);
// `draw` draws it in a crack shaped `shape` (crackShape), with the canvas's top left `origin` css px from the crack
// box's top left and `scale` device px to the css px, torn as far as `tear` (tearAt) with `strands` (tearStrands) and
// `drops` (tearDrops)
export function gooRenderer(canvas) {
    const gl = canvas.getContext('webgl2', { premultipliedAlpha: true, antialias: false, depth: false, stencil: false });
    if (!gl) return null;

    const program = gl.createProgram();
    gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX));
    gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAGMENT));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
    gl.useProgram(program);
    const at = (name) => gl.getUniformLocation(program, name);

    // one triangle over the whole canvas
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const corner = gl.getAttribLocation(program, 'corner');
    gl.enableVertexAttribArray(corner);
    gl.vertexAttribPointer(corner, 2, gl.FLOAT, false, 0, 0);

    const rowsTexture = texture(gl, 1);
    gl.uniform1i(at('rows'), 1);
    const gooTexture = texture(gl, 0);
    gl.uniform1i(at('goo'), 0);
    gl.uniform1f(at('pad'), PAD);

    let ready = false;
    return {
        setGoo({ width, height, data, rows }) {
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, gooTexture);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, width, height, 0, gl.RGBA, gl.FLOAT, data);
            gl.activeTexture(gl.TEXTURE1);
            gl.bindTexture(gl.TEXTURE_2D, rowsTexture);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, height, 1, 0, gl.RGBA, gl.FLOAT, rows);
            gl.uniform2f(at('gooSize'), width, height);
            ready = true;
        },
        draw({ origin, scale, shape, swell = 0, glow = 0.5, tear = AT_REST, strands = NO_STRANDS, drops = NO_DROPS }) {
            gl.viewport(0, 0, canvas.width, canvas.height);
            gl.clearColor(0, 0, 0, 0);
            gl.clear(gl.COLOR_BUFFER_BIT);
            if (!ready) return;
            gl.uniform2f(at('origin'), origin.x, origin.y);
            gl.uniform1f(at('scale'), scale);
            gl.uniform1f(at('canvasHeight'), canvas.height);
            gl.uniform1f(at('swell'), swell);
            gl.uniform1f(at('glow'), glow);
            gl.uniform1f(at('middle'), shape.middle.y);
            gl.uniform1f(at('splitLength'), shape.length);
            gl.uniform1f(at('tall'), tear.tall);
            gl.uniform1f(at('strain'), tear.strain);
            gl.uniform1f(at('pull'), tear.pull);
            gl.uniform1f(at('level'), tear.level);
            gl.uniform1f(at('fade'), tear.fade);
            gl.uniform1i(at('strandCount'), strands.count);
            gl.uniform4fv(at('strandEnds'), strands.ends);
            gl.uniform4fv(at('strandLook'), strands.look);
            gl.uniform1i(at('dropCount'), drops.count);
            gl.uniform4fv(at('dropEnds'), drops.ends);
            gl.uniform1fv(at('dropRadius'), drops.radius);
            gl.drawArrays(gl.TRIANGLES, 0, 3);
        },
        lost: () => gl.isContextLost(),
    };
}
