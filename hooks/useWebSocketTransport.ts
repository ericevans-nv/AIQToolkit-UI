import { useRef, useState, useCallback, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import toast from 'react-hot-toast';
import { webSocketMessageTypes } from '@/utils/app/const';

interface WebSocketTransportConfig {
  conversationId: string;
  webSocketURL?: string;
  webSocketSchema?: string;
  onMessage?: (message: any) => void;
  onConnectionChange?: (connected: boolean) => void;
  onError?: (error: any) => void;
}

interface WebSocketTransport {
  // Connection state
  isConnected: boolean;
  isConnecting: boolean;
  
  // Connection management
  connect: () => Promise<boolean>;
  disconnect: () => void;
  
  // Message sending
  sendMessage: (message: any) => boolean;
  sendUserMessage: (content: any) => boolean;
  sendUserInteraction: (interactionMessage: any, userResponse: string) => boolean;
  
  // Mode management
  isWebSocketMode: boolean;
  setWebSocketMode: (enabled: boolean) => void;
}

export const useWebSocketTransport = (config: WebSocketTransportConfig): WebSocketTransport => {
  const { conversationId, webSocketURL, webSocketSchema, onMessage, onConnectionChange, onError } = config;
  
  // Per-conversation state
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isWebSocketMode, setIsWebSocketModeState] = useState(() => {
    const stored = sessionStorage.getItem(`webSocketMode_${conversationId}`);
    // Default to false if no per-conversation setting exists - no global fallback
    return stored !== null ? stored === 'true' : false;
  });
  
  // Per-conversation refs
  const webSocketRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const messageQueueRef = useRef<any[]>([]);
  const loadingToastIdRef = useRef<string | null>(null);
  
  // Connection management
  const connect = useCallback(async (retryCount = 0): Promise<boolean> => {
    const maxRetries = 3;
    const retryDelay = 1000;
    
    if (webSocketRef.current?.readyState === WebSocket.OPEN) {
      console.log(`✅ [${conversationId}] WebSocket already connected`);
      return true;
    }
    
    if (isConnecting) {
      console.log(`⏳ [${conversationId}] WebSocket connection already in progress`);
      return false;
    }
    
    if (!webSocketURL) {
      toast.error("Please set a valid WebSocket server in settings");
      return false;
    }
    
    setIsConnecting(true);
    
    return new Promise<boolean>((resolve) => {
      try {
        const getCookie = (name: string) => {
          const value = `; ${document.cookie}`;
          const parts = value.split(`; ${name}=`);
          if (parts.length === 2) return parts.pop()?.split(';').shift();
          return null;
        };

        const sessionCookie = getCookie('aiqtoolkit-session');
        let wsUrl = webSocketURL || 'ws://127.0.0.1:8000/websocket';
        
        // Add conversation-specific parameters
        const separator = wsUrl.includes('?') ? '&' : '?';
        wsUrl += `${separator}chat_id=${encodeURIComponent(conversationId)}`;
        
        if (webSocketSchema) {
          wsUrl += `&schema=${encodeURIComponent(webSocketSchema)}`;
        }
        
        if (sessionCookie) {
          wsUrl += `&session=${encodeURIComponent(sessionCookie)}`;
        }
        
        console.log(`🔌 [${conversationId}] Connecting WebSocket:`, wsUrl);
        
        // Show loading toast for connection
        if (!loadingToastIdRef.current) {
          loadingToastIdRef.current = toast.loading(`Connecting WebSocket for conversation ${conversationId.slice(0, 8)}...`);
        }
        
        const ws = new WebSocket(wsUrl);
        const connectTimeout = setTimeout(() => {
          ws.close();
          setIsConnecting(false);
          if (loadingToastIdRef.current) {
            toast.dismiss(loadingToastIdRef.current);
            loadingToastIdRef.current = null;
          }
          toast.error(`WebSocket connection timeout for conversation ${conversationId.slice(0, 8)}`);
          resolve(false);
        }, 10000);
        
        ws.onopen = () => {
          clearTimeout(connectTimeout);
          console.log(`✅ [${conversationId}] WebSocket connected successfully`);
          
          webSocketRef.current = ws;
          setIsConnected(true);
          setIsConnecting(false);
          onConnectionChange?.(true);
          
          // Dismiss loading toast and show success
          if (loadingToastIdRef.current) {
            toast.dismiss(loadingToastIdRef.current);
            loadingToastIdRef.current = null;
          }
          toast.success(`WebSocket connected for conversation ${conversationId.slice(0, 8)}`);
          
          // Send queued messages
          while (messageQueueRef.current.length > 0) {
            const queuedMessage = messageQueueRef.current.shift();
            console.log(`📤 [${conversationId}] Sending queued message:`, queuedMessage.type);
            ws.send(JSON.stringify(queuedMessage));
          }
          
          resolve(true);
        };
        
        ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            console.log(`📨 [${conversationId}] Received WebSocket message:`, message.type);
            onMessage?.(message);
          } catch (error) {
            console.error(`❌ [${conversationId}] Message parse error:`, error);
          }
        };
        
        ws.onclose = (event) => {
          clearTimeout(connectTimeout);
          console.log(`🔌 [${conversationId}] WebSocket closed:`, event.code, event.reason);
          
          webSocketRef.current = null;
          setIsConnected(false);
          setIsConnecting(false);
          onConnectionChange?.(false);
          
          // Dismiss loading toast if still showing
          if (loadingToastIdRef.current) {
            toast.dismiss(loadingToastIdRef.current);
            loadingToastIdRef.current = null;
          }
          
          // Auto-reconnect if unexpected close and still in WebSocket mode
          if (event.code !== 1000 && isWebSocketMode && retryCount < maxRetries) {
            console.log(`🔄 [${conversationId}] Scheduling reconnection... (${retryCount + 1}/${maxRetries})`);
            reconnectTimeoutRef.current = setTimeout(() => {
              console.log(`🔄 [${conversationId}] Attempting reconnection... (${retryCount + 1}/${maxRetries})`);
              connect(retryCount + 1);
            }, retryDelay * Math.pow(2, retryCount));
          } else if (event.code !== 1000) {
            toast.error(`WebSocket disconnected for conversation ${conversationId.slice(0, 8)}`);
          }
        };
        
        ws.onerror = (error) => {
          clearTimeout(connectTimeout);
          console.error(`❌ [${conversationId}] WebSocket error:`, error);
          setIsConnecting(false);
          
          if (loadingToastIdRef.current) {
            toast.dismiss(loadingToastIdRef.current);
            loadingToastIdRef.current = null;
          }
          
          onError?.(error);
          resolve(false);
        };
        
      } catch (error) {
        console.error(`❌ [${conversationId}] Connection error:`, error);
        setIsConnecting(false);
        
        if (loadingToastIdRef.current) {
          toast.dismiss(loadingToastIdRef.current);
          loadingToastIdRef.current = null;
        }
        
        resolve(false);
      }
    });
  }, [conversationId, webSocketURL, webSocketSchema, onMessage, onConnectionChange, onError, isWebSocketMode]);
  
  const disconnect = useCallback(() => {
    console.log(`🔌 [${conversationId}] Disconnecting WebSocket`);
    
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    
    if (loadingToastIdRef.current) {
      toast.dismiss(loadingToastIdRef.current);
      loadingToastIdRef.current = null;
    }
    
    if (webSocketRef.current) {
      webSocketRef.current.close(1000, 'User initiated disconnect');
      webSocketRef.current = null;
    }
    
    setIsConnected(false);
    setIsConnecting(false);
    onConnectionChange?.(false);
  }, [conversationId, onConnectionChange]);
  
  // Message sending utilities
  const sendMessage = useCallback((message: any): boolean => {
    if (!webSocketRef.current || webSocketRef.current.readyState !== WebSocket.OPEN) {
      // Queue message if connecting
      if (isConnecting) {
        console.log(`📦 [${conversationId}] Queueing message:`, message.type);
        messageQueueRef.current.push(message);
        return true;
      }
      console.warn(`❌ [${conversationId}] Cannot send message - WebSocket not connected`);
      return false;
    }
    
    try {
      webSocketRef.current.send(JSON.stringify(message));
      console.log(`📤 [${conversationId}] Sent WebSocket message:`, message.type);
      return true;
    } catch (error) {
      console.error(`❌ [${conversationId}] Send error:`, error);
      return false;
    }
  }, [conversationId, isConnecting]);
  
  const sendUserMessage = useCallback((content: any): boolean => {
    const message = {
      type: webSocketMessageTypes.userMessage,
      schema_type: webSocketSchema,
      id: uuidv4(),
      conversation_id: conversationId,
      content,
      timestamp: new Date().toISOString(),
    };
    
    return sendMessage(message);
  }, [conversationId, webSocketSchema, sendMessage]);
  
  const sendUserInteraction = useCallback((interactionMessage: any, userResponse: string): boolean => {
    const message = {
      type: webSocketMessageTypes.userInteractionMessage,
      id: uuidv4(),
      thread_id: interactionMessage?.thread_id,
      parent_id: interactionMessage?.parent_id,
      content: {
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: userResponse
              }
            ]
          }
        ]
      },
      timestamp: new Date().toISOString(),
    };
    
    return sendMessage(message);
  }, [sendMessage]);
  
  // WebSocket mode management
  const setWebSocketMode = useCallback((enabled: boolean) => {
    console.log(`🔧 [${conversationId}] Setting WebSocket mode:`, enabled);
    
    setIsWebSocketModeState(enabled);
    sessionStorage.setItem(`webSocketMode_${conversationId}`, String(enabled));
    
    if (enabled && !isConnected && !isConnecting) {
      connect();
    } else if (!enabled && (isConnected || isConnecting)) {
      disconnect();
    }
  }, [conversationId, isConnected, isConnecting, connect, disconnect]);
  
  // Auto-connect when mode is enabled
  useEffect(() => {
    if (isWebSocketMode && !isConnected && !isConnecting) {
      console.log(`🚀 [${conversationId}] Auto-connecting WebSocket (mode enabled)`);
      connect();
    }
  }, [isWebSocketMode, isConnected, isConnecting, connect, conversationId]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      console.log(`🧹 [${conversationId}] Cleaning up WebSocket transport`);
      disconnect();
    };
  }, [conversationId, disconnect]);
  
  return {
    isConnected,
    isConnecting,
    connect,
    disconnect,
    sendMessage,
    sendUserMessage,
    sendUserInteraction,
    isWebSocketMode,
    setWebSocketMode,
  };
};