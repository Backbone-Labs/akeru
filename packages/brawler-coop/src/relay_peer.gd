class_name AkeruRelayPeer
extends MultiplayerPeerExtension
## Room-isolated full-mesh transport. Godot RPC authority remains on player 1.
signal room_ready(code: String)
signal room_error(message: String)
var socket := WebSocketPeer.new()
var status := MultiplayerPeer.CONNECTION_DISCONNECTED
var uid := 0
var target := 0
var channel := 0
var mode := MultiplayerPeer.TRANSFER_MODE_RELIABLE
var refusing := false
var packets: Array = []
var peers := {}
var request := {}
var sent := false
var last_ping := 0
var room_code := ""
var opened_at := 0

func open(url: String, room: String) -> Error:
	opened_at = Time.get_ticks_msec()
	request = {"type": "create"} if room.is_empty() else {"type": "join", "code": room}
	socket.inbound_buffer_size = 4 * 1024 * 1024
	socket.outbound_buffer_size = 4 * 1024 * 1024
	var error := socket.connect_to_url(url)
	if error == OK:
		status = MultiplayerPeer.CONNECTION_CONNECTING
	return error

func _poll() -> void:
	if status == MultiplayerPeer.CONNECTION_CONNECTING and Time.get_ticks_msec() - opened_at > 15000:
		room_error.emit("Connection timed out. Please try again.")
		_close()
		return
	socket.poll()
	if socket.get_ready_state() == WebSocketPeer.STATE_CLOSED:
		if status != MultiplayerPeer.CONNECTION_DISCONNECTED:
			room_error.emit("Connection lost. Create or join a new room.")
		status = MultiplayerPeer.CONNECTION_DISCONNECTED
		return
	if socket.get_ready_state() != WebSocketPeer.STATE_OPEN:
		return
	if not sent:
		sent = true
		socket.send_text(JSON.stringify(request))
	if Time.get_ticks_msec() - last_ping > 5000:
		last_ping = Time.get_ticks_msec()
		socket.send_text('{"type":"ping"}')
	while socket.get_available_packet_count() > 0:
		var packet := socket.get_packet()
		if not socket.was_string_packet():
			if packets.size() >= 8192:
				room_error.emit("Connection too slow. Please create a new room.")
				_close()
				return
			if packet.size() >= 13: packets.append(packet)
			continue
		var message = JSON.parse_string(packet.get_string_from_utf8())
		if not message is Dictionary:
			continue
		match message.get("type", ""):
			"welcome":
				uid = int(message.id)
				room_code = str(message.code)
				status = MultiplayerPeer.CONNECTION_CONNECTED
				for id in message.peers:
					peers[int(id)] = true
					peer_connected.emit(int(id))
				room_ready.emit(room_code)
			"joined":
				peers[int(message.id)] = true
				peer_connected.emit(int(message.id))
			"left":
				peers.erase(int(message.id))
				peer_disconnected.emit(int(message.id))
			"error", "ended":
				room_error.emit(str(message.get("message", "Room closed.")))
				_close()

func _get_available_packet_count() -> int: return packets.size()
func _get_connection_status() -> MultiplayerPeer.ConnectionStatus: return status
func _get_max_packet_size() -> int: return 65536
func _get_packet_peer() -> int: return packets[0].decode_s32(0) if not packets.is_empty() else 0
func _get_packet_channel() -> int: return packets[0].decode_u32(4) if not packets.is_empty() else 0
func _get_packet_mode() -> MultiplayerPeer.TransferMode: return packets[0].decode_u32(8) as MultiplayerPeer.TransferMode if not packets.is_empty() else MultiplayerPeer.TRANSFER_MODE_RELIABLE
func _get_packet_script() -> PackedByteArray: return packets.pop_front().slice(12) if not packets.is_empty() else PackedByteArray()
func _get_transfer_channel() -> int: return channel
func _get_transfer_mode() -> MultiplayerPeer.TransferMode: return mode
func _get_unique_id() -> int: return uid
func _is_refusing_new_connections() -> bool: return refusing
func _is_server() -> bool: return uid == 1
# The relay already supplies full mesh peer notifications and routing.
func _is_server_relay_supported() -> bool: return false
func _set_target_peer(value: int) -> void: target = value
func _set_transfer_channel(value: int) -> void: channel = value
func _set_transfer_mode(value: MultiplayerPeer.TransferMode) -> void: mode = value
func _set_refuse_new_connections(value: bool) -> void:
	refusing = value
	if uid == 1 and socket.get_ready_state() == WebSocketPeer.STATE_OPEN:
		socket.send_text(JSON.stringify({"type":"lock", "locked": value}))
func _put_packet_script(buffer: PackedByteArray) -> Error:
	if status != MultiplayerPeer.CONNECTION_CONNECTED: return ERR_UNAVAILABLE
	var packet := PackedByteArray()
	packet.resize(12)
	packet.encode_s32(0, target)
	packet.encode_u32(4, channel)
	packet.encode_u32(8, mode)
	packet.append_array(buffer)
	return socket.put_packet(packet)
func _disconnect_peer(id: int, _force: bool) -> void:
	if uid == 1: socket.send_text(JSON.stringify({"type":"kick", "id":id}))
func _close() -> void:
	status = MultiplayerPeer.CONNECTION_DISCONNECTED
	socket.close()
	packets.clear()
	peers.clear()
