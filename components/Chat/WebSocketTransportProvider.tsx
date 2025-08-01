import React, { createContext, useContext, ReactNode } from 'react';
import { useWebSocketTransport } from '@/hooks/useWebSocketTransport';

interface WebSocketTransportContextProps {
  transport: ReturnType<typeof useWebSocketTransport>;
}

const WebSocketTransportContext = createContext<WebSocketTransportContextProps | undefined>(undefined);

interface WebSocketTransportProviderProps {
  children: ReactNode;
  conversationId: string;
  webSocketURL?: string;
  webSocketSchema?: string;
  onMessage?: (message: any) => void;
  onConnectionChange?: (connected: boolean) => void;
  onError?: (error: any) => void;
}

export const WebSocketTransportProvider: React.FC<WebSocketTransportProviderProps> = ({
  children,
  conversationId,
  webSocketURL,
  webSocketSchema,
  onMessage,
  onConnectionChange,
  onError,
}) => {
  const transport = useWebSocketTransport({
    conversationId,
    webSocketURL,
    webSocketSchema,
    onMessage,
    onConnectionChange,
    onError,
  });

  return (
    <WebSocketTransportContext.Provider value={{ transport }}>
      {children}
    </WebSocketTransportContext.Provider>
  );
};

export const useWebSocketTransportContext = (): WebSocketTransportContextProps => {
  const context = useContext(WebSocketTransportContext);
  if (context === undefined) {
    // More descriptive error with debugging information
    const error = new Error(
      'useWebSocketTransportContext must be used within a WebSocketTransportProvider. ' +
      'This usually means the Chat component is not properly wrapped with WebSocketTransportProvider.'
    );
    console.error('WebSocket Transport Context Error:', {
      error: error.message,
      stack: error.stack,
      component: 'useWebSocketTransportContext',
      timestamp: new Date().toISOString()
    });
    throw error;
  }
  return context;
};

// Safe version that returns null instead of throwing - useful for conditional usage
export const useWebSocketTransportContextSafe = (): WebSocketTransportContextProps | null => {
  try {
    const context = useContext(WebSocketTransportContext);
    return context || null;
  } catch (error) {
    console.warn('WebSocket Transport Context not available:', error);
    return null;
  }
};