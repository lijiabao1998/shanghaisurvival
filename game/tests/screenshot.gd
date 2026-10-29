extends SceneTree

func _initialize() -> void:
	call_deferred("capture")

func capture() -> void:
	root.add_child(load("res://main.tscn").instantiate())
	for i in range(40):
		await process_frame
	var image := root.get_texture().get_image()
	var err := image.save_png("res://preview.png")
	print("Screenshot: ", err)
	quit(0 if err == OK else 1)
