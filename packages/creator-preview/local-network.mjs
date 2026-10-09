/** Local evaluation bridge. Never used by production packaging. */
import { request } from 'node:http';
export function createLocalNetwork(port) {
  if (!Number.isInteger(port) || port < 1024 || port > 65535)
    throw new Error('Expected an explicit local game-server port');
  return (req, socket, head) => {
    if (
      req.method !== 'GET' ||
      req.url !== '/ws' ||
      req.headers.origin !== `http://${req.headers.host}`
    ) {
      socket.end('HTTP/1.1 403 Forbidden\r\n\r\n');
      return;
    }
    // The local proxy authenticates the incoming title origin above. Its fixed
    // loopback origin lets the bounded game server admit this development hop.
    const headers = {
      Connection: 'Upgrade',
      Upgrade: 'websocket',
      Origin: `http://127.0.0.1:${port}`,
    };
    for (const key of ['sec-websocket-key', 'sec-websocket-version'])
      if (req.headers[key]) headers[key] = req.headers[key];
    const upstream = request({
      hostname: '127.0.0.1',
      port,
      path: '/ws',
      method: 'GET',
      headers,
    });
    upstream.on('upgrade', (res, peer, peerHead) => {
      socket.write(
        `HTTP/1.1 101 Switching Protocols\r\n${Object.entries(res.headers)
          .map(([k, v]) => `${k}: ${v}`)
          .join('\r\n')}\r\n\r\n`,
      );
      if (head.length) peer.write(head);
      if (peerHead.length) socket.write(peerHead);
      socket.pipe(peer).pipe(socket);
      socket.on('close', () => peer.destroy());
      peer.on('error', () => socket.destroy());
      socket.on('error', () => peer.destroy());
    });
    upstream.on('response', () =>
      socket.end('HTTP/1.1 502 Bad Gateway\r\n\r\n'),
    );
    upstream.on('error', () => socket.destroy());
    upstream.setTimeout(5000, () => upstream.destroy());
    socket.on('error', () => upstream.destroy());
    socket.on('close', () => upstream.destroy());
    upstream.end();
  };
}
