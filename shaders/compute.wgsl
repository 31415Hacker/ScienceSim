@group(0) @binding(0) var outputTexture: texture_storage_2d<rgba8unorm, write>;

struct SceneParams {
    spp: u32,
    maxBounces: u32,
    time: f32,
    pad1: u32,
    cameraPos: vec3<f32>,
    cameraPitch: f32,
    cameraYaw: f32,
    selectedPlanet: u32,
    focusSelected: u32,
    hoveredPlanet: u32,
    padding: u32,
};

@group(0) @binding(1) var<uniform> scene: SceneParams;

const PI: f32 = 3.14159265358979;
const NUM_BODIES: u32 = 9u;
const CORONA_STEPS: u32 = 24u;
const CORONA_RADIUS_SCALE: f32 = 12.0;
const CORONA_DENSITY_FALLOFF: f32 = 0.6;
const CORONA_EXTINCTION: f32 = 0.95;
const CORONA_SCATTERING: f32 = 1.35;
const CORONA_G: f32 = 0.84;

struct Ray {
    origin: vec3<f32>,
    direction: vec3<f32>,
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

fn intersectSphere(ray: Ray, center: vec3<f32>, radius: f32) -> f32 {
    let oc = ray.origin - center;
    let b = dot(oc, ray.direction);
    let c = dot(oc, oc) - radius * radius;
    let disc = b * b - c;
    if disc < 0.0 { return -1.0; }
    let sqrtDisc = sqrt(disc);
    var t = -b - sqrtDisc;
    if t < 0.001 {
        t = -b + sqrtDisc;
        if t < 0.001 { return -1.0; }
    }
    return t;
}

fn intersectSphereBounds(ray: Ray, center: vec3<f32>, radius: f32) -> vec2<f32> {
    let oc = ray.origin - center;
    let b = dot(oc, ray.direction);
    let c = dot(oc, oc) - radius * radius;
    let disc = b * b - c;
    if disc < 0.0 {
        return vec2<f32>(1e20, -1.0);
    }
    let s = sqrt(disc);
    return vec2<f32>(-b - s, -b + s);
}

fn intersectDisk(ray: Ray, center: vec3<f32>, innerR: f32, outerR: f32) -> f32 {
    if abs(ray.direction.y) < 1e-6 { return -1.0; }
    let t = (center.y - ray.origin.y) / ray.direction.y;
    if t < 0.001 { return -1.0; }
    let p = ray.origin + t * ray.direction;
    let dx = p.x - center.x;
    let dz = p.z - center.z;
    let d2 = dx * dx + dz * dz;
    if d2 < innerR * innerR || d2 > outerR * outerR { return -1.0; }
    return t;
}

fn planetPosition(dist: f32, period: f32, time: f32) -> vec3<f32> {
    if period < 0.001 { return vec3<f32>(0.0); }
    let angle = 2.0 * PI * time / period;
    return vec3<f32>(dist * cos(angle), 0.0, dist * sin(angle));
}

fn getPlanetColor(i: u32) -> vec3<f32> {
    switch i {
        case 0u { return vec3<f32>(1.0, 0.9, 0.7); }
        case 1u { return vec3<f32>(0.55, 0.53, 0.51); }
        case 2u { return vec3<f32>(0.9, 0.82, 0.55); }
        case 3u { return vec3<f32>(0.2, 0.5, 0.9); }
        case 4u { return vec3<f32>(0.8, 0.35, 0.15); }
        case 5u { return vec3<f32>(0.8, 0.65, 0.4); }
        case 6u { return vec3<f32>(0.85, 0.75, 0.55); }
        case 7u { return vec3<f32>(0.6, 0.85, 0.9); }
        case 8u { return vec3<f32>(0.25, 0.4, 0.9); }
        default { return vec3<f32>(1.0); }
    }
}

fn starField(dir: vec3<f32>) -> vec3<f32> {
    let theta = atan2(dir.z, dir.x);
    let phi = asin(clamp(dir.y, -1.0, 1.0));

    // Dense faint stars
    let cellX = i32(floor(theta * 500.0));
    let cellY = i32(floor(phi * 500.0));
    let seed = u32(cellX + cellY * 3141 + 50000);
    let h = randFloat(seed);
    if h < 0.003 {
        let brightness = 0.15 + 0.6 * fract(h * 333.0);
        let temp = randFloat(seed + 1u);
        let col = mix(vec3<f32>(0.7, 0.8, 1.0), vec3<f32>(1.0, 0.9, 0.7), temp);
        return col * brightness;
    }

    return vec3<f32>(0.0);
}

fn phaseHG(cosTheta: f32, g: f32) -> f32 {
    let g2 = g * g;
    let denom = max(1e-3, 1.0 + g2 - 2.0 * g * cosTheta);
    return (1.0 - g2) / (4.0 * PI * pow(denom, 1.5));
}

fn coronaDensity(point: vec3<f32>, center: vec3<f32>, sunRadius: f32) -> f32 {
    let r = length(point - center);
    if r <= sunRadius {
        return 0.0;
    }
    let surfaceDistance = r - sunRadius;
    let scaleHeight = max(sunRadius * CORONA_DENSITY_FALLOFF, 1e-3);
    return exp(-surfaceDistance / scaleHeight);
}

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
    let dims = textureDimensions(outputTexture);
    if id.x >= dims.x || id.y >= dims.y { return; }
    let dimsF = vec2<f32>(f32(dims.x), f32(dims.y));
    let uv = (vec2<f32>(f32(id.x), f32(id.y)) - 0.5 * dimsF) / dimsF.y;

    let cp = cos(scene.cameraPitch);
    let sp = sin(scene.cameraPitch);
    let cy = cos(scene.cameraYaw);
    let sy = sin(scene.cameraYaw);

    // Orbital distances (AU * 4), radii (exaggerated), periods (Earth = 1 yr)
    //          Sun    Merc   Venus  Earth  Mars   Juptr  Satrn  Urans  Neptn
    var dists   = array<f32, 9>(0.0,  1.55,  2.89,  4.0,   6.10,  20.8,  38.1,  76.8,  120.3);
    var radii   = array<f32, 9>(0.8,  0.04,  0.07,  0.08,  0.05,  0.45,  0.38,  0.18,  0.17);
    var periods = array<f32, 9>(0.0,  0.241, 0.615, 1.0,   1.881, 11.86, 29.46, 84.01, 164.8);

    var positions: array<vec3<f32>, 9>;
    for (var i = 0u; i < NUM_BODIES; i++) {
        positions[i] = planetPosition(dists[i], periods[i], scene.time);
    }

    let saturnPos = positions[6];
    let ringInner = radii[6] * 1.5;
    let ringOuter = radii[6] * 2.5;
    let sunRadius = radii[0];
    let sunCoronaRadius = sunRadius * CORONA_RADIUS_SCALE;

    var color = vec3<f32>(0.0);

    for (var s = 0u; s < scene.spp; s++) {
        let pixelSeed = id.x + id.y * 179u + s * 13u + 1u;
        let rx = (randFloat(pixelSeed) - 0.5) * 0.001;
        let ry = (randFloat(pixelSeed + 7u) - 0.5) * 0.001;

        // uv is already height-normalized, so x does not need a second aspect scale.
        let cam_x = uv.x + rx;
        let cam_y = uv.y + ry;
        let cam_z = -1.0;

        let y1 = cam_y * cp - cam_z * sp;
        let z1 = cam_y * sp + cam_z * cp;
        let x2 = cam_x * cy - z1 * sy;
        let z2 = cam_x * sy + z1 * cy;

        let rayDir = normalize(vec3<f32>(x2, y1, z2));
        let ray = Ray(scene.cameraPos, rayDir);
        let coronaHit = intersectSphereBounds(ray, positions[0], sunCoronaRadius);

        // Find closest intersection
        var closestT: f32 = 1e20;
        var hitIdx: i32 = -1;
        var hitRing: bool = false;

        for (var i = 0u; i < NUM_BODIES; i++) {
            let t = intersectSphere(ray, positions[i], radii[i]);
            if t > 0.0 && t < closestT {
                closestT = t;
                hitIdx = i32(i);
                hitRing = false;
            }
        }

        // Saturn's rings
        let ringT = intersectDisk(ray, saturnPos, ringInner, ringOuter);
        if ringT > 0.0 && ringT < closestT {
            closestT = ringT;
            hitIdx = 100;
            hitRing = true;
        }

        var sampleColor = vec3<f32>(0.0);
        var transmittance = 1.0;
        var volumeColor = vec3<f32>(0.0);
        let marchEnd = select(140.0, closestT, hitIdx >= 0);
        let marchStart = max(0.0, coronaHit.x);
        let volumeEnd = min(marchEnd, coronaHit.y);

        if volumeEnd > marchStart {
            let stepLen = (volumeEnd - marchStart) / f32(CORONA_STEPS);
            for (var step = 0u; step < CORONA_STEPS; step = step + 1u) {
                let t = marchStart + (f32(step) + 0.5) * stepLen;
                let samplePos = ray.origin + ray.direction * t;
                let density = coronaDensity(samplePos, positions[0], sunRadius);
                if density <= 1e-4 {
                    continue;
                }

                let toSun = positions[0] - samplePos;
                let sunDist = length(toSun);
                let sunDir = toSun / max(sunDist, 1e-3);
                let cosTheta = dot(-ray.direction, sunDir);

                let phase = phaseHG(cosTheta, CORONA_G);
                let sunRadiance = vec3<f32>(8.0, 6.0, 3.5) / (1.0 + sunDist * sunDist * 0.018);
                let scatterStrength = sunRadiance * density * CORONA_SCATTERING * phase;
                volumeColor += transmittance * scatterStrength * stepLen;
                transmittance *= exp(-density * CORONA_EXTINCTION * stepLen);
            }
        }

        if hitIdx >= 0 {
            let hitPoint = ray.origin + closestT * ray.direction;

            if hitIdx == 0 {
                // Sun: emissive surface with subtle variation
                let n = normalize(hitPoint - positions[0]);
                let noise = fract(sin(dot(n.xz * 15.0 + scene.time * 0.5, vec2<f32>(12.9898, 78.233))) * 43758.5453);
                sampleColor = mix(vec3<f32>(1.0, 0.55, 0.1), vec3<f32>(1.0, 1.0, 0.85), noise * 0.4 + 0.6) * 3.0;

            } else if hitRing {
                // Saturn's ring with Cassini division
                let dx = hitPoint.x - saturnPos.x;
                let dz = hitPoint.z - saturnPos.z;
                let ringDist = sqrt(dx * dx + dz * dz);
                let ringFrac = (ringDist - ringInner) / (ringOuter - ringInner);

                let gap = smoothstep(0.52, 0.56, ringFrac) * (1.0 - smoothstep(0.60, 0.64, ringFrac));
                let bands = 0.6 + 0.4 * (0.5 + 0.5 * sin(ringFrac * 30.0));
                let ringAlbedo = vec3<f32>(0.72, 0.65, 0.48) * (1.0 - gap * 0.8) * bands;

                let toSun = normalize(positions[0] - hitPoint);
                let normal = select(vec3<f32>(0.0, -1.0, 0.0), vec3<f32>(0.0, 1.0, 0.0), ray.direction.y < 0.0);
                let ndotl = max(dot(normal, toSun), 0.0);

                // Shadow from Saturn itself
                var inShadow = false;
                let shadowRay = Ray(hitPoint + normal * 0.001, toSun);
                let sunDist = length(positions[0] - hitPoint);
                let st = intersectSphere(shadowRay, saturnPos, radii[6]);
                if st > 0.0 && st < sunDist { inShadow = true; }

                if inShadow {
                    sampleColor = ringAlbedo * 0.02;
                } else {
                    sampleColor = ringAlbedo * (ndotl * 1.4 + 0.04);
                }

            } else {
                // Planet: diffuse lit by Sun
                let planetIdx = u32(hitIdx);
                let normal = normalize(hitPoint - positions[planetIdx]);
                let albedo = getPlanetColor(planetIdx);
                let isSelected = scene.selectedPlanet != 0xffffffffu && planetIdx == scene.selectedPlanet;
                let isHovered = scene.hoveredPlanet != 0xffffffffu && planetIdx == scene.hoveredPlanet;

                let toSun = normalize(positions[0] - hitPoint);
                let ndotl = max(dot(normal, toSun), 0.0);

                // Shadow check against other bodies
                var inShadow = false;
                let shadowRay = Ray(hitPoint + normal * 0.001, toSun);
                let sunDist = length(positions[0] - hitPoint);
                for (var j = 0u; j < NUM_BODIES; j++) {
                    if j == planetIdx || j == 0u { continue; }
                    let st = intersectSphere(shadowRay, positions[j], radii[j]);
                    if st > 0.0 && st < sunDist {
                        inShadow = true;
                        break;
                    }
                }
                // Ring shadow on Saturn
                if !inShadow && planetIdx == 6u {
                    let rt = intersectDisk(shadowRay, saturnPos, ringInner, ringOuter);
                    if rt > 0.0 && rt < sunDist { inShadow = true; }
                }

                if inShadow {
                    sampleColor = albedo * 0.02;
                } else {
                    sampleColor = albedo * (ndotl * 1.5 + 0.03);
                }

                if isSelected {
                    let viewFacing = max(dot(normal, -ray.direction), 0.0);
                    let rim = pow(1.0 - viewFacing, 3.0);
                    sampleColor = sampleColor * 1.25 + vec3<f32>(0.18, 0.16, 0.04) + rim * vec3<f32>(0.28, 0.22, 0.06);
                } else if isHovered {
                    let viewFacing = max(dot(normal, -ray.direction), 0.0);
                    let rim = pow(1.0 - viewFacing, 2.5);
                    sampleColor = sampleColor * 1.1 + vec3<f32>(0.12, 0.14, 0.18) + rim * vec3<f32>(0.18, 0.22, 0.3);
                }
            }
        } else {
            sampleColor = starField(rayDir);
        }

        color += volumeColor + transmittance * sampleColor;
    }

    color /= f32(scene.spp);

    // Tonemap + gamma
    color = color / (color + vec3<f32>(1.0));
    color = pow(color, vec3<f32>(1.0 / 2.2));

    textureStore(outputTexture, id.xy, vec4<f32>(color, 1.0));
}
