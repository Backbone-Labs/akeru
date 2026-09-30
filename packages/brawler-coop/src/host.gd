extends Node
# Akeru-owned input/audio lifecycle adapter; the title implementation remains external.
var bridge: JavaScriptObject
var previous := {}
var host_paused := false
var game_was_paused := false
var report_timer := 0.0

func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	if not OS.has_feature("web"):
		return
	bridge = JavaScriptBridge.get_interface("akeruBrawler")
	for action in InputMap.get_actions():
		for event in InputMap.action_get_events(action):
			if event is InputEventJoypadButton or event is InputEventJoypadMotion:
				InputMap.action_erase_event(action, event)
	await get_tree().process_frame
	bridge.ready()

func _process(_delta: float) -> void:
	if bridge == null:
		return
	var state: Dictionary = JSON.parse_string(bridge.read())
	var is_paused: bool = state.get("paused", false)
	if is_paused != host_paused:
		if is_paused:
			game_was_paused = get_tree().paused
			if not Net.is_online(): get_tree().paused = true
		else:
			get_tree().paused = game_was_paused
		host_paused = is_paused
	AudioServer.set_bus_mute(0, state.get("muted", false) or host_paused)
	var actions: Dictionary = state.get("actions", {}) if not host_paused else {}
	for action in ["move_left", "move_right", "move_up", "move_down", "jump", "attack", "ui_left", "ui_right", "ui_up", "ui_down", "ui_accept", "ui_cancel"]:
		var value: float = clampf(float(actions.get(action, 0)), 0, 1)
		if value != float(previous.get(action, 0)):
			var event := InputEventAction.new()
			event.action = action
			event.pressed = value > 0
			event.strength = value
			Input.parse_input_event(event)
	previous = actions.duplicate()
	if bridge.take_restart() and (not Net.is_online() or Net.is_host()):
		game_was_paused = false
		get_tree().paused = host_paused and not Net.is_online()
		Net.start_stage("res://stages/stage_01/stage_01.tscn")
	report_timer += _delta
	if report_timer >= 0.2:
		report_timer = 0
		var scene = get_tree().current_scene
		var playing: bool = scene != null and scene.has_method("get_player")
		var positions := {}
		if playing:
			for id in Net.sorted_peer_ids():
				var player = scene.get_player(id)
				if is_instance_valid(player): positions[str(id)] = [player.position.x, player.position.y]
		bridge.report(JSON.stringify({"playing": playing, "online": Net.is_online(), "host": Net.is_host(), "room": Net.get("room_code"), "peer": Net.local_id(), "players": Net.players, "positions": positions}))
