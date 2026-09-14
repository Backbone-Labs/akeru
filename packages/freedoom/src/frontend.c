/* Akeru local libretro frontend. MIT; the linked PrBoom engine is GPL-2.0. */
#include <stdint.h>
#include <string.h>
#include <stdlib.h>
#include <stdio.h>
#include <stdarg.h>
#include "libretro.h"
static uint32_t pixels[2048 * 1200];
static float samples[16384];
static uint8_t save[1048576];
static unsigned width = 320, height = 200, format, sample_count;
static unsigned keys;
static int mouse_x, mouse_y;
extern int gamestate, gameepisode, gamemap, gametic;
extern void G_DeferedInitNew(int skill, int episode, int map);
static void log_message(enum retro_log_level level, const char *fmt, ...) {
  va_list args; va_start(args, fmt); /* Optional file probes are logged as errors upstream; absence is a normal fallback. */
  vfprintf(level >= RETRO_LOG_ERROR && strncmp(fmt, "FindFileInDir: not found", 23) ? stderr : stdout, fmt, args); va_end(args);
}
static bool environment(unsigned cmd, void *data) {
  switch(cmd) {
    case RETRO_ENVIRONMENT_GET_LOG_INTERFACE: ((struct retro_log_callback*)data)->log = log_message; return true;
    case RETRO_ENVIRONMENT_GET_SYSTEM_DIRECTORY:
    case RETRO_ENVIRONMENT_GET_SAVE_DIRECTORY: *(const char**)data = "/"; return true;
    case RETRO_ENVIRONMENT_SET_PIXEL_FORMAT:
      format = *(unsigned*)data;
      return format == RETRO_PIXEL_FORMAT_XRGB8888 || format == RETRO_PIXEL_FORMAT_RGB565;
    case RETRO_ENVIRONMENT_GET_VARIABLE: {
      struct retro_variable *v = data;
      if (!strcmp(v->key,"prboom-resolution")) v->value = "320x200";
      else if (!strcmp(v->key,"prboom-mouse_on")) v->value = "enabled";
      else if (!strcmp(v->key,"prboom-sound_samplerate")) v->value = "44100";
      else if (!strcmp(v->key,"prboom-framerate")) v->value = "35";
      else { v->value = NULL; return false; }
      return true;
    }
    case RETRO_ENVIRONMENT_GET_VARIABLE_UPDATE: *(bool*)data = false; return true;
    case RETRO_ENVIRONMENT_GET_CAN_DUPE: *(bool*)data = true; return true;
    case RETRO_ENVIRONMENT_SET_INPUT_DESCRIPTORS:
    case RETRO_ENVIRONMENT_SET_CONTROLLER_INFO:
    case RETRO_ENVIRONMENT_SET_VARIABLES:
    case RETRO_ENVIRONMENT_SET_GEOMETRY: return true;
    default: return false;
  }
}
static void video(const void *data, unsigned w, unsigned h, size_t pitch) {
  if (!data || w > 2048 || h > 1200) return;
  width = w; height = h;
  for (unsigned y = 0; y < h; y++) for (unsigned x = 0; x < w; x++) {
    uint32_t rgb;
    if (format == RETRO_PIXEL_FORMAT_XRGB8888) rgb = ((const uint32_t*)((const uint8_t*)data+y*pitch))[x];
    else { uint16_t c = ((const uint16_t*)((const uint8_t*)data+y*pitch))[x];
      rgb = ((c>>11)*255/31)<<16 | (((c>>5)&63)*255/63)<<8 | (c&31)*255/31; }
    pixels[y*w+x] = 0xff000000u | ((rgb&255)<<16) | (rgb&0xff00) | ((rgb>>16)&255);
  }
}
static size_t audio_batch(const int16_t *data, size_t frames) {
  size_t count = frames * 2; if (count > 16384 - sample_count) count = 16384 - sample_count;
  for (size_t i=0;i<count;i++) samples[sample_count++] = data[i]/32768.0f;
  return frames;
}
static void audio_sample(int16_t left, int16_t right) { int16_t pair[] = {left,right}; audio_batch(pair,1); }
static void poll(void) {}
static int16_t input(unsigned port, unsigned device, unsigned index, unsigned id) {
  (void)index; if (port) return 0;
  if (device == RETRO_DEVICE_JOYPAD && id < 16) return (keys>>id)&1;
  if (device == RETRO_DEVICE_MOUSE) {
    if (id == RETRO_DEVICE_ID_MOUSE_X) { int v=mouse_x; mouse_x=0; return v; }
    if (id == RETRO_DEVICE_ID_MOUSE_Y) { int v=mouse_y; mouse_y=0; return v; }
  }
  return 0;
}
int akeru_init(void) {
  retro_set_environment(environment); retro_set_video_refresh(video);
  retro_set_audio_sample(audio_sample); retro_set_audio_sample_batch(audio_batch);
  retro_set_input_poll(poll); retro_set_input_state(input); retro_init();
  retro_set_controller_port_device(0, RETRO_DEVICE_JOYPAD);
  struct retro_game_info info = {"/game.wad", NULL, 0, NULL};
  if (!retro_load_game(&info)) return 0;
  G_DeferedInitNew(2,1,1); return 1;
}
void akeru_tick(int mask) { keys=mask; sample_count=0; retro_run(); }
void akeru_mouse(int x, int y) { mouse_x=x; mouse_y=y; }
void akeru_release(void) { keys=0; mouse_x=mouse_y=0; }
uint32_t *akeru_pixels(void) { return pixels; }
int akeru_width(void) { return width; }
int akeru_height(void) { return height; }
float *akeru_audio(void) { return samples; }
int akeru_audio_count(void) { return sample_count/2; }
uint8_t *akeru_save(void) { return save; }
int akeru_serialize(void) {
  if (gamestate != 0) return 0;
  size_t size = retro_serialize_size();
  if (size > sizeof(save)) return 0;
  memset(save,0,sizeof(save)); return retro_serialize(save,size) ? size : 0;
}
int akeru_restore(int size) { return size > 0 && size <= sizeof(save) && retro_unserialize(save,size); }
int akeru_state(void) { return gamestate; }
int akeru_tic(void) { return gametic; }
int akeru_level(void) { return gameepisode*100+gamemap; }
void akeru_restart(int level) { if (level>=1 && level<=32) G_DeferedInitNew(2,1,level); }

double akeru_fps(void) { struct retro_system_av_info info; retro_get_system_av_info(&info); return info.timing.fps; }
