import { Conversation, Message } from '@/types/chat';
import { webSocketMessageTypes } from '@/utils/app/const';
import { saveConversation, saveConversations } from '@/utils/app/conversation';
import { processIntermediateMessage } from '@/utils/app/helper';

/**
 * WebSocket message processor using EXACT previous implementation logic
 * with minimal architectural improvements for session isolation
 */
export interface WebSocketMessageProcessorResult {
  updatedConversations: Conversation[];
  updatedSelectedConversation: Conversation;
  shouldStopLoading: boolean;
  shouldStopStreaming: boolean;
}

/**
 * Simple message validation (kept minimal to avoid blocking valid messages)
 */
export const validateWebSocketMessage = (message: any): boolean => {
  return message && typeof message === 'object';
};

/**
 * Simple conversation state validation
 */
export const validateConversationState = (
  conversations: Conversation[], 
  selectedConversation: Conversation
): { isValid: boolean; error?: string } => {
  if (!selectedConversation || !selectedConversation.id) {
    return { isValid: false, error: 'Selected conversation is invalid' };
  }
  return { isValid: true };
};

/**
 * Enhanced content extraction (FORWARD INTEGRATION)
 * Extracts content from various WebSocket message types
 */
const extractContentFromMessage = (message: any): string => {
  // Primary content extraction
  if (message?.content?.text) {
    return message.content.text;
  }
  
  // Handle system_intermediate_message content extraction
  if (message?.type === webSocketMessageTypes.systemIntermediateMessage && message?.content?.payload) {
    const payload = message.content.payload;
    
    // Extract "Final Answer:" pattern (common in intermediate messages)
    const finalAnswerMatch = payload.match(/Final Answer:\s*(.*?)$/);
    if (finalAnswerMatch) {
      return finalAnswerMatch[1].trim();
    }
    
    // Extract content that's not input formatting
    if (payload && !payload.includes('**Input:**') && !payload.includes('```python')) {
      return payload.replace(/\*\*Output:\*\*/g, '').trim();
    }
  }
  
  // Fallback to any available content
  if (typeof message?.content === 'string') {
    return message.content;
  }
  
  return '';
};

export const processWebSocketMessage = (
  message: any,
  conversations: Conversation[],
  selectedConversation: Conversation | null,
  webSocketSchema: any
): WebSocketMessageProcessorResult | null => {
  if (!selectedConversation) {
    console.error('processWebSocketMessage: selectedConversation is null');
    return null;
  }

  if (!validateWebSocketMessage(message)) {
    console.error('processWebSocketMessage: Invalid message structure:', message);
    return null;
  }

  const stateValidation = validateConversationState(conversations, selectedConversation);
  if (!stateValidation.isValid) {
    console.error('processWebSocketMessage: Invalid conversation state:', stateValidation.error);
    return null;
  }

  // EXACT PREVIOUS LOGIC: Filter intermediate messages if disabled
  if (
    sessionStorage.getItem('enableIntermediateSteps') === 'false' && 
    message?.type === webSocketMessageTypes.systemIntermediateMessage
  ) {
    console.log('Ignoring intermediate steps (disabled in settings)');
    return null;
  }

  // EXACT PREVIOUS LOGIC: Handle error messages
  if (message?.type === 'error') {
    message.content.text = 'Something went wrong. Please try again. \n\n' + 
      `<details id=${message?.id}><summary></summary>${JSON.stringify(message?.content)}</details>`;
  }

  // EXACT PREVIOUS LOGIC: Check if last message is from assistant
  const isLastMessageFromAssistant = selectedConversation?.messages && 
    selectedConversation.messages.length > 0 &&
    selectedConversation.messages[selectedConversation.messages.length - 1].role === 'assistant';

  let updatedMessages: Message[];

  if (isLastMessageFromAssistant) {
    // EXACT PREVIOUS LOGIC: Update existing assistant message
    updatedMessages = selectedConversation.messages.map((msg: Message, idx: number) => {
      if (msg.role === 'assistant' && idx === selectedConversation.messages.length - 1) {
        // EXACT PREVIOUS LOGIC: Only system_response_message adds to content
        let updatedContent = msg.content || '';
        if (message?.type === webSocketMessageTypes.systemResponseMessage) {
          updatedContent = updatedContent + (message?.content?.text || '');
        }

        // EXACT PREVIOUS LOGIC: Process intermediate steps
        let index = (msg as any)?.intermediateSteps?.length || 0;
        const messageWithIndex = { ...message, index };

        let processedIntermediateSteps = (message?.type === webSocketMessageTypes.systemIntermediateMessage)
          ? processIntermediateMessage(
              (msg as any).intermediateSteps || [], 
              messageWithIndex, 
              sessionStorage.getItem('intermediateStepOverride') === 'false' ? false : true
            )
          : (msg as any).intermediateSteps || [];

        // EXACT PREVIOUS LOGIC: Handle interaction messages
        if (message?.type === webSocketMessageTypes.systemInteractionMessage) {
          (msg as any).humanInteractionMessages = (msg as any).humanInteractionMessages || [];
          (msg as any).humanInteractionMessages.push(message);
        }
        
        // EXACT PREVIOUS LOGIC: Handle error messages
        if (message?.type === 'error') {
          (msg as any).errorMessages = (msg as any).errorMessages || [];
          (msg as any).errorMessages.push(message);
        }

        // EXACT PREVIOUS LOGIC: Return updated assistant message
        return {
          ...msg,
          content: updatedContent,
          intermediateSteps: processedIntermediateSteps,
          humanInteractionMessages: (msg as any).humanInteractionMessages || [],
          errorMessages: (msg as any).errorMessages || []
        } as any;
      }
      return msg;
    });
  } else {
    // EXACT PREVIOUS LOGIC: Create new assistant message
    updatedMessages = [
      ...(selectedConversation?.messages || []),
      {
        role: 'assistant',
        id: message?.id,
        parentId: message?.parent_id,
        content: message?.content?.text || '',
        intermediateSteps: (message?.type === webSocketMessageTypes.systemIntermediateMessage) 
          ? [{ ...message, index: 0 }] 
          : [],
        humanInteractionMessages: (message?.type === webSocketMessageTypes.systemInteractionMessage) 
          ? [message] 
          : [],
        errorMessages: message?.type === 'error' ? [message] : []
      } as any,
    ];
  }

  // Create updated conversation
  const updatedSelectedConversation: Conversation = {
    ...selectedConversation,
    messages: updatedMessages,
  };

  // Update conversations array
  const updatedConversations = conversations.map(
    (conversation) => {
      if (conversation.id === selectedConversation.id) {
        return updatedSelectedConversation;
      }
      return conversation;
    },
  );

  // Handle case where conversation doesn't exist in array
  if (updatedConversations.length === 0) {
    updatedConversations.push(updatedSelectedConversation);
  }

  // EXACT PREVIOUS LOGIC: Always stop loading, conditional streaming stop
  const shouldStopLoading = true;
  const shouldStopStreaming = message?.status === 'complete';

  return {
    updatedConversations,
    updatedSelectedConversation,
    shouldStopLoading,
    shouldStopStreaming
  };
};