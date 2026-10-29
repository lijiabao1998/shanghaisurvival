extends Node3D

const PLAYER_SCRIPT = preload("res://player.gd")
const DATA_PATH = "res://data/block.json"
const CUTAWAY_SHADER = preload("res://cutaway.gdshader")
var cutaway_materials: Array[ShaderMaterial] = []
var individual_roofs: Array[Dictionary] = []

func point3(v: Array, height := 0.0) -> Vector3:
	return Vector3(float(v[0]), height, -float(v[1]))

func create_material(color: Color) -> StandardMaterial3D:
	var mat := StandardMaterial3D.new()
	mat.albedo_color = color
	mat.roughness = 1.0
	mat.cull_mode = BaseMaterial3D.CULL_DISABLED
	return mat

func create_cutaway_material(color: Color) -> ShaderMaterial:
	var mat := ShaderMaterial.new()
	mat.shader = CUTAWAY_SHADER
	mat.set_shader_parameter("color", color)
	cutaway_materials.append(mat)
	return mat

func add_tri(st: SurfaceTool, a: Vector3, b: Vector3, c: Vector3) -> void:
	st.add_vertex(a)
	st.add_vertex(b)
	st.add_vertex(c)

func add_wall(st: SurfaceTool, collision: PackedVector3Array, a: Vector3, b: Vector3, bottom: float, top: float) -> void:
	var p0 := Vector3(a.x, bottom, a.z)
	var p1 := Vector3(b.x, bottom, b.z)
	var p2 := Vector3(b.x, top, b.z)
	var p3 := Vector3(a.x, top, a.z)
	add_tri(st, p0, p1, p2)
	add_tri(st, p0, p2, p3)
	collision.append_array(PackedVector3Array([p0, p1, p2, p0, p2, p3]))

func make_roads(roads: Array) -> void:
	if roads.is_empty():
		return
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	st.set_smooth_group(-1)
	var edging := SurfaceTool.new()
	edging.begin(Mesh.PRIMITIVE_TRIANGLES)
	edging.set_smooth_group(-1)
	for road in roads:
		var pts: Array = road.get("centerline", [])
		var width := float(road.get("width_m", 5.0))
		for i in range(pts.size() - 1):
			var a := point3(pts[i], 0.025)
			var b := point3(pts[i + 1], 0.025)
			var delta := b - a
			if delta.length() < 0.01:
				continue
			var side := Vector3(-delta.z, 0.0, delta.x).normalized() * width * 0.5
			add_tri(st, a - side, a + side, b + side)
			add_tri(st, a - side, b + side, b - side)
			# Thin visual edge bands; positions and road widths are estimates.
			var band := side.normalized() * 0.14
			var up := Vector3(0.0, 0.01, 0.0)
			for sign_value in [-1.0, 1.0]:
				var ea: Vector3 = a + side * float(sign_value) + up
				var eb: Vector3 = b + side * float(sign_value) + up
				add_tri(edging, ea - band, ea + band, eb + band)
				add_tri(edging, ea - band, eb + band, eb - band)
	st.generate_normals()
	var instance := MeshInstance3D.new()
	instance.mesh = st.commit()
	instance.material_override = create_material(Color(0.25, 0.27, 0.28))
	add_child(instance)
	edging.generate_normals()
	var edge_instance := MeshInstance3D.new()
	edge_instance.mesh = edging.commit()
	edge_instance.material_override = create_material(Color(0.45, 0.46, 0.43))
	add_child(edge_instance)

func make_buildings(buildings: Array) -> void:
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	st.set_smooth_group(-1)
	var windows := SurfaceTool.new()
	windows.begin(Mesh.PRIMITIVE_TRIANGLES)
	windows.set_smooth_group(-1)
	var window_count := 0
	var roof_material := create_cutaway_material(Color(0.44, 0.32, 0.27))
	var rooftop_material := create_cutaway_material(Color(0.45, 0.49, 0.47))
	var roof_details := 0
	var collision := PackedVector3Array()
	for building in buildings:
		var ring: Array = building["footprint"]
		var h := float(building["height_m"])
		var edge := int(building.get("door_edge", -1))
		for i in range(ring.size()):
			var a := point3(ring[i])
			var b := point3(ring[(i + 1) % ring.size()])
			if a.distance_to(b) < 0.01:
				continue
			if i == edge:
				var midpoint := (a + b) / 2.0
				var along := (b - a).normalized()
				var left := midpoint - along * 1.0
				var right := midpoint + along * 1.0
				add_wall(st, collision, a, left, 0.0, h)
				add_wall(st, collision, right, b, 0.0, h)
				add_wall(st, collision, left, right, 2.5, h)
			else:
				add_wall(st, collision, a, b, 0.0, h)
			# Procedural windows are visual dressing, not surveyed facade data.
			var edge_length := a.distance_to(b)
			if edge_length >= 3.0:
				var along := (b - a).normalized()
				var outward := Vector3(-(b.z - a.z), 0.0, b.x - a.x).normalized() * 0.035
				var columns := mini(int(edge_length / 3.2), 20)
				var floors := mini(int((h - 1.0) / 3.2), 9)
				for row in range(1, floors + 1):
					var base := float(row) * 3.0 + 0.45
					if base + 1.25 > h:
						break
					for col in range(columns):
						var center := a + along * ((float(col) + 0.5) * edge_length / float(columns)) + outward
						if i == edge and center.distance_to((a + b) / 2.0) < 1.7 and row == 1:
							continue
						var wa := center - along * 0.55
						var wb := center + along * 0.55
						add_tri(windows, Vector3(wa.x, base, wa.z), Vector3(wb.x, base, wb.z), Vector3(wb.x, base + 1.25, wb.z))
						add_tri(windows, Vector3(wa.x, base, wa.z), Vector3(wb.x, base + 1.25, wb.z), Vector3(wa.x, base + 1.25, wa.z))
						window_count += 1
		for hole in building.get("holes", []):
			for i in range(hole.size()):
				add_wall(st, collision, point3(hole[i]), point3(hole[(i + 1) % hole.size()]), 0.0, h)
		# A roof with courtyards needs polygon-hole triangulation; omit it rather than fill holes.
		if building.get("holes", []).is_empty():
			var polygon := PackedVector2Array()
			for p in ring:
				polygon.append(Vector2(float(p[0]), float(p[1])))
			var triangles := Geometry2D.triangulate_polygon(polygon)
			if triangles.is_empty():
				continue
			var roofs := SurfaceTool.new()
			roofs.begin(Mesh.PRIMITIVE_TRIANGLES)
			roofs.set_smooth_group(-1)
			for i in range(0, triangles.size(), 3):
				add_tri(roofs, point3(ring[triangles[i]], h), point3(ring[triangles[i + 1]], h), point3(ring[triangles[i + 2]], h))
			roofs.generate_normals()
			var roof := MeshInstance3D.new()
			roof.mesh = roofs.commit()
			roof.material_override = roof_material
			add_child(roof)
			individual_roofs.append({"mesh": roof, "polygon": polygon})
			if roof_details < 22 and h > 5.0 and triangles.size() >= 3:
				var center := Vector2.ZERO
				for p in polygon:
					center += p
				center /= float(polygon.size())
				if Geometry2D.is_point_in_polygon(center, polygon):
					# A stylized rooftop tank; not a surveyed feature.
					var tank := MeshInstance3D.new()
					var tank_mesh := CylinderMesh.new()
					tank_mesh.top_radius = 0.65
					tank_mesh.bottom_radius = 0.65
					tank_mesh.height = 1.25
					tank.mesh = tank_mesh
					tank.material_override = rooftop_material
					tank.position = Vector3(center.x, h + 0.625, -center.y)
					roof.add_child(tank)
					roof_details += 1
	st.generate_normals()
	var instance := MeshInstance3D.new()
	instance.mesh = st.commit()
	instance.material_override = create_cutaway_material(Color(0.72, 0.68, 0.61))
	add_child(instance)
	if window_count > 0:
		windows.generate_normals()
		var win := MeshInstance3D.new()
		win.mesh = windows.commit()
		win.material_override = create_cutaway_material(Color(0.27, 0.34, 0.36))
		add_child(win)
	var body := StaticBody3D.new()
	var shape := ConcavePolygonShape3D.new()
	shape.set_faces(collision)
	var collision_node := CollisionShape3D.new()
	collision_node.shape = shape
	body.add_child(collision_node)
	add_child(body)

func make_ground() -> void:
	var ground := StaticBody3D.new()
	var shape := BoxShape3D.new()
	shape.size = Vector3(280.0, 0.2, 280.0)
	var collision := CollisionShape3D.new()
	collision.shape = shape
	ground.add_child(collision)
	ground.position = Vector3(125.0, -0.1, -125.0)
	var mesh := BoxMesh.new()
	mesh.size = shape.size
	var visual := MeshInstance3D.new()
	visual.mesh = mesh
	visual.material_override = create_material(Color(0.50, 0.52, 0.48))
	ground.add_child(visual)
	add_child(ground)

func make_player(spawn: Array, entrance: Array) -> void:
	var player := CharacterBody3D.new()
	player.set_script(PLAYER_SCRIPT)
	player.name = "Player"
	var capsule := CapsuleShape3D.new()
	capsule.radius = 0.3
	capsule.height = 1.7
	var collision := CollisionShape3D.new()
	collision.shape = capsule
	collision.position.y = 0.85
	player.add_child(collision)
	var camera := Camera3D.new()
	camera.name = "Camera3D"
	camera.projection = Camera3D.PROJECTION_ORTHOGONAL
	camera.size = 44.0
	camera.position = Vector3(40.0, 56.0, 40.0)
	player.add_child(camera)
	var visual := Node3D.new()
	visual.name = "Visual"
	player.add_child(visual)
	make_character(visual)
	var marker := MeshInstance3D.new()
	var marker_mesh := CylinderMesh.new()
	marker_mesh.top_radius = 0.7
	marker_mesh.bottom_radius = 0.7
	marker_mesh.height = 0.035
	marker.mesh = marker_mesh
	marker.position.y = 0.03
	marker.material_override = create_material(Color(0.84, 0.69, 0.39))
	player.add_child(marker)
	var torch := SpotLight3D.new()
	torch.name = "Torch"
	torch.visible = false
	torch.spot_range = 22.0
	torch.spot_angle = 30.0
	torch.light_energy = 3.0
	torch.position.y = 1.15
	visual.add_child(torch)
	add_child(player)
	player.position = point3(spawn, 0.05)
	var target := point3(entrance, 0.05)
	camera.look_at(player.global_position + Vector3.UP, Vector3.UP)
	visual.look_at(target, Vector3.UP)
	var label := Label3D.new()
	label.text = "入口（示意）"
	label.font_size = 42
	label.pixel_size = 0.014
	label.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	label.no_depth_test = true
	label.position = point3(entrance, 3.0)
	add_child(label)

func add_character_part(parent: Node3D, size: Vector3, pos: Vector3, color: Color, name: String = "") -> MeshInstance3D:
	var mesh := BoxMesh.new()
	mesh.size = size
	var part := MeshInstance3D.new()
	part.name = name
	part.mesh = mesh
	part.position = pos
	part.material_override = create_material(color)
	parent.add_child(part)
	return part

func make_character(visual: Node3D) -> void:
	# Simple original low-poly character, not a Taipei asset.
	add_character_part(visual, Vector3(0.54, 0.65, 0.27), Vector3(0, 1.13, 0), Color(0.24, 0.34, 0.34), "Torso")
	add_character_part(visual, Vector3(0.34, 0.36, 0.32), Vector3(0, 1.69, 0), Color(0.84, 0.76, 0.64), "Head")
	add_character_part(visual, Vector3(0.18, 0.60, 0.20), Vector3(-0.18, 0.48, 0), Color(0.18, 0.21, 0.23), "LeftLeg")
	add_character_part(visual, Vector3(0.18, 0.60, 0.20), Vector3(0.18, 0.48, 0), Color(0.18, 0.21, 0.23), "RightLeg")
	add_character_part(visual, Vector3(0.17, 0.56, 0.19), Vector3(-0.36, 1.12, 0), Color(0.30, 0.40, 0.39), "LeftArm")
	add_character_part(visual, Vector3(0.17, 0.56, 0.19), Vector3(0.36, 1.12, 0), Color(0.30, 0.40, 0.39), "RightArm")

func _ready() -> void:
	var file := FileAccess.open(DATA_PATH, FileAccess.READ)
	if file == null:
		push_error("Missing demo data: " + DATA_PATH)
		return
	var data = JSON.parse_string(file.get_as_text())
	if not data is Dictionary:
		push_error("Invalid demo data")
		return
	var env := Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.background_color = Color(0.64, 0.73, 0.78)
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color(0.80, 0.85, 0.88)
	env.ambient_light_energy = 0.8
	var world := WorldEnvironment.new()
	world.environment = env
	add_child(world)
	var sun := DirectionalLight3D.new()
	sun.rotation_degrees = Vector3(-50.0, 35.0, 0.0)
	sun.light_energy = 1.0
	add_child(sun)
	make_ground()
	make_roads(data.get("roads", []))
	make_buildings(data["buildings"])
	make_player(data["spawn"], data["entrance"])
	var hud := CanvasLayer.new()
	var hud_background := ColorRect.new()
	hud_background.position = Vector2(6, 5)
	hud_background.size = Vector2(1180, 80)
	hud_background.color = Color(0.04, 0.06, 0.07, 0.72)
	hud_background.mouse_filter = Control.MOUSE_FILTER_IGNORE
	hud.add_child(hud_background)
	var text := Label.new()
	text.text = "上海街區白模  |  WASD 移動 · 滑鼠滾輪縮放 · Shift 跑 · 空白鍵跳 · F 手電筒\nCMAB 屋頂輪廓與推估高度；高度暫按米解讀。道路寬度估算，與建築存在重疊。入口、室內、窗戶、水塔和路邊線均為示意。\n道路資料 © OpenStreetMap contributors · ODbL · openstreetmap.org/copyright | 建築：Zhang, Zhao & Long, CMAB · CC BY 4.0"
	text.position = Vector2(12, 10)
	text.add_theme_color_override("font_color", Color.WHITE)
	text.add_theme_color_override("font_shadow_color", Color.BLACK)
	text.add_theme_constant_override("shadow_offset_x", 2)
	text.add_theme_constant_override("shadow_offset_y", 2)
	hud.add_child(text)
	add_child(hud)

func _process(_delta: float) -> void:
	var player := get_node_or_null("Player") as CharacterBody3D
	if player == null:
		return
	var camera := player.get_node("Camera3D") as Camera3D
	for mat in cutaway_materials:
		mat.set_shader_parameter("player_world", player.global_position)
		mat.set_shader_parameter("camera_world", camera.global_position)
	var point := Vector2(player.position.x, -player.position.z)
	for roof in individual_roofs:
		roof.mesh.visible = not Geometry2D.is_point_in_polygon(point, roof.polygon)
