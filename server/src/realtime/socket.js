import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../utils/secrets.js';
import { redis, isRedisActive } from '../utils/redisClient.js';
import { isSessionAccountActive, sessionBlocklistKey } from '../auth/session.js';

export function attachRealtime(server, { isHttps, isOriginAllowed }) {
  // Mount Secure WebSockets (WSS over HTTPS)
  // ── SEC-10: the same origin allow-list as the HTTP API. Engine.IO
  // aborts the handshake when the origin callback errors, so browser
  // pages from unauthorized origins cannot open realtime connections
  // either (non-browser clients send no Origin header and pass).
  const io = new Server(server, {
    cors: {
      origin(origin, callback) {
        if (!origin || isOriginAllowed(origin)) return callback(null, true);
        console.warn(`⚠️ [Socket.IO CORS] Handshake from unauthorized origin rejected: ${origin}`);
        return callback(new Error('Origin not allowed by Socket.IO CORS policy'), false);
      },
      methods: ['GET', 'POST', 'PATCH'],
    },
  });

  // Socket.IO authentication middleware (asynchronous token validation)
  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.split(' ')[1];
    if (!token) {
      return next(new Error('Authentication required for WebSocket connection.'));
    }

    jwt.verify(token, JWT_SECRET, async (err, user) => {
      if (err || !user) {
        return next(new Error('Invalid or expired WebSocket authentication token.'));
      }

      // Check Redis token revocation blacklist
      if (isRedisActive()) {
        try {
          const blacklistKey = sessionBlocklistKey(user, token);
          const isRevoked = await redis.get(blacklistKey);
          if (isRevoked) {
            return next(new Error('WebSocket session revoked. Please re-authenticate.'));
          }
        } catch (redisErr) {
          console.error('[Socket.IO Revocation Check Warning]:', redisErr.message);
        }
      }

      try {
        if (!(await isSessionAccountActive(user.user_id))) {
          return next(new Error('WebSocket account is no longer active.'));
        }
      } catch (accountErr) {
        console.error('[Socket.IO Account Status Check Error]:', accountErr.message);
        return next(new Error('WebSocket account status could not be verified.'));
      }

      socket.user = user;
      next();
    });
  });

  io.on('connection', (socket) => {
    socket.data.connectedAt = Date.now();
    const userEmail = socket.user?.email || 'Authenticated User';
    const userId = socket.user?.user_id;
    const clientInstanceId = socket.handshake.auth?.clientInstanceId;
    console.log(`⚡ [Socket.IO ${isHttps ? 'WSS' : 'WS'}] Client connected: ${socket.id} (${userEmail})`);

    // ── Qualified Responder: per-user delivery rooms ─────────────────
    // EVERY authenticated socket joins its own user:<id> room. SOS alerts and
    // responder flag changes are emitted to these rooms — never to a shared
    // role room — because room membership would go stale (role edits,
    // suspensions, DB Studio edits) while the flag is always resolved live
    // from the database at dispatch time. Desktop sockets also join a
    // per-window room so actions such as incident documentation can target
    // only the renderer that initiated them.
    if (userId) {
      socket.join(`user:${userId}`);
      if (
        typeof clientInstanceId === 'string' &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clientInstanceId)
      ) {
        socket.join(`desktop:${userId}:${clientInstanceId}`);
      }
    }

    // Legacy 'responders' room registration from older mobile builds. The
    // server no longer maintains that room (alerts are delivered per user
    // above), so this is kept purely as a harmless acknowledgement — an old
    // build emitting join:responders still receives every alert in its own
    // user room and never errors.
    socket.on('join:responders', () => {
      console.log(
        `🛡️ [Socket.IO] Legacy join:responders acknowledged for ${socket.id} (${userEmail}) — delivery now targets user:${userId}`
      );
    });

    socket.on('disconnect', (reason) => {
      console.log(`🔌 [Socket.IO] Client disconnected: ${socket.id} (${reason})`);
    });
  });

  return io;
}
