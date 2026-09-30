class_name Lobby
extends Control
## Uses the game's existing theme, controls, focus navigation and transition.
signal lobby_closed
var _busy := false
var _tween: Tween
@onready var _name_edit: LineEdit = %NameEdit
@onready var _address_edit: LineEdit = %AddressEdit
@onready var _host_button: Button = %HostButton
@onready var _join_button: Button = %JoinButton
@onready var _start_button: Button = %StartButton
@onready var _status: Label = %Status
@onready var _player_list: Label = %PlayerList
@onready var _setup_box: Control = %SetupBox
@onready var _room_box: Control = %RoomBox

func _ready() -> void:
	hide()
	_name_edit.text = Net.local_name
	_address_edit.max_length = 6
	Net.players_changed.connect(_refresh)
	Net.room_changed.connect(_refresh)
	Net.connection_failed.connect(_failed)
	Net.server_disconnected.connect(_failed)
	_status.add_theme_font_size_override("font_size", 30)
	# Retain the game's display type and focus style, with a compact readable surface.
	var panel := StyleBoxFlat.new()
	panel.bg_color = Color(0.055, 0.055, 0.06, 1)
	panel.border_color = Color(1, 1, 1, 0.16)
	panel.set_border_width_all(2)
	panel.set_corner_radius_all(20)
	$Center/Panel.add_theme_stylebox_override("panel", panel)
	%RoomCode.add_theme_font_size_override("font_size", 96)
	for field in [_name_edit, _address_edit]: field.custom_minimum_size.y = 120
	for button in [_host_button, _join_button, _start_button, %LeaveButton, %BackButton]: button.custom_minimum_size.y = 120
	_refresh()

func open_lobby() -> void:
	show()
	modulate.a = 0
	if _tween: _tween.kill()
	_tween = create_tween()
	_tween.tween_property(self, "modulate:a", 1.0, 0.2)
	_host_button.grab_focus()
	_refresh()

func auto_from_cli() -> void: pass

func _refresh() -> void:
	var in_room: bool = Net.is_online() and not Net.room_code.is_empty()
	_setup_box.visible = not in_room
	_room_box.visible = in_room
	_host_button.disabled = _busy and not in_room
	_join_button.disabled = _host_button.disabled
	if in_room:
		_busy = false
		_start_button.visible = Net.is_host()
		_start_button.disabled = Net.players.size() < 2
		var lines := PackedStringArray()
		for id in Net.sorted_peer_ids():
			lines.append("P%d   %s%s" % [Net.player_index(id) + 1, Net.player_name(id), "  ·  YOU" if id == Net.local_id() else ""])
		for index in range(Net.players.size(), 4): lines.append("P%d   Waiting for a friend…" % [index + 1])
		_player_list.text = "\n".join(lines)
		%RoomCode.text = Net.room_code
		_status.text = "Share this code. Start when your friends are ready." if Net.is_host() else "Waiting for the host to start."
		if Net.is_host() and not _start_button.disabled: _start_button.grab_focus()
	elif not Net.last_error.is_empty():
		_status.text = Net.last_error
	elif not _busy:
		_status.text = "Up to 4 players. Create a room or enter a friend's code."

func _connect_room(joining: bool) -> void:
	if _busy: return
	var code := _address_edit.text.strip_edges().to_upper()
	if joining and code.length() != 6:
		_status.text = "Enter the six-character room code."
		_address_edit.grab_focus()
		return
	Net.local_name = _name_edit.text.strip_edges().left(16)
	if Net.local_name.is_empty(): Net.local_name = "Player"
	_busy = true
	Net.last_error = ""
	_status.text = "Joining room…" if joining else "Creating room…"
	_refresh()
	var result: Error = Net.join(code) if joining else Net.host()
	if result != OK: _failed()

func _failed() -> void:
	_busy = false
	_refresh()

func _on_host_button_pressed() -> void: _connect_room(false)
func _on_join_button_pressed() -> void: _connect_room(true)
func _on_start_button_pressed() -> void:
	if Net.is_host() and Net.players.size() >= 2:
		Net.start_stage("res://stages/stage_01/stage_01.tscn")
func _on_leave_button_pressed() -> void:
	_busy = false
	Net.leave()
	Net.last_error = ""
	_refresh()
	_host_button.grab_focus()
func _on_back_button_pressed() -> void:
	_on_leave_button_pressed()
	close_lobby()
func close_lobby() -> void:
	hide()
	lobby_closed.emit()
