/* Akeru host frontend, MIT. Upstream engine is fetched separately under CC0. */
#include <stdint.h>
#define SFG_SCREEN_RESOLUTION_X 320
#define SFG_SCREEN_RESOLUTION_Y 200
#define SFG_FPS 30
#include "game.h"
#include "sounds.h"
static int musicOn, soundIndex = -1, soundPosition, soundVolume;
static float audio[800];
static uint32_t pixels[320 * 200], now;
static uint16_t keys;
static int16_t mouseX, mouseY;
static uint8_t saved[SFG_SAVE_SIZE], hasSave;
static uint32_t dirty;
int8_t SFG_keyPressed(uint8_t key) { return (keys >> key) & 1; }
void SFG_getMouseOffset(int16_t *x, int16_t *y) { *x = mouseX; *y = mouseY; mouseX = mouseY = 0; }
uint32_t SFG_getTimeMs() { return now; }
void SFG_sleepMs(uint16_t ms) { (void)ms; }
static inline void SFG_setPixel(uint16_t x, uint16_t y, uint8_t color) {
  uint16_t c = paletteRGB565[color];
  pixels[y * 320 + x] = 0xff000000u | (((c >> 11) * 255 / 31)) |
    ((((c >> 5) & 63) * 255 / 63) << 8) | (((c & 31) * 255 / 31) << 16);
}
void SFG_playSound(uint8_t index, uint8_t volume) { soundIndex = index; soundPosition = 0; soundVolume = volume; }
void SFG_setMusic(uint8_t value) { if (value == 2) SFG_MusicState.t = SFG_TRACK_SAMPLES; else musicOn = value == 1; }
void SFG_processEvent(uint8_t event, uint8_t data) { (void)event; (void)data; }
void SFG_save(uint8_t data[SFG_SAVE_SIZE]) {
  for (int i = 0; i < SFG_SAVE_SIZE; i++) saved[i] = data[i];
  hasSave = 1; dirty++;
}
uint8_t SFG_load(uint8_t data[SFG_SAVE_SIZE]) {
  if (hasSave) for (int i = 0; i < SFG_SAVE_SIZE; i++) data[i] = saved[i];
  return 1;
}
void akeru_init(int restored) { hasSave = restored; SFG_init(); }
void akeru_mouse(int x, int y) {
  if (SFG_game.state != SFG_GAME_STATE_PLAYING) return;
  int nextX = mouseX + x, nextY = mouseY + y;
  mouseX = nextX < -4096 ? -4096 : nextX > 4096 ? 4096 : nextX;
  mouseY = nextY < -4096 ? -4096 : nextY > 4096 ? 4096 : nextY;
  if (y != 0) SFG_game.settings |= 0x04; /* mouse enables vertical look */
}
void akeru_release() {
  keys = 0; mouseX = mouseY = 0;
  for (int i = 0; i < SFG_KEY_COUNT; i++) SFG_game.keyStates[i] = 0;
}
int akeru_state() { return SFG_game.state; }
int akeru_tick(int elapsed, int input) {
  now += elapsed; keys = input;
  int result = SFG_mainLoopBody();
  /* A single confirmation of Play starts the level in the browser edition. */
  if (SFG_game.state == SFG_GAME_STATE_INTRO) SFG_setAndInitLevel(0);
  return result;
}
uint32_t *akeru_pixels() { return pixels; }
uint8_t *akeru_save() { return saved; }
int akeru_dirty() { return dirty; }

float *akeru_audio() {
  for (int i = 0; i < 800; i++) {
    float value = musicOn ? ((int)SFG_getNextMusicSample() - SFG_musicTrackAverages[SFG_MusicState.track]) / 512.0f : 0;
    if (soundIndex >= 0) {
      value += ((int)SFG_GET_SFX_SAMPLE(soundIndex,soundPosition) - 128) / 128.0f * soundVolume / 255.0f;
      if (++soundPosition >= SFG_SFX_SAMPLE_COUNT) soundIndex = -1;
    }
    audio[i] = value > 1 ? 1 : value < -1 ? -1 : value;
  }
  return audio;
}
