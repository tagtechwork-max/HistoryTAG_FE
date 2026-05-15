import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { Client } from '@stomp/stompjs';
import SockJS from 'sockjs-client';
import {
  AUTH_TOKEN_REFRESHED_EVENT,
  getAuthToken,
  getStoredAccessToken,
} from '../api/client';

interface WebSocketContextType {
  subscribe: (destination: string, callback: (message: any) => void) => () => void;
  /** Send a message to a destination (e.g. /app/work-items/123/typing). Body will be JSON.stringified if object. */
  publish: (destination: string, body: string | object) => void;
  isConnected: boolean;
}

const WebSocketContext = createContext<WebSocketContextType | null>(null);

export const useWebSocket = () => {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error('useWebSocket must be used within a WebSocketProvider');
  }
  return context;
};

export const WebSocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isConnected, setIsConnected] = useState(false);
  const clientRef = useRef<Client | null>(null);
  const subscriptionsRef = useRef<{ [key: string]: ((message: any) => void)[] }>({});

  const disconnect = useCallback(() => {
    if (clientRef.current) {
      try {
        clientRef.current.deactivate();
      } catch (err) {
        console.error('Error deactivating WebSocket client:', err);
      }
      clientRef.current = null;
    }
    setIsConnected(false);
  }, []);

  const connect = useCallback(() => {
    try {
      const token = getAuthToken() || getStoredAccessToken();
      if (!token) {
        disconnect();
        return;
      }

      if (clientRef.current?.connected || clientRef.current?.active) {
        return;
      }

      if (clientRef.current) {
        disconnect();
      }

      const stompUrl = import.meta.env.VITE_NOTIFICATION_STOMP_URL || '/ws';

      const client = new Client({
        webSocketFactory: () => {
          try {
            return new SockJS(stompUrl);
          } catch (err) {
            console.error('Failed to create SockJS connection:', err);
            throw err;
          }
        },
        connectHeaders: { Authorization: `Bearer ${token}` },
        reconnectDelay: 5000,
        onConnect: () => {
          setIsConnected(true);
          Object.keys(subscriptionsRef.current).forEach((dest) => {
            try {
              client.subscribe(dest, (message) => {
                try {
                  const payload = JSON.parse(message.body);
                  subscriptionsRef.current[dest].forEach((cb) => {
                    try {
                      cb(payload);
                    } catch (err) {
                      console.error('Error in WebSocket callback:', err);
                    }
                  });
                } catch (err) {
                  console.error('Error parsing WebSocket message:', err);
                }
              });
            } catch (err) {
              console.error('Error subscribing to destination:', dest, err);
            }
          });
        },
        onDisconnect: () => {
          setIsConnected(false);
        },
        onStompError: (frame) => {
          console.error('STOMP error', frame);
          setIsConnected(false);
        },
        onWebSocketClose: () => {
          setIsConnected(false);
        },
      });

      client.activate();
      clientRef.current = client;
    } catch (err) {
      console.error('Failed to initialize WebSocket connection:', err);
      setIsConnected(false);
    }
  }, [disconnect]);

  const reconnect = useCallback(() => {
    disconnect();
    connect();
  }, [disconnect, connect]);

  useEffect(() => {
    connect();

    const onTokenRefreshed = () => {
      reconnect();
    };
    window.addEventListener(AUTH_TOKEN_REFRESHED_EVENT, onTokenRefreshed);

    return () => {
      window.removeEventListener(AUTH_TOKEN_REFRESHED_EVENT, onTokenRefreshed);
      disconnect();
    };
  }, [connect, disconnect, reconnect]);

  const subscribe = useCallback((destination: string, callback: (message: any) => void) => {
    if (!subscriptionsRef.current[destination]) {
      subscriptionsRef.current[destination] = [];
    }
    subscriptionsRef.current[destination].push(callback);

    let subscription: { unsubscribe: () => void } | null = null;
    if (clientRef.current?.connected) {
      subscription = clientRef.current.subscribe(destination, (message) => {
        const payload = JSON.parse(message.body);
        callback(payload);
      });
    }

    return () => {
      subscriptionsRef.current[destination] = subscriptionsRef.current[destination].filter(
        (cb) => cb !== callback
      );
      if (subscription) {
        subscription.unsubscribe();
      }
    };
  }, []);

  const publish = useCallback((destination: string, body: string | object) => {
    const client = clientRef.current;
    if (!client?.connected) return;
    const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
    client.publish({ destination, body: bodyStr });
  }, []);

  return (
    <WebSocketContext.Provider value={{ subscribe, publish, isConnected }}>
      {children}
    </WebSocketContext.Provider>
  );
};
