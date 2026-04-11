@group(0) @binding(0) var outputTexture: texture_storage_2d<rgba8unorm, write>;

const MAX_LIGHT_SHAPES: u32 = 16u;
const PI: f32 = 3.141592653589793;
const SPECTRUM_MIN_NM: f32 = 380.0;
const SPECTRUM_MAX_NM: f32 = 780.0;
const MAX_DEPTH: u32 = 8u;
const MAX_STACK: u32 = 16u;
const LINE_WIDTH: f32 = 2.6;
const BG_GRID_STEP: f32 = 40.0;
const GLASS_ABSORPTION: f32 = 0.004;
const BK7_C1: f32 = 1.03961212;
const BK7_C2: f32 = 0.231792344;
const BK7_C3: f32 = 1.01046945;
const BK7_D1: f32 = 0.00600069867;
const BK7_D2: f32 = 0.0200179144;
const BK7_D3: f32 = 103.560653;

struct LightParams {
    canvasSize: vec2<f32>,
    laserPos: vec2<f32>,
    laserDir: vec2<f32>,
    laserHandleDistance: f32,
    mode: u32,
    branchMode: u32,
    selectedShape: u32,
    shapeCount: u32,
    ssaa: u32,
    spectrumSamples: u32,
    pad0: u32,
    pad1: u32,
    pad2: u32,
    pad3: u32,
    pad4: u32,
    pad5: u32,
    pad6: u32,
};

struct ShapeData {
    centerSize: vec4<f32>,
    params: vec4<f32>,
};

struct ShapeBuffer {
    shapes: array<ShapeData, MAX_LIGHT_SHAPES>,
};

@group(0) @binding(1) var<uniform> scene: LightParams;
@group(0) @binding(2) var<storage, read> shapeBuffer: ShapeBuffer;

struct RayState {
    origin: vec2<f32>,
    direction: vec2<f32>,
    ior: f32,
    intensity: f32,
    depth: u32,
};

struct Hit {
    t: f32,
    point: vec2<f32>,
    normal: vec2<f32>,
    inside: bool,
    shapeIndex: i32,
};

fn hash32(value: u32) -> u32 {
    var x = value;
    x ^= x >> 16u;
    x *= 0x7feb352du;
    x ^= x >> 15u;
    x *= 0x846ca68bu;
    x ^= x >> 16u;
    return x;
}

fn randFloat(seed: u32) -> f32 {
    return f32(hash32(seed)) / 4294967296.0;
}

fn clamp01(value: f32) -> f32 {
    return clamp(value, 0.0, 1.0);
}

fn rotate2(v: vec2<f32>, angle: f32) -> vec2<f32> {
    let c = cos(angle);
    let s = sin(angle);
    return vec2<f32>(v.x * c - v.y * s, v.x * s + v.y * c);
}

fn dot2(a: vec2<f32>, b: vec2<f32>) -> f32 {
    return a.x * b.x + a.y * b.y;
}

fn cross2(a: vec2<f32>, b: vec2<f32>) -> f32 {
    return a.x * b.y - a.y * b.x;
}

fn normalize2(v: vec2<f32>) -> vec2<f32> {
    let len = max(length(v), 1e-6);
    return v / len;
}

fn reflect2(direction: vec2<f32>, normal: vec2<f32>) -> vec2<f32> {
    return normalize2(direction - 2.0 * dot2(direction, normal) * normal);
}

fn refract2(direction: vec2<f32>, normal: vec2<f32>, n1: f32, n2: f32) -> vec2<f32> {
    var i = normalize2(direction);
    var n = normalize2(normal);
    var cosi = clamp(dot2(i, n), -1.0, 1.0);
    var etai = n1;
    var etat = n2;
    if (cosi > 0.0) {
        n = -n;
        let tmp = etai;
        etai = etat;
        etat = tmp;
    } else {
        cosi = -cosi;
    }
    let eta = etai / etat;
    let k = 1.0 - eta * eta * (1.0 - cosi * cosi);
    if (k < 0.0) {
        return vec2<f32>(0.0);
    }
    return normalize2(eta * i + (eta * cosi - sqrt(k)) * n);
}

fn fresnelPowerCoefficients(direction: vec2<f32>, normal: vec2<f32>, n1: f32, n2: f32) -> vec4<f32> {
    let i = normalize2(direction);
    var n = normalize2(normal);
    var cosi = clamp(-dot2(i, n), -1.0, 1.0);
    var etai = n1;
    var etat = n2;
    if (cosi < 0.0) {
        cosi = -cosi;
        n = -n;
        let tmp = etai;
        etai = etat;
        etat = tmp;
    }
    let eta = etai / etat;
    let sin2t = eta * eta * max(0.0, 1.0 - cosi * cosi);
    if (sin2t > 1.0) {
        return vec4<f32>(1.0, 1.0, 0.0, 0.0);
    }
    let cost = sqrt(max(0.0, 1.0 - sin2t));
    let rs = ((etai * cosi) - (etat * cost)) / ((etai * cosi) + (etat * cost));
    let rp = ((etai * cost) - (etat * cosi)) / ((etai * cost) + (etat * cosi));
    let ts = (4.0 * etai * etat * cosi * cost) / pow((etai * cosi) + (etat * cost), 2.0);
    let tp = (4.0 * etai * etat * cosi * cost) / pow((etai * cost) + (etat * cosi), 2.0);
    return vec4<f32>(max(0.0, rs * rs), max(0.0, rp * rp), max(0.0, ts), max(0.0, tp));
}

fn sellmeierBk7Index(wavelengthNm: f32) -> f32 {
    let lambda = wavelengthNm / 1000.0;
    let lambda2 = lambda * lambda;
    let n2 = 1.0
        + (BK7_C1 * lambda2) / (lambda2 - BK7_D1)
        + (BK7_C2 * lambda2) / (lambda2 - BK7_D2)
        + (BK7_C3 * lambda2) / (lambda2 - BK7_D3);
    return sqrt(n2);
}

fn glassIndexForWavelength(wavelengthNm: f32, baseIor: f32) -> f32 {
    let reference = sellmeierBk7Index(550.0);
    let shift = sellmeierBk7Index(wavelengthNm) - reference;
    return max(1.0001, baseIor + shift);
}

fn wavelengthToRgb(wavelengthNm: f32) -> vec3<f32> {
    var r = 0.0;
    var g = 0.0;
    var b = 0.0;
    let w = wavelengthNm;
    if (w >= 380.0 && w < 440.0) {
        r = -(w - 440.0) / (440.0 - 380.0);
        b = 1.0;
    } else if (w < 490.0) {
        g = (w - 440.0) / (490.0 - 440.0);
        b = 1.0;
    } else if (w < 510.0) {
        g = 1.0;
        b = -(w - 510.0) / (510.0 - 490.0);
    } else if (w < 580.0) {
        r = (w - 510.0) / (580.0 - 510.0);
        g = 1.0;
    } else if (w < 645.0) {
        r = 1.0;
        g = -(w - 645.0) / (645.0 - 580.0);
    } else if (w <= 780.0) {
        r = 1.0;
    }

    var factor = 0.0;
    if (w >= 380.0 && w < 420.0) {
        factor = 0.3 + 0.7 * (w - 380.0) / (420.0 - 380.0);
    } else if (w < 701.0) {
        factor = 1.0;
    } else if (w <= 780.0) {
        factor = 0.3 + 0.7 * (780.0 - w) / (780.0 - 700.0);
    }

    let gamma = 0.8;
    var adj = vec3<f32>(r, g, b) * factor;
    adj = vec3<f32>(
        select(0.0, pow(max(adj.x, 0.0), gamma), adj.x > 0.0),
        select(0.0, pow(max(adj.y, 0.0), gamma), adj.y > 0.0),
        select(0.0, pow(max(adj.z, 0.0), gamma), adj.z > 0.0)
    );
    return adj;
}

fn shapeType(shape: ShapeData) -> u32 {
    return u32(shape.params.w + 0.5);
}

fn shapeRotation(shape: ShapeData) -> f32 {
    return shape.params.x;
}

fn shapeIor(shape: ShapeData) -> f32 {
    return shape.params.y;
}

fn shapeAbsorption(shape: ShapeData) -> f32 {
    return shape.params.z;
}

fn shapeCenter(shape: ShapeData) -> vec2<f32> {
    return shape.centerSize.xy;
}

fn shapeSize(shape: ShapeData) -> vec2<f32> {
    return shape.centerSize.zw;
}

fn worldToLocal(point: vec2<f32>, shape: ShapeData) -> vec2<f32> {
    return rotate2(point - shapeCenter(shape), -shapeRotation(shape));
}

fn localToWorld(point: vec2<f32>, shape: ShapeData) -> vec2<f32> {
    return rotate2(point, shapeRotation(shape)) + shapeCenter(shape);
}

fn localToWorldVec(v: vec2<f32>, shape: ShapeData) -> vec2<f32> {
    return rotate2(v, shapeRotation(shape));
}

fn pointInPolygon(point: vec2<f32>, verts: array<vec2<f32>, 4>, count: u32) -> bool {
    var inside = false;
    var j = count - 1u;
    var i = 0u;
    loop {
        if (i >= count) { break; }
        let xi = verts[i].x;
        let yi = verts[i].y;
        let xj = verts[j].x;
        let yj = verts[j].y;
        let intersect = ((yi > point.y) != (yj > point.y))
            && (point.x < ((xj - xi) * (point.y - yi)) / ((yj - yi) + 1e-6) + xi);
        if (intersect) {
            inside = !inside;
        }
        j = i;
        i = i + 1u;
    }
    return inside;
}

fn raySegmentIntersection(origin: vec2<f32>, dir: vec2<f32>, a: vec2<f32>, b: vec2<f32>) -> f32 {
    let seg = b - a;
    let denom = cross2(dir, seg);
    if (abs(denom) < 1e-6) {
        return -1.0;
    }
    let diff = a - origin;
    let t = cross2(diff, seg) / denom;
    let u = cross2(diff, dir) / denom;
    if (t <= 1e-4 || u < 0.0 || u > 1.0) {
        return -1.0;
    }
    return t;
}

fn circleIntersection(origin: vec2<f32>, dir: vec2<f32>, shape: ShapeData) -> Hit {
    let c = shapeCenter(shape);
    let r = shapeSize(shape).x;
    let oc = origin - c;
    let b = dot2(oc, dir);
    let cterm = dot2(oc, oc) - r * r;
    let disc = b * b - cterm;
    if (disc < 0.0) {
        return Hit(1e20, vec2<f32>(0.0), vec2<f32>(0.0), false, -1);
    }
    let s = sqrt(disc);
    let inside = cterm <= 0.0;
    let t = select(-b - s, -b + s, inside);
    if (t <= 1e-4) {
        return Hit(1e20, vec2<f32>(0.0), vec2<f32>(0.0), false, -1);
    }
    let point = origin + dir * t;
    let normal = normalize2(point - c);
    return Hit(t, point, normal, inside, 0);
}

fn rectangleVertices(shape: ShapeData) -> array<vec2<f32>, 4> {
    let halfSize = 0.5 * shapeSize(shape);
    return array<vec2<f32>, 4>(
        vec2<f32>(-halfSize.x, -halfSize.y),
        vec2<f32>(halfSize.x, -halfSize.y),
        vec2<f32>(halfSize.x, halfSize.y),
        vec2<f32>(-halfSize.x, halfSize.y)
    );
}

fn prismVertices(shape: ShapeData) -> array<vec2<f32>, 4> {
    let halfWidth = 0.5 * shapeSize(shape).x;
    let halfHeight = 0.5 * shapeSize(shape).y;
    return array<vec2<f32>, 4>(
        vec2<f32>(-halfWidth, halfHeight),
        vec2<f32>(0.0, -halfHeight),
        vec2<f32>(halfWidth, halfHeight),
        vec2<f32>(0.0, 0.0)
    );
}

fn polygonIntersection(origin: vec2<f32>, dir: vec2<f32>, shape: ShapeData, verts: array<vec2<f32>, 4>, count: u32) -> Hit {
    let localOrigin = worldToLocal(origin, shape);
    let localDir = rotate2(dir, -shapeRotation(shape));
    let inside = pointInPolygon(localOrigin, verts, count);
    var bestT = 1e20;
    var bestNormal = vec2<f32>(0.0);
    var i = 0u;
    loop {
        if (i >= count) { break; }
        let a = verts[i];
        let b = verts[(i + 1u) % count];
        let t = raySegmentIntersection(localOrigin, localDir, a, b);
        if (t > 0.0 && t < bestT) {
            let edge = b - a;
            var candidate = normalize2(vec2<f32>(edge.y, -edge.x));
            let midpoint = 0.5 * (a + b);
            let probe = midpoint + candidate * 1e-3;
            if (pointInPolygon(probe, verts, count)) {
                candidate = -candidate;
            }
            bestT = t;
            bestNormal = normalize2(localToWorldVec(candidate, shape));
        }
        i = i + 1u;
    }
    if (bestT >= 1e19) {
        return Hit(1e20, vec2<f32>(0.0), vec2<f32>(0.0), false, -1);
    }
    let hitPoint = origin + dir * bestT;
    return Hit(bestT, hitPoint, bestNormal, inside, 0);
}

fn intersectShape(origin: vec2<f32>, dir: vec2<f32>, shape: ShapeData) -> Hit {
    switch shapeType(shape) {
        case 1u {
            return circleIntersection(origin, dir, shape);
        }
        case 2u {
            return polygonIntersection(origin, dir, shape, prismVertices(shape), 3u);
        }
        default {
            return polygonIntersection(origin, dir, shape, rectangleVertices(shape), 4u);
        }
    }
}

fn intersectScene(origin: vec2<f32>, dir: vec2<f32>) -> Hit {
    var best = Hit(1e20, vec2<f32>(0.0), vec2<f32>(0.0), false, -1);
    var i = 0u;
    loop {
        if (i >= scene.shapeCount || i >= MAX_LIGHT_SHAPES) { break; }
        var hit = intersectShape(origin, dir, shapeBuffer.shapes[i]);
        if (hit.t > 0.0 && hit.t < best.t) {
            hit.shapeIndex = i32(i);
            best = hit;
        }
        i = i + 1u;
    }
    return best;
}

fn distanceToSegment(p: vec2<f32>, a: vec2<f32>, b: vec2<f32>) -> f32 {
    let ab = b - a;
    let denom = max(dot2(ab, ab), 1e-6);
    let t = clamp(dot2(p - a, ab) / denom, 0.0, 1.0);
    let c = a + ab * t;
    return length(p - c);
}

fn lineMask(p: vec2<f32>, a: vec2<f32>, b: vec2<f32>, width: f32) -> f32 {
    let d = distanceToSegment(p, a, b);
    return smoothstep(width, max(width - 1.5, 0.1), d);
}

fn canvasEdgeIntersection(origin: vec2<f32>, dir: vec2<f32>, canvasSize: vec2<f32>) -> vec2<f32> {
    var bestT = 1e20;
    if (abs(dir.x) > 1e-6) {
        let tx0 = (0.0 - origin.x) / dir.x;
        let tx1 = (canvasSize.x - origin.x) / dir.x;
        if (tx0 > 1e-4) { bestT = min(bestT, tx0); }
        if (tx1 > 1e-4) { bestT = min(bestT, tx1); }
    }
    if (abs(dir.y) > 1e-6) {
        let ty0 = (0.0 - origin.y) / dir.y;
        let ty1 = (canvasSize.y - origin.y) / dir.y;
        if (ty0 > 1e-4) { bestT = min(bestT, ty0); }
        if (ty1 > 1e-4) { bestT = min(bestT, ty1); }
    }
    return origin + dir * bestT;
}

fn addSegmentContribution(samplePoint: vec2<f32>, start: vec2<f32>, end: vec2<f32>, color: vec3<f32>, intensity: f32, width: f32) -> vec3<f32> {
    let mask = lineMask(samplePoint, start, end, width);
    if (mask > 0.0) {
        return color * intensity * mask;
    }
    return vec3<f32>(0.0);
}

fn traceRayForSample(samplePoint: vec2<f32>, wavelengthNm: f32, mode: u32, branchMode: u32) -> vec3<f32> {
    var color = vec3<f32>(0.0);
    var stack: array<RayState, MAX_STACK>;
    var sp: u32 = 0u;
    stack[0] = RayState(scene.laserPos, normalize2(scene.laserDir), 1.0, 1.0, 0u);
    sp = 1u;

    let lineColor = select(vec3<f32>(1.0), wavelengthToRgb(wavelengthNm), mode == 0u);

    loop {
        if (sp == 0u) { break; }
        sp = sp - 1u;
        let state = stack[sp];
        if (state.depth > MAX_DEPTH || state.intensity < 0.01) {
            continue;
        }

        var hit = intersectScene(state.origin, state.direction);
        if (hit.shapeIndex < 0) {
            let end = canvasEdgeIntersection(state.origin, state.direction, scene.canvasSize);
            color = color + addSegmentContribution(samplePoint, state.origin, end, lineColor, state.intensity, LINE_WIDTH);
            continue;
        }

        let shape = shapeBuffer.shapes[u32(hit.shapeIndex)];
        let entering = !hit.inside;
        let nextIor = select(1.0, glassIndexForWavelength(wavelengthNm, shapeIor(shape)), entering);
        let faceNormal = select(-hit.normal, hit.normal, entering);
        let absorption = shapeAbsorption(shape);
        let arrivalIntensity = select(state.intensity, state.intensity * exp(-absorption * hit.t), hit.inside);
        let coeffs = fresnelPowerCoefficients(state.direction, faceNormal, state.ior, nextIor);
        let reflectance = 0.5 * (coeffs.x + coeffs.y);
        let transmittance = select(0.0, 0.5 * (coeffs.z + coeffs.w), coeffs.z + coeffs.w > 0.0);

        color = color + addSegmentContribution(samplePoint, state.origin, hit.point, lineColor, arrivalIntensity, LINE_WIDTH);

        let reflected = reflect2(state.direction, faceNormal);
        let refracted = refract2(state.direction, faceNormal, state.ior, nextIor);
        let widthStep = 0.8;

        if (mode == 3u) {
            if (length(refracted) > 0.0) {
                if (sp < MAX_STACK) {
                    stack[sp] = RayState(hit.point + refracted * widthStep, refracted, nextIor, arrivalIntensity * max(0.0, transmittance), state.depth + 1u);
                    sp = sp + 1u;
                }
            } else if (sp < MAX_STACK) {
                stack[sp] = RayState(hit.point + reflected * widthStep, reflected, state.ior, arrivalIntensity * reflectance, state.depth + 1u);
                sp = sp + 1u;
            }
            continue;
        }

        if (mode == 1u) {
            if (length(refracted) > 0.0 && sp < MAX_STACK) {
                stack[sp] = RayState(hit.point + refracted * widthStep, refracted, nextIor, arrivalIntensity * max(0.0, transmittance), state.depth + 1u);
                sp = sp + 1u;
            }
            continue;
        }

        if (mode == 2u) {
            if (branchMode != 2u && length(refracted) > 0.0 && sp < MAX_STACK) {
                stack[sp] = RayState(hit.point + refracted * widthStep, refracted, nextIor, arrivalIntensity * max(0.0, transmittance), state.depth + 1u);
                sp = sp + 1u;
            }
            if (branchMode != 1u && sp < MAX_STACK) {
                stack[sp] = RayState(hit.point + reflected * widthStep, reflected, state.ior, arrivalIntensity * reflectance, state.depth + 1u);
                sp = sp + 1u;
            }
            continue;
        }

        if (sp < MAX_STACK) {
            stack[sp] = RayState(hit.point + reflected * widthStep, reflected, state.ior, arrivalIntensity * reflectance, state.depth + 1u);
            sp = sp + 1u;
        }
        if (length(refracted) > 0.0 && sp < MAX_STACK) {
            stack[sp] = RayState(hit.point + refracted * widthStep, refracted, nextIor, arrivalIntensity * max(0.0, transmittance), state.depth + 1u);
            sp = sp + 1u;
        }
    }

    return color;
}

fn backgroundColor(screenPos: vec2<f32>) -> vec3<f32> {
    let t = clamp01(screenPos.y / max(scene.canvasSize.y, 1.0));
    let top = vec3<f32>(0.06, 0.09, 0.12);
    let bottom = vec3<f32>(0.02, 0.03, 0.05);
    let bg = mix(bottom, top, t);
    let gridX = abs(fract(screenPos.x / BG_GRID_STEP) - 0.5);
    let gridY = abs(fract(screenPos.y / BG_GRID_STEP) - 0.5);
    let grid = smoothstep(0.5, 0.48, min(gridX, gridY));
    return bg + vec3<f32>(0.04, 0.07, 0.11) * grid * 0.25;
}

fn shapeFillColor(shape: ShapeData, selected: bool) -> vec3<f32> {
    if (shapeType(shape) == 1u) {
        return select(vec3<f32>(0.38, 0.62, 0.92), vec3<f32>(0.55, 0.9, 1.0), selected);
    }
    if (shapeType(shape) == 2u) {
        return select(vec3<f32>(0.42, 0.66, 0.98), vec3<f32>(0.7, 0.92, 1.0), selected);
    }
    return select(vec3<f32>(0.33, 0.66, 0.94), vec3<f32>(0.72, 0.94, 1.0), selected);
}

fn renderShape(samplePoint: vec2<f32>, shape: ShapeData, selected: bool) -> vec3<f32> {
    let fillColor = shapeFillColor(shape, selected);
    let strokeColor = select(vec3<f32>(0.64, 0.82, 1.0), vec3<f32>(1.0, 0.88, 0.55), selected);
    switch shapeType(shape) {
        case 1u {
            let d = length(samplePoint - shapeCenter(shape));
            let r = shapeSize(shape).x;
            let fill = smoothstep(r + 1.0, r - 1.0, d);
            let stroke = smoothstep(r + 2.0, r + 0.5, abs(d - r));
            return fillColor * 0.2 * fill + strokeColor * 0.8 * stroke;
        }
        case 2u {
            let local = worldToLocal(samplePoint, shape);
            let verts = prismVertices(shape);
            let inside = pointInPolygon(local, verts, 3u);
            let edgeDist = min(
                min(distanceToSegment(local, verts[0], verts[1]), distanceToSegment(local, verts[1], verts[2])),
                distanceToSegment(local, verts[2], verts[0])
            );
            let fill = select(0.0, 1.0, inside);
            let stroke = smoothstep(2.5, 0.5, edgeDist);
            return fillColor * 0.16 * fill + strokeColor * 0.9 * stroke;
        }
        default {
            let local = worldToLocal(samplePoint, shape);
            let verts = rectangleVertices(shape);
            let inside = pointInPolygon(local, verts, 4u);
            let edgeDist = min(
                min(distanceToSegment(local, verts[0], verts[1]), distanceToSegment(local, verts[1], verts[2])),
                min(distanceToSegment(local, verts[2], verts[3]), distanceToSegment(local, verts[3], verts[0]))
            );
            let fill = select(0.0, 1.0, inside);
            let stroke = smoothstep(2.5, 0.5, edgeDist);
            return fillColor * 0.18 * fill + strokeColor * 0.85 * stroke;
        }
    }
}

fn renderLaser(samplePoint: vec2<f32>) -> vec3<f32> {
    let laser = scene.laserPos;
    let handle = laser + normalize2(scene.laserDir) * scene.laserHandleDistance;
    let body = smoothstep(10.0, 8.5, distance(samplePoint, laser));
    let handleGlow = smoothstep(8.5, 6.5, distance(samplePoint, handle));
    let beam = smoothstep(2.4, 0.5, distanceToSegment(samplePoint, laser, handle));
    return vec3<f32>(1.0, 0.86, 0.36) * body + vec3<f32>(0.5, 0.92, 1.0) * handleGlow + vec3<f32>(1.0, 0.9, 0.5) * beam * 0.4;
}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
    let dims = textureDimensions(outputTexture);
    if (id.x >= dims.x || id.y >= dims.y) {
        return;
    }

    let ssaa = max(1u, scene.ssaa);
    let dimsF = vec2<f32>(f32(dims.x), f32(dims.y));
    var accum = vec3<f32>(0.0);

    for (var sy = 0u; sy < ssaa; sy = sy + 1u) {
        for (var sx = 0u; sx < ssaa; sx = sx + 1u) {
            let sampleX = f32(id.x) + (f32(sx) + 0.5) / f32(ssaa);
            let sampleY = f32(dims.y) - 1.0 - (f32(id.y) + (f32(sy) + 0.5) / f32(ssaa));
            let samplePoint = vec2<f32>(sampleX, sampleY);
            var color = backgroundColor(samplePoint);

            for (var i = 0u; i < scene.shapeCount && i < MAX_LIGHT_SHAPES; i = i + 1u) {
                let shape = shapeBuffer.shapes[i];
                color = color + renderShape(samplePoint, shape, i == scene.selectedShape);
            }

            let mode = scene.mode;
            if (mode == 0u) {
                let sampleCount = max(1u, scene.spectrumSamples);
                for (var s = 0u; s < sampleCount; s = s + 1u) {
                    var t = 0.5;
                    if (sampleCount > 1u) {
                        t = f32(s) / f32(sampleCount - 1u);
                    }
                    let wavelength = mix(SPECTRUM_MIN_NM, SPECTRUM_MAX_NM, t);
                    color = color + traceRayForSample(samplePoint, wavelength, mode, scene.branchMode) / f32(sampleCount);
                }
            } else if (mode == 1u || mode == 3u) {
                color = color + traceRayForSample(samplePoint, 550.0, mode, scene.branchMode);
            } else {
                color = color + traceRayForSample(samplePoint, 550.0, mode, scene.branchMode);
            }

            color = color + renderLaser(samplePoint);
            accum = accum + color;
        }
    }

    accum = accum / f32(ssaa * ssaa);
    accum = accum / (accum + vec3<f32>(1.0));
    accum = pow(max(accum, vec3<f32>(0.0)), vec3<f32>(1.0 / 2.2));
    textureStore(outputTexture, vec2<i32>(i32(id.x), i32(id.y)), vec4<f32>(accum, 1.0));
}
