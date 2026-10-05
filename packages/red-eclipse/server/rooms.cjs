'use strict';
const { randomBytes } = require('node:crypto');
const CODE = /^[A-F0-9]{20}$/;
function normalizeCode(value) {
  if (typeof value !== 'string' || value.length > 32) return null;
  const code = value.toUpperCase().replace(/[ -]/g, '');
  return CODE.test(code) ? code : null;
}
class Rooms {
  constructor({ launch, now = Date.now, maximum = 4, idleMs = 600000 }) {
    this.launch = launch;
    this.now = now;
    this.maximum = maximum;
    this.idleMs = idleMs;
    this.rooms = new Map();
    this.tokens = new Map();
    this.ports = new Set();
    this.stopping = false;
  }
  async create() {
    this.sweep();
    if (this.stopping || this.rooms.size >= this.maximum)
      throw Object.assign(
        new Error('All private rooms are busy. Try again shortly.'),
        { status: 503 },
      );
    let port = 28700;
    while (this.ports.has(port)) port += 10;
    if (port > 65000)
      throw Object.assign(
        new Error('Rooms are restarting. Try again shortly.'),
        { status: 503 },
      );
    this.ports.add(port);
    const room = {
      code: randomBytes(10).toString('hex').toUpperCase(),
      token: randomBytes(24).toString('hex'),
      owner: randomBytes(24).toString('hex'),
      port,
      ready: false,
      clients: new Set(),
      touched: this.now(),
    };
    this.rooms.set(room.code, room);
    try {
      room.stop = await this.launch(room, () => {
        this.destroy(room);
        this.ports.delete(room.port);
      });
      if (this.stopping || !this.rooms.has(room.code)) {
        room.stop();
        throw Error('Room stopped during startup');
      }
      room.ready = true;
      this.tokens.set(room.token, room);
      return room;
    } catch (error) {
      this.destroy(room);
      throw error;
    }
  }
  join(code) {
    this.sweep();
    const room = this.rooms.get(normalizeCode(code));
    if (!room?.ready)
      throw Object.assign(
        new Error('Room not found or expired. Check the invite code.'),
        { status: 404 },
      );
    if (room.clients.size >= 8)
      throw Object.assign(new Error('This room is full (8 players).'), {
        status: 409,
      });
    room.touched = this.now();
    return room;
  }
  authorize(token) {
    this.sweep();
    const room =
      typeof token === 'string' && /^[a-f0-9]{48}$/.test(token)
        ? this.tokens.get(token)
        : null;
    return room?.ready && room.clients.size < 8 ? room : null;
  }
  destroy(room) {
    if (!this.rooms.delete(room.code)) return;
    this.tokens.delete(room.token);
    room.ready = false;
    for (const ws of room.clients) ws.close(1001, 'Private room closed');
    room.stop?.();
  }
  sweep() {
    for (const room of this.rooms.values())
      if (
        room.ready &&
        !room.clients.size &&
        this.now() - room.touched > this.idleMs
      )
        this.destroy(room);
  }
  close() {
    this.stopping = true;
    for (const room of this.rooms.values()) this.destroy(room);
  }
}
module.exports = { Rooms, normalizeCode };
