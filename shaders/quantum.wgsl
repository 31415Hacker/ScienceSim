@group(0) @binding(0) var outputTexture: texture_storage_2d<rgba8unorm, write>;

struct Params {
    width: f32,
    height: f32,
    wavelength_nm: f32,
    wave_scale: f32,
    laser_x: f32,
    laser_y: f32,
    laser_dir_x: f32,
    laser_dir_y: f32,
    aperture_width: f32,
    num_wavelets: u32,
    num_shapes: u32,
    brightness: f32,
    photon_count: u32,
    render_seed: u32,
    coherence: f32,
    source_spread: f32,
};

@group(0) @binding(1) var<uniform> params: Params;
@group(0) @binding(2) var<storage, read> shapes: array<f32>;

const PI: f32 = 3.14159265358979;
const TWO_PI: f32 = 6.28318530717958;
const SPECTRAL_SAMPLE_COUNT: u32 = 7u;
const SPECTRAL_WAVELENGTHS: array<f32, 7> = array<f32, 7>(405.0, 440.0, 470.0, 510.0, 560.0, 610.0, 670.0);
const SPECTRAL_WEIGHTS: array<f32, 7> = array<f32, 7>(0.80, 0.92, 1.00, 1.00, 0.96, 0.84, 0.68);

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

fn gaussianRandom(seed: u32) -> f32 {
    let u1 = max(randFloat(seed + 17u), 1e-6);
    let u2 = randFloat(seed + 53u);
    return sqrt(-2.0 * log(u1)) * cos(TWO_PI * u2);
}

fn samplePhotonRatio(probability: f32, photonCount: u32, seed: u32) -> f32 {
    let clamped = clamp(probability, 0.0, 1.0);
    let n = max(photonCount, 1u);
    let mean = clamped * f32(n);
    let variance = max(mean * (1.0 - clamped), 1e-4);
    let sample = round(mean + sqrt(variance) * gaussianRandom(seed + 101u));
    return clamp(sample / f32(n), 0.0, 1.0);
}

fn wavelengthToRgb(nm: f32) -> vec3<f32> {
    var r: f32 = 0.0;
    var g: f32 = 0.0;
    var b: f32 = 0.0;
    if (nm < 440.0) {
        r = -(nm - 440.0) / 60.0;
        b = 1.0;
    } else if (nm < 490.0) {
        g = (nm - 440.0) / 50.0;
        b = 1.0;
    } else if (nm < 510.0) {
        g = 1.0;
        b = -(nm - 510.0) / 20.0;
    } else if (nm < 580.0) {
        r = (nm - 510.0) / 70.0;
        g = 1.0;
    } else if (nm < 645.0) {
        r = 1.0;
        g = -(nm - 645.0) / 65.0;
    } else {
        r = 1.0;
    }
    var factor: f32 = 1.0;
    if (nm < 420.0) {
        factor = 0.3 + 0.7 * (nm - 380.0) / 40.0;
    } else if (nm > 700.0) {
        factor = 0.3 + 0.7 * (780.0 - nm) / 80.0;
    }
    return vec3<f32>(r * factor, g * factor, b * factor);
}

fn rot2d(p: vec2<f32>, angle: f32) -> vec2<f32> {
    let c = cos(angle);
    let s = sin(angle);
    return vec2<f32>(p.x * c - p.y * s, p.x * s + p.y * c);
}

fn lineCircleIntersect(a: vec2<f32>, b: vec2<f32>, radius: f32) -> vec2<f32> {
    let d = b - a;
    let a_coeff = dot(d, d);
    let b_coeff = 2.0 * dot(a, d);
    let c_coeff = dot(a, a) - radius * radius;
    let disc = b_coeff * b_coeff - 4.0 * a_coeff * c_coeff;
    if (disc < 0.0) {
        return vec2<f32>(-1.0, -1.0);
    }
    let sq = sqrt(disc);
    let t0 = (-b_coeff - sq) / (2.0 * a_coeff);
    let t1 = (-b_coeff + sq) / (2.0 * a_coeff);
    let enter = max(t0, 0.0);
    let exit_t = min(t1, 1.0);
    if (enter >= exit_t) {
        return vec2<f32>(-1.0, -1.0);
    }
    return vec2<f32>(enter, exit_t);
}

fn traceShapePath(src: vec2<f32>, dst: vec2<f32>, si: u32) -> vec2<f32> {
    let base = si * 8u;
    let stype = u32(shapes[base]);
    let cx = shapes[base + 1u];
    let cy = shapes[base + 2u];
    let p1 = shapes[base + 3u];
    let p2 = shapes[base + 4u];
    let rot = shapes[base + 5u];

    let center = vec2<f32>(cx, cy);
    let local_src = rot2d(src - center, -rot);
    let local_dst = rot2d(dst - center, -rot);

    if (stype == 0u) {
        return lineCircleIntersect(local_src, local_dst, p1);
    }

    let d = local_dst - local_src;
    var t_enter: f32 = 0.0;
    var t_exit: f32 = 1.0;

    var vx: array<f32, 4>;
    var vy: array<f32, 4>;
    var nv: u32;

    if (stype == 2u) {
        let hw = p1 * 0.5;
        let hh = p2 * 0.5;
        vx = array<f32, 4>(-hw, 0.0, hw, 0.0);
        vy = array<f32, 4>(hh, -hh, hh, 0.0);
        nv = 3u;
    } else {
        let hw = p1 * 0.5;
        let hh = p2 * 0.5;
        vx = array<f32, 4>(-hw, hw, hw, -hw);
        vy = array<f32, 4>(-hh, -hh, hh, hh);
        nv = 4u;
    }

    for (var i = 0u; i < 4u; i++) {
        if (i >= nv) { break; }
        let j = (i + 1u) % nv;
        let ex = vx[j] - vx[i];
        let ey = vy[j] - vy[i];
        let nx = ey;
        let ny = -ex;
        let denom = nx * d.x + ny * d.y;
        let num = nx * (local_src.x - vx[i]) + ny * (local_src.y - vy[i]);

        if (abs(denom) < 1e-8) {
            if (num > 0.0) { return vec2<f32>(-1.0, -1.0); }
            continue;
        }

        let t = -num / denom;
        if (denom < 0.0) {
            t_enter = max(t_enter, t);
        } else {
            t_exit = min(t_exit, t);
        }

        if (t_enter >= t_exit) { return vec2<f32>(-1.0, -1.0); }
    }

    if (t_enter >= t_exit) { return vec2<f32>(-1.0, -1.0); }
    return vec2<f32>(t_enter, t_exit);
}

fn traceOpticalPath(src: vec2<f32>, dst: vec2<f32>) -> vec2<f32> {
    var extra_opl: f32 = 0.0;
    var amplitude: f32 = 1.0;
    let seg_len = length(dst - src);

    for (var i = 0u; i < 16u; i++) {
        if (i >= params.num_shapes) { break; }
        let hit = traceShapePath(src, dst, i);
        if (hit.x >= 0.0 && hit.y > hit.x) {
            let path_len = seg_len * (hit.y - hit.x);
            let ior = shapes[i * 8u + 6u];
            let absorp = shapes[i * 8u + 7u];
            let mismatch = abs(ior - 1.0) / max(ior + 1.0, 1.0001);
            let interface_amp = sqrt(max(0.02, 1.0 - mismatch * mismatch));
            extra_opl += (ior - 1.0) * path_len;
            amplitude *= interface_amp * interface_amp;
            amplitude *= exp(-absorp * path_len);
        }
    }

    return vec2<f32>(extra_opl, amplitude);
}

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let px = f32(gid.x);
    let py = f32(gid.y);
    if (px >= params.width || py >= params.height) { return; }

    let pixel = vec2<f32>(px, py);
    let laser = vec2<f32>(params.laser_x, params.laser_y);
    let dir = normalize(vec2<f32>(params.laser_dir_x, params.laser_dir_y));
    let perp = vec2<f32>(-dir.y, dir.x);
    let N = max(params.num_wavelets, 1u);
    let coherence = clamp(params.coherence, 0.0, 1.0);
    let spread = max(params.source_spread, 0.0);

    let pixel_seed = params.render_seed * 747796405u + gid.x * 2891336453u + gid.y * 1181783497u;
    let exposure = params.brightness * 0.0025 * (0.35 + 0.65 * coherence);
    var spectral_rgb = vec3<f32>(0.0);
    var spectral_signal = 0.0;

    for (var s = 0u; s < SPECTRAL_SAMPLE_COUNT; s = s + 1u) {
        let wavelength_nm = SPECTRAL_WAVELENGTHS[s];
        let k = TWO_PI * 550.0 / (max(params.wave_scale, 1.0) * wavelength_nm);
        let spectral_seed = pixel_seed + s * 4099u;
        var re: f32 = 0.0;
        var im: f32 = 0.0;

        for (var i = 0u; i < N; i++) {

            let t = (f32(i) + 0.5) / f32(N) - 0.5;
            let wavelet_seed = params.render_seed * 1664525u + i * 1013904223u + s * 374761393u;
            var jitter: f32 = 0.0;
            var envelope: f32 = 1.0;
            if (spread > 1e-4) {
                jitter = gaussianRandom(wavelet_seed + 11u) * spread;
                let sigma = max(spread, 1.0);
                let norm = jitter / sigma;
                envelope = exp(-0.5 * norm * norm);
            }

            let src = laser + perp * (t * params.aperture_width + jitter);
            let delta = pixel - src;
            let r = length(delta);
            if (r < 1.0) { continue; }

            let forward = normalize(delta);
            let cos_angle = dot(forward, dir);
            if (cos_angle < -0.05) { continue; }

            let obliquity = max(0.0, (1.0 + cos_angle) * 0.5);
            let opt = traceOpticalPath(src, pixel);
            let phase_noise = (1.0 - coherence) * TWO_PI * (randFloat(wavelet_seed + 29u) - 0.5);
            let opl = r + opt.x;
            let phase = k * opl + phase_noise;
            let amp = opt.y * envelope * obliquity / sqrt(r);

            re += amp * cos(phase);
            im += amp * sin(phase);
        }

        let intensity = re * re + im * im;
        let detection_probability = clamp(1.0 - exp(-intensity * exposure), 0.0, 1.0);
        let measured_ratio = samplePhotonRatio(detection_probability, params.photon_count, spectral_seed);
        let quantum_signal = mix(detection_probability, measured_ratio, 0.88);
        let spectral_weight = SPECTRAL_WEIGHTS[s] * quantum_signal;
        spectral_rgb += wavelengthToRgb(wavelength_nm) * spectral_weight;
        spectral_signal += spectral_weight;
    }

    let color = spectral_rgb / max(spectral_signal, 1e-4);
    var finalColor = color * 1.35;
    finalColor += vec3<f32>(0.012, 0.018, 0.035);
    finalColor = pow(clamp(finalColor, vec3<f32>(0.0), vec3<f32>(1.0)), vec3<f32>(1.0 / 2.2));

    textureStore(outputTexture, vec2<i32>(i32(gid.x), i32(gid.y)), vec4<f32>(finalColor, 1.0));
}
