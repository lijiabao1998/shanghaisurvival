extends SceneTree

func _initialize() -> void:
	call_deferred("run_test")

func run_test() -> void:
	var scene: Node3D = load("res://main.tscn").instantiate()
	root.add_child(scene)
	for i in range(15):
		await physics_frame
	var player: CharacterBody3D = scene.get_node_or_null("Player")
	if player == null or not player.is_on_floor():
		printerr("FAIL: player missing or not on ground")
		quit(1)
		return
	var data: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://data/block.json"))
	var wall_faces := 0
	for child in scene.get_children():
		if child is StaticBody3D:
			for node in child.get_children():
				if node is CollisionShape3D and node.shape is ConcavePolygonShape3D:
					wall_faces += node.shape.get_faces().size()
	if wall_faces == 0:
		printerr("FAIL: no building wall collision triangles")
		quit(1)
		return
	var selected: Dictionary = {}
	for b in data.buildings:
		if b.id == data.entrance_building:
			selected = b
			break
	var polygon := PackedVector2Array()
	for p in selected.footprint:
		polygon.append(Vector2(p[0], p[1]))
	var start := player.position
	if Geometry2D.is_point_in_polygon(Vector2(start.x, -start.z), polygon):
		printerr("FAIL: spawn starts inside entrance building")
		quit(1)
		return
	var press := InputEventKey.new()
	press.keycode = KEY_W
	press.pressed = true
	var cam: Camera3D = player.get_node("Camera3D")
	var camera_before := cam.global_position
	Input.parse_input_event(press)
	for i in range(15):
		await physics_frame
	var release := InputEventKey.new()
	release.keycode = KEY_W
	release.pressed = false
	Input.parse_input_event(release)
	await physics_frame
	if player.position.distance_to(start) < 0.1 or cam.global_position.distance_to(camera_before) < 0.1:
		printerr("FAIL: W input or camera following")
		quit(1)
		return
	player.position = start
	player.velocity = Vector3.ZERO
	var entrance: Array = data.entrance
	player.test_direction = (Vector3(entrance[0], start.y, -entrance[1]) - start).normalized()
	for i in range(116):
		await physics_frame
	player.test_direction = Vector3.ZERO
	await physics_frame
	var end := player.position
	if not Geometry2D.is_point_in_polygon(Vector2(end.x, -end.z), polygon):
		printerr("FAIL: player did not enter chosen building. start=", start, " end=", end)
		quit(1)
		return
	await process_frame
	var hidden_inside := false
	for roof in scene.individual_roofs:
		if Geometry2D.is_point_in_polygon(Vector2(end.x, -end.z), roof.polygon) and not roof.mesh.visible:
			hidden_inside = true
	if not hidden_inside:
		printerr("FAIL: roof did not hide while player is inside")
		quit(1)
		return
	var wall_found := false
	for i in range(polygon.size()):
		if i == int(selected.door_edge):
			continue
		var a := polygon[i]
		var b := polygon[(i + 1) % polygon.size()]
		var edge := b - a
		if edge.length() < 4.0:
			continue
		var middle := (a + b) / 2.0
		var inner := Vector2(-edge.y, edge.x).normalized()
		var origin := middle + inner * 1.3
		if not Geometry2D.is_point_in_polygon(origin, polygon):
			continue
		player.position = Vector3(origin.x, 0.05, -origin.y)
		player.velocity = Vector3.ZERO
		await physics_frame
		player.test_direction = Vector3(-inner.x, 0, inner.y)
		for n in range(72):
			await physics_frame
		player.test_direction = Vector3.ZERO
		await physics_frame
		var blocked := player.position
		if not Geometry2D.is_point_in_polygon(Vector2(blocked.x, -blocked.z), polygon) or Vector2(blocked.x - origin.x, -blocked.z - origin.y).length() < 0.3:
			printerr("FAIL: walking into a solid wall was not correctly blocked: ", blocked)
			quit(1)
			return
		wall_found = true
		break
	if not wall_found:
		printerr("FAIL: no suitable wall to test")
		quit(1)
		return
	print("PASS: camera followed W input, roof hid inside, player walked through invented entrance and solid wall blocked walking; start=", start, " inside=", end)
	quit(0)
