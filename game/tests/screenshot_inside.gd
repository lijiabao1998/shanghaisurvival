extends SceneTree

func _initialize() -> void:
	call_deferred("capture")

func capture() -> void:
	var scene: Node3D = load("res://main.tscn").instantiate()
	root.add_child(scene)
	for i in range(15):
		await physics_frame
	var player = scene.get_node("Player")
	var data: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://data/block.json"))
	var entrance: Array = data.entrance
	player.test_direction = (Vector3(entrance[0], player.position.y, -entrance[1]) - player.position).normalized()
	for i in range(116):
		await physics_frame
	player.test_direction = Vector3.ZERO
	for i in range(10):
		await process_frame
	var image := root.get_texture().get_image()
	var err := image.save_png("res://preview_inside.png")
	print("Inside screenshot: ", err)
	quit(0 if err == OK else 1)
