
# Two reliable barriers keep old input and despawns ahead of scene teardown.
# WebSocket transport preserves ordering across Godot transfer channels.
var _restart_epoch := 0
var _barrier_acks := {}

func _restart_room(scene_path: String) -> void:
	_restart_epoch += 1
	var epoch := _restart_epoch
	_barrier_acks = {}
	multiplayer.multiplayer_peer.refuse_new_connections = true
	_prepare_restart.rpc(epoch)
	if not await _wait_for_barrier(): return
	var stage = get_tree().current_scene
	if stage:
		for spawner in stage.find_children("*", "MultiplayerSpawner", true, false):
			var parent = spawner.get_node_or_null(spawner.spawn_path)
			if parent == null: continue
			var scenes := []
			for index in spawner.get_spawnable_scene_count():
				scenes.append(spawner.get_spawnable_scene(index))
			for actor in parent.get_children():
				if actor.scene_file_path in scenes: actor.queue_free()
	# Flush authoritative despawns while every client still has its old scene.
	await get_tree().process_frame
	await get_tree().process_frame
	_barrier_acks = {}
	_restart_fence.rpc(epoch)
	if not await _wait_for_barrier(): return
	stage_ready = {}
	_load_stage.rpc(scene_path)

@rpc("authority", "call_local", "reliable")
func _prepare_restart(epoch: int) -> void:
	transitioning = true
	_restart_epoch = epoch
	get_tree().paused = false
	var stage = get_tree().current_scene
	if stage and stage.has_method("freeze_for_room_restart"):
		stage.freeze_for_room_restart()
	await get_tree().process_frame
	_send_barrier_ack(epoch)

@rpc("authority", "call_local", "reliable")
func _restart_fence(epoch: int) -> void:
	_send_barrier_ack(epoch)

func _send_barrier_ack(epoch: int) -> void:
	if not is_online(): return
	if is_host(): _barrier_acks[1] = true
	else: _restart_ack.rpc_id(1, epoch)

@rpc("any_peer", "call_remote", "reliable")
func _restart_ack(epoch: int) -> void:
	if is_host() and epoch == _restart_epoch and transitioning:
		var sender := multiplayer.get_remote_sender_id()
		if players.has(sender): _barrier_acks[sender] = true

func _wait_for_barrier() -> bool:
	var deadline := Time.get_ticks_msec() + 10000
	while is_online():
		var complete := true
		for id in players:
			if not _barrier_acks.has(id): complete = false
		if complete: return true
		if Time.get_ticks_msec() > deadline:
			last_error = "The room lost connection. Create a new room to play again."
			leave()
			ScreenTransitions.transition_to_scene("res://ui/main_menu/main_menu.tscn")
			return false
		await get_tree().process_frame
	return false

func finish_room_start() -> void:
	# Player spawns must reach clients before they resume input RPCs.
	await get_tree().process_frame
	await get_tree().process_frame
	if is_online() and is_host(): _resume_room.rpc()

@rpc("authority", "call_local", "reliable")
func _resume_room() -> void:
	transitioning = false
