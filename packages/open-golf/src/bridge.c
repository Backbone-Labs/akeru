/* Akeru adapter for the pinned upstream engine, compiled into main.c. */
#include <emscripten.h>
#include <string.h>
EMSCRIPTEN_KEEPALIVE int akeru_state(void) { return akeru_ready ? golf_game_get()->state : -1; }
EMSCRIPTEN_KEEPALIVE int akeru_level(void) { return golf_get()->level_num; }
EMSCRIPTEN_KEEPALIVE int akeru_strokes(void) { return golf_game_get()->stroke_count; }
EMSCRIPTEN_KEEPALIVE float akeru_ball_x(void) { return golf_game_get()->ball.pos.x; }
EMSCRIPTEN_KEEPALIVE void akeru_pause(int paused) {
    akeru_paused = paused;
    golf_inputs_init();
    if (akeru_ready && golf_game_get()->state == GOLF_GAME_STATE_AIMING) golf_game_get()->state = GOLF_GAME_STATE_WAITING_FOR_AIM;
}
EMSCRIPTEN_KEEPALIVE void akeru_confirm(void) {
    if (!akeru_ready || akeru_paused) return;
    golf_t *g = golf_get();
    golf_game_t *game = golf_game_get();
    if (g->state == GOLF_STATE_MAIN_MENU) golf_start_level(0);
    else if (game->state == GOLF_GAME_STATE_FINISHED) golf_start_level((g->level_num + 1) % 20);
    else if (game->state == GOLF_GAME_STATE_PAUSED) golf_game_resume();
}
EMSCRIPTEN_KEEPALIVE void akeru_menu(void) {
    if (akeru_ready && !akeru_paused) golf_goto_main_menu();
}
EMSCRIPTEN_KEEPALIVE void akeru_shoot(float angle, float power) {
    if (!akeru_ready || akeru_paused || !isfinite(angle) || !isfinite(power)) return;
    golf_game_t *game = golf_game_get();
    if (game->state != GOLF_GAME_STATE_WAITING_FOR_AIM) return;
    game->aim_line.power = fmaxf(0.01f, fminf(1.0f, power));
    golf_game_hit_ball(V2(sinf(angle), cosf(angle)));
}

EMSCRIPTEN_KEEPALIVE void akeru_release(void) { golf_inputs_init(); if (akeru_ready && golf_game_get()->state == GOLF_GAME_STATE_AIMING) golf_game_get()->state = GOLF_GAME_STATE_WAITING_FOR_AIM; }
EMSCRIPTEN_KEEPALIVE void akeru_start(int course) { if (akeru_ready && !akeru_paused && golf_get()->state == GOLF_STATE_MAIN_MENU && course >= 0 && course < 20) golf_start_level(course); }
