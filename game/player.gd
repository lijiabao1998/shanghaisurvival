extends CharacterBody3D

@onready var camera: Camera3D = $Camera3D
@onready var visual: Node3D = $Visual
@onready var torch: SpotLight3D = $Visual/Torch
var speed := 3.4
var animation_clock := 0.0
# Tests can drive a precise world direction to verify the door and wall.
var test_direction := Vector3.ZERO

func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventMouseButton and event.pressed:
		if event.button_index == MOUSE_BUTTON_WHEEL_UP:
			camera.size = maxf(18.0, camera.size * 0.9)
		elif event.button_index == MOUSE_BUTTON_WHEEL_DOWN:
			camera.size = minf(66.0, camera.size * 1.1)
	if event is InputEventKey and event.pressed and not event.echo and event.keycode == KEY_F:
		torch.visible = not torch.visible

func _physics_process(delta: float) -> void:
	var input := Vector2(float(Input.is_key_pressed(KEY_D)) - float(Input.is_key_pressed(KEY_A)), float(Input.is_key_pressed(KEY_W)) - float(Input.is_key_pressed(KEY_S))).normalized()
	var screen_right := camera.global_basis.x
	screen_right.y = 0.0
	screen_right = screen_right.normalized()
	var screen_forward := -camera.global_basis.z
	screen_forward.y = 0.0
	screen_forward = screen_forward.normalized()
	var direction := (screen_right * input.x + screen_forward * input.y).normalized()
	if test_direction.length_squared() > 0.0:
		direction = test_direction.normalized()
	var move_speed := (6.0 if Input.is_key_pressed(KEY_SHIFT) else speed)
	velocity.x = direction.x * move_speed
	velocity.z = direction.z * move_speed
	if not is_on_floor():
		velocity.y -= 20.0 * delta
	elif Input.is_key_pressed(KEY_SPACE):
		velocity.y = 5.0
	else:
		velocity.y = 0.0
	move_and_slide()
	# The source window is 250 m; don't walk off the finite ground mesh.
	position.x = clampf(position.x, 0.5, 249.5)
	position.z = clampf(position.z, -249.5, -0.5)
	if direction.length_squared() > 0.01:
		visual.look_at(visual.global_position + direction, Vector3.UP)
		animation_clock += delta * (13.0 if Input.is_key_pressed(KEY_SHIFT) else 9.0)
		var swing := sin(animation_clock) * 0.38
		$Visual/LeftLeg.rotation.x = swing
		$Visual/RightLeg.rotation.x = -swing
		$Visual/LeftArm.rotation.x = -swing * 0.65
		$Visual/RightArm.rotation.x = swing * 0.65
	else:
		for part in [$Visual/LeftLeg, $Visual/RightLeg, $Visual/LeftArm, $Visual/RightArm]:
			part.rotation.x = lerpf(part.rotation.x, 0.0, minf(delta * 10.0, 1.0))
