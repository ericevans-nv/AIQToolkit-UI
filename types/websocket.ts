/**
 * WebSocket message type definitions and type guards
 * Provides type safety for WebSocket message handling
 */

// Base interface for all WebSocket messages
export interface WebSocketMessageBase {
  id?: string;
  conversation_id?: string;
  parent_id?: string;
  timestamp?: string;
  status?: string;
}

// System response message types
export type SystemResponseStatus = 'in_progress' | 'complete';

export interface SystemResponseMessage extends WebSocketMessageBase {
  type: 'system_response_message';
  status: SystemResponseStatus;
  content?: { 
    text?: string;
  };
}

// Intermediate step message
export interface SystemIntermediateMessage extends WebSocketMessageBase {
  type: 'system_intermediate_message';
  content?: {
    name?: string;
    payload?: string;
  };
  index?: number;
  intermediate_steps?: IntermediateStep[];
}

// Human interaction message (OAuth, etc.)
export interface SystemInteractionMessage extends WebSocketMessageBase {
  type: 'system_interaction_message';
  content?: {
    input_type?: string;
    oauth_url?: string;
    redirect_url?: string;
    text?: string;
  };
  thread_id?: string;
}

// Error message
export interface ErrorMessage extends WebSocketMessageBase {
  type: 'error';
  content?: {
    text?: string;
    error?: string;
  };
}

// Union type for all WebSocket messages
export type WebSocketInbound = 
  | SystemResponseMessage 
  | SystemIntermediateMessage 
  | SystemInteractionMessage 
  | ErrorMessage;

// Intermediate step structure
export interface IntermediateStep {
  id?: string;
  parent_id?: string;
  index?: number;
  content?: any;
  intermediate_steps?: IntermediateStep[];
  [key: string]: any;
}

// Type guards for WebSocket messages
export function isSystemResponseMessage(message: any): message is SystemResponseMessage {
  return message?.type === 'system_response_message';
}

export function isSystemResponseInProgress(message: any): message is SystemResponseMessage {
  return (
    isSystemResponseMessage(message) && 
    message.status === 'in_progress'
  );
}

export function isSystemResponseComplete(message: any): message is SystemResponseMessage {
  return (
    isSystemResponseMessage(message) && 
    message.status === 'complete'
  );
}

export function isSystemIntermediateMessage(message: any): message is SystemIntermediateMessage {
  return message?.type === 'system_intermediate_message';
}

export function isSystemInteractionMessage(message: any): message is SystemInteractionMessage {
  return message?.type === 'system_interaction_message';
}

export function isErrorMessage(message: any): message is ErrorMessage {
  return message?.type === 'error';
}

export function isOAuthConsentMessage(message: any): message is SystemInteractionMessage {
  return (
    isSystemInteractionMessage(message) &&
    message.content?.input_type === 'oauth_consent'
  );
}

/**
 * Validates that a message has the minimum required structure
 */
export function validateWebSocketMessage(message: any): message is WebSocketInbound {
  return (
    message &&
    typeof message === 'object' &&
    typeof message.type === 'string' &&
    [
      'system_response_message',
      'system_intermediate_message', 
      'system_interaction_message',
      'error'
    ].includes(message.type)
  );
}

/**
 * Extracts OAuth URL from interaction message safely
 */
export function extractOAuthUrl(message: SystemInteractionMessage): string | null {
  if (!isOAuthConsentMessage(message)) {
    return null;
  }
  
  return (
    message.content?.oauth_url ||
    message.content?.redirect_url ||
    message.content?.text ||
    null
  );
}

/**
 * Determines if a response should append content (type guards + content check)
 */
export function shouldAppendResponseContent(message: WebSocketInbound): boolean {
  return (
    isSystemResponseInProgress(message) &&
    Boolean(message.content?.text?.trim())
  );
}