import { pool } from '../db/pool.js';

export async function listConnectedSessions(io, now = Date.now(), database = pool) {
  const byUser = new Map();
  for (const socket of io?.of?.('/')?.sockets?.values() ?? []) {
    const claims = socket.user;
    if (!claims?.user_id || !socket.connected || !Number.isFinite(socket.data.connectedAt) || claims.exp * 1000 <= now) continue;
    const userId = Number(claims.user_id);
    const sessions = byUser.get(userId) ?? new Map();
    byUser.set(userId, sessions);
    const key = claims.jti ?? claims.iat ?? socket.id;
    let session = sessions.get(key);
    if (!session) {
      session = {
        loggedInAt: Number.isFinite(claims.iat) ? new Date(claims.iat * 1000).toISOString() : null,
        connections: [],
      };
      sessions.set(key, session);
    }
    session.connections.push(socket);
  }

  if (!byUser.size) return [];
  const [accounts] = await database.query(
    `SELECT u.user_id, u.first_name, u.last_name, u.email,
       (SELECT GROUP_CONCAT(r.code ORDER BY r.code) FROM USER_ROLES ur
        JOIN ROLES r ON r.role_id = ur.role_id WHERE ur.user_id = u.user_id) AS role_codes
     FROM USERS u WHERE u.user_id IN (?) AND u.is_active = TRUE AND u.deleted_at IS NULL
     ORDER BY u.last_name, u.first_name, u.user_id`,
    [[...byUser.keys()]],
  );
  return accounts.flatMap(account => [...byUser.get(Number(account.user_id)).values()].flatMap(session => {
    const live = session.connections.filter(socket => socket.connected);
    if (!live.length) return [];
    const since = live.reduce((earliest, socket) => Math.min(earliest, socket.data.connectedAt), Infinity);
    return [{
      userId: account.user_id,
      name: [account.first_name, account.last_name].filter(Boolean).join(' '),
      email: account.email,
      roles: account.role_codes?.split(',') ?? [],
      loggedInAt: session.loggedInAt,
      connectedSince: new Date(since).toISOString(),
      connections: live.length,
    }];
  }));
}

export function disconnectSessionSockets(io, user) {
  if (!user?.jti) return;
  for (const socket of io?.of?.('/')?.sockets?.values() ?? []) {
    if (socket.user?.jti === user.jti && socket.user.user_id === user.user_id) socket.disconnect(true);
  }
}
