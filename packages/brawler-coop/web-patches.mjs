import { readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { resolve } from 'node:path';
export function applyWebNetwork(work, root, relayUrl) {
  const read = (p) => readFileSync(resolve(work, p), 'utf8');
  const write = (p, s) => writeFileSync(resolve(work, p), s);
  let main = read('ui/main_menu/main_menu.gd');
  main = main.replace(
    '\t_button_start.grab_focus()',
    `\t_button_start.focus_neighbor_bottom = _button_start.get_path_to(_button_online)
\t_button_start.focus_next = _button_start.get_path_to(_button_online)
\t_button_online.focus_neighbor_top = _button_online.get_path_to(_button_start)
\t_button_online.focus_neighbor_bottom = _button_online.get_path_to(_button_how_to_play)
\t_button_how_to_play.focus_neighbor_top = _button_how_to_play.get_path_to(_button_online)
\t_button_start.grab_focus()`,
  );
  write('ui/main_menu/main_menu.gd', main);
  let net = read('net/net.gd');
  net = net.replace(
    'var _online := false',
    'signal room_changed\nvar room_code := ""\nvar last_error := ""\nvar transitioning := false\nvar _online := false',
  );
  net = net.replace(
    /func host\(port := DEFAULT_PORT\) -> Error:[\s\S]*?(?=\n\nfunc join)/,
    `func host(_port := DEFAULT_PORT) -> Error:
\treturn _open_web_room("")
`,
  );
  net = net.replace(
    /func join\(address: String, port := DEFAULT_PORT\) -> Error:[\s\S]*?(?=\n\n## Drop)/,
    `func join(address: String, _port := DEFAULT_PORT) -> Error:
\treturn _open_web_room(address.strip_edges().to_upper())

func _open_web_room(code: String) -> Error:
\t_close_peer()
\tlast_error = ""
\troom_code = ""
\tvar peer := AkeruRelayPeer.new()
\tpeer.room_error.connect(func(message: String):
\t\tlast_error = message
\t\troom_changed.emit())
\tpeer.room_ready.connect(func(value: String):
\t\troom_code = value
\t\tif peer.get_unique_id() == 1:
\t\t\tplayers = {1: {"name": local_name}}
\t\tplayers_changed.emit()
\t\troom_changed.emit())
\tvar error := peer.open(${JSON.stringify(relayUrl)}, code)
\tif error != OK:
\t\tlast_error = "Could not connect. Please try again."
\t\tsingle_player()
\t\treturn error
\tplayers = {}
\tstage_ready = {}
\t_online = true
\tmultiplayer.multiplayer_peer = peer
\treturn OK
`,
  );
  net = net.replace(
    '\t_online = false\n\tplayers =',
    '\t_online = false\n\ttransitioning = false\n\troom_code = ""\n\tplayers =',
  );
  net = net.replace(
    '\tstage_ready = {}\n\t_load_stage.rpc(scene_path)',
    '\tif transitioning: return\n\tif is_online():\n\t\t_restart_room(scene_path)\n\telse:\n\t\tstage_ready = {}\n\t\t_load_stage.rpc(scene_path)',
  );
  net = net.replace(
    'players[id] = {"name": p_name}',
    'players[id] = {"name": p_name.left(16)}',
  );
  net = net.replace(
    '\t_sync_players.rpc(players)\n\tplayers_changed.emit()',
    '\t_sync_players.rpc(players)\n\t\tvar stage = get_tree().current_scene\n\t\tif stage and stage.has_method("get_player"):\n\t\t\tvar player = stage.get_player(id)\n\t\t\tif is_instance_valid(player): player.queue_free()\n\tplayers_changed.emit()',
  );
  // The relay never uses LAN discovery, native sockets or UPnP.
  net = net.replace(
    /func get_local_addresses\(\) -> Array\[String\]:[\s\S]*?(?=\n###)/,
    'func get_local_addresses() -> Array[String]:\n\treturn []\n',
  );
  net = net.replace(/func _try_upnp\(port: int\) -> void:[\s\S]*/, '');
  net += readFileSync(
    resolve(root, 'packages/brawler-coop/src/round-transition.gd'),
    'utf8',
  );
  write('net/net.gd', net);
  let stage = read('stages/_base/base_stage.gd').replace(
    '\t\t_setup_player(player, peer_id)\n',
    '\t\t_setup_player(player, peer_id)\n\tif Net.is_online(): Net.finish_room_start()\n',
  );
  stage +=
    '\nfunc freeze_for_room_restart() -> void:\n\t_has_ended = true\n\tset_meta("akeru_restarting", true)\n\tprocess_mode = Node.PROCESS_MODE_DISABLED\n';
  write('stages/_base/base_stage.gd', stage);
  const spawner =
    'addons/quiver.beat_em_up/utilities/custom_nodes/enemy_spawner/quiver_enemy_spawner.gd';
  write(
    spawner,
    read(spawner).replace(
      'func spawn_current_wave() -> void:',
      'func spawn_current_wave() -> void:\n\tif get_tree().current_scene.has_meta("akeru_restarting"): return',
    ),
  );
  write(
    'net/net_sync.gd',
    read('net/net_sync.gd').replace(
      'if not Net.is_online() or',
      'if Net.transitioning or not Net.is_online() or',
    ),
  );
  for (const [from, to] of [
    ['relay_peer.gd', 'akeru_relay_peer.gd'],
    ['lobby.gd', 'ui/lobby/lobby.gd'],
  ])
    copyFileSync(
      resolve(root, 'packages/brawler-coop/src', from),
      resolve(work, to),
    );
  let scene = read('ui/lobby/lobby.tscn')
    .replace('text = "Host address"', 'text = "Room code"')
    .replace(
      'IP of the host (only needed to join)',
      '6 characters — only needed to join',
    )
    .replace('text = "HOST GAME"', 'text = "CREATE ROOM"')
    .replace('text = "JOIN GAME"', 'text = "JOIN ROOM"')
    .replace('text = "START"', 'text = "START MATCH"');
  scene = scene.replace(
    '[node name="PortLine" type="HBoxContainer" parent="Center/Panel/Margin/Column/SetupBox"]',
    '[node name="PortLine" type="HBoxContainer" parent="Center/Panel/Margin/Column/SetupBox"]\nvisible = false',
  );
  scene = scene.replace(
    '[node name="PlayersHeader"',
    '[node name="RoomCode" type="Label" parent="Center/Panel/Margin/Column/RoomBox"]\nunique_name_in_owner = true\nlayout_mode = 2\ntheme_override_font_sizes/font_size = 72\ntext = "------"\nhorizontal_alignment = 1\n\n[node name="PlayersHeader"',
  );
  write('ui/lobby/lobby.tscn', scene);
  let input = read('net/player_input.gd');
  input = input
    .replace(
      'func _physics_process(_delta: float) -> void:',
      'func _physics_process(_delta: float) -> void:\n\tif Net.transitioning: return',
    )
    .replace(
      'var local_direction := Input.get_vector("move_left", "move_right", "move_up", "move_down")',
      'var local_direction := Vector2.ZERO if AkeruHost.host_paused else Input.get_vector("move_left", "move_right", "move_up", "move_down")',
    )
    .replace(
      'var attack := Input.is_action_just_pressed("attack")',
      'var attack := not AkeruHost.host_paused and Input.is_action_just_pressed("attack")',
    )
    .replace(
      'var jump := Input.is_action_just_pressed("jump")',
      'var jump := not AkeruHost.host_paused and Input.is_action_just_pressed("jump")',
    );
  write('net/player_input.gd', input);
}
