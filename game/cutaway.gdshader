shader_type spatial;
render_mode cull_disabled;

uniform vec4 color : source_color = vec4(0.73, 0.72, 0.68, 1.0);
uniform vec3 player_world;
uniform vec3 camera_world;
varying vec3 world_pos;

void vertex() {
	world_pos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
}

void fragment() {
	float rise = camera_world.y - player_world.y;
	float t = clamp((world_pos.y - player_world.y) / max(rise, 0.01), 0.0, 1.0);
	vec3 line_point = mix(player_world, camera_world, t);
	if (world_pos.y > player_world.y + 1.0 && world_pos.y < camera_world.y && distance(world_pos.xz, line_point.xz) < 2.8) {
		discard;
	}
	ALBEDO = color.rgb;
	ROUGHNESS = 1.0;
}
