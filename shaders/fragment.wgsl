@group(0) @binding(0) var tex: texture_2d<f32>;

@fragment
fn main(@builtin(position) fragCoord: vec4<f32>) -> @location(0) vec4<f32> {
    let dims = textureDimensions(tex);
    let clamped = vec2<i32>(
        min(i32(fragCoord.x), i32(dims.x) - 1),
        max(0, i32(dims.y) - 1 - min(i32(fragCoord.y), i32(dims.y) - 1))
    );
    return textureLoad(tex, clamped, 0);
}
