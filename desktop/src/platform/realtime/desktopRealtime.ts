import { createContext, useContext, useEffect, useMemo } from 'react';
import { io, type Socket } from 'socket.io-client';
import { SOCKET_URL } from '../../config/api';
import { CLIENT_INSTANCE_ID } from './clientInstance';

export const DesktopSocketContext = createContext<Socket | null>(null);
const connectedSockets = new WeakSet<Socket>();

export function useDesktopSocket() {
  return useContext(DesktopSocketContext);
}

export function useDesktopSocketSession(token: string | null) {
  const socket = useMemo(() => {
    if (!token) return null;
    const connection = io(SOCKET_URL, {
      autoConnect: false,
      forceNew: true,
      auth: { token, clientInstanceId: CLIENT_INSTANCE_ID },
      transports: ['polling', 'websocket'],
      tryAllTransports: true,
    });
    connection.once('connect', () => connectedSockets.add(connection));
    return connection;
  }, [token]);

  useEffect(() => {
    if (!socket) return;
    const onError = (error: Error) => console.warn('[Realtime] Connection failed:', error.message);
    const onDisconnect = (reason: string) => console.debug('[Realtime] Disconnected:', reason);
    if (import.meta.env.DEV) {
      socket.on('connect_error', onError);
      socket.on('disconnect', onDisconnect);
    }
    // Let child listeners register and let the development Strict Mode probe clean up.
    const connectTimer = window.setTimeout(() => socket.connect(), 0);
    return () => {
      window.clearTimeout(connectTimer);
      socket.off('connect_error', onError);
      socket.off('disconnect', onDisconnect);
      socket.disconnect();
    };
  }, [socket]);

  return socket;
}

type RegisterListener = (event: string, listener: (...args: any[]) => void) => void;

export function subscribeToDesktopEvents(socket: Socket | null, register: (on: RegisterListener) => void) {
  const unsubscribe: Array<() => void> = [];
  if (socket) {
    register((event, listener) => {
      if (event === 'reconnect') {
        let wasConnected = connectedSockets.has(socket);
        const onConnect = () => {
          if (wasConnected) listener();
          wasConnected = true;
        };
        socket.on('connect', onConnect);
        unsubscribe.push(() => socket.off('connect', onConnect));
      } else {
        socket.on(event, listener);
        unsubscribe.push(() => socket.off(event, listener));
      }
    });
  }
  return () => unsubscribe.forEach((off) => off());
}
