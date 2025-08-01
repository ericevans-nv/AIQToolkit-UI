'use client';
import {
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import toast from 'react-hot-toast';

import { useTranslation } from 'next-i18next';

import { getEndpoint } from '@/utils/app/api';
import {
  saveConversation,
  saveConversations,
  updateConversation,
} from '@/utils/app/conversation';
import {
  fetchLastMessage,
  processIntermediateMessage,
} from '@/utils/app/helper';
import { 
  processWebSocketMessage, 
  validateWebSocketMessage, 
  validateConversationState,
  type WebSocketMessageProcessorResult 
} from '@/utils/app/websocketMessageProcessor';
import { throttle } from '@/utils/data/throttle';
import { ChatBody, Conversation, Message } from '@/types/chat';
import HomeContext from '@/pages/api/home/home.context';
import { ChatInput } from './ChatInput';
import { ChatLoader } from './ChatLoader';
import { MemoizedChatMessage } from './MemoizedChatMessage';

import { v4 as uuidv4 } from 'uuid';
import { InteractionModal } from '@/components/Chat/ChatInteractionMessage';
import { webSocketMessageTypes } from '@/utils/app/const';
import { ChatHeader } from './ChatHeader';
import { WebSocketTransportProvider, useWebSocketTransportContext } from './WebSocketTransportProvider';

// Internal Chat component that has access to WebSocket transport
const ChatInternal = () => {
  const { t } = useTranslation('chat');
  const {
    state: {
      selectedConversation,
      conversations,
      messageIsStreaming,
      loading,
      chatHistory,
      webSocketConnected,
      webSocketMode,
      webSocketURL,
      webSocketSchema,
      chatCompletionURL,
      expandIntermediateSteps,
      intermediateStepOverride,
      enableIntermediateSteps
    },
    handleUpdateConversation,
    dispatch: homeDispatch,
  } = useContext(HomeContext);
  
  // Access WebSocket transport from context
  const { transport } = useWebSocketTransportContext();

  const [currentMessage, setCurrentMessage] = useState<Message>();
  const [autoScrollEnabled, setAutoScrollEnabled] = useState<boolean>(true);
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [showScrollDownButton, setShowScrollDownButton] =
    useState<boolean>(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const controllerRef = useRef(new AbortController());
  const selectedConversationRef = useRef(selectedConversation);

  const [modalOpen, setModalOpen] = useState(false);
  const [interactionMessage, setInteractionMessage] = useState(null);
  const lastScrollTop = useRef(0); // Store last known scroll position

  // Add these variables near the top of your component
  const isUserInitiatedScroll = useRef(false);
  const scrollTimeout = useRef(null);


  const openModal = (data : any = {}) => {
    setInteractionMessage(data);
    setModalOpen(true);
  };

  const handleUserInteraction = useCallback(({interactionMessage = {}, userResponse = ''}: any) => {
    console.log('Sending user response for interaction message via WebSocket transport', userResponse);
    transport.sendUserInteraction(interactionMessage, userResponse);
  }, [transport]);

  useEffect(() => {
    selectedConversationRef.current = selectedConversation;
  }, [selectedConversation]);

  // WebSocket logic moved to useWebSocketTransport hook


  // handleWebSocketMessage moved to main Chat component


  const handleSend = useCallback(
    async (message: Message, deleteCount = 0, retry = false) => {
      message.id = uuidv4();
      // chat with bot
      if (selectedConversation) {
        let updatedConversation: Conversation;
        if (deleteCount) {
          const updatedMessages = [...selectedConversation.messages];
          for (let i = 0; i < deleteCount; i++) {
            updatedMessages.pop();
          }
          updatedConversation = {
            ...selectedConversation,
            messages: [...updatedMessages, message],
          };
        } else {
          // remove content from attachment since it could a large base64 encoded string which can cause session stroage overflow
          // Clone the message and update the attachment contentconst updateMessage = JSON.parse(JSON.stringify(message));
          const updateMessage = JSON.parse(JSON.stringify(message));
          if (updateMessage?.attachment) {
            updateMessage.attachment.content = '';
          }
          updatedConversation = {
            ...selectedConversation,
            messages: [
              ...selectedConversation.messages,
              { ...updateMessage },
            ],
          };
        }
        homeDispatch({
          field: 'selectedConversation',
          value: updatedConversation,
        });

        homeDispatch({ field: 'loading', value: true });
        homeDispatch({ field: 'messageIsStreaming', value: true });

        // websocket connection chat request
        if (transport.isWebSocketMode) {
          if (!transport.isConnected) {
            const connected = await transport.connect();
            if (!connected) {
              console.log("WebSocket connection failed.");
              homeDispatch({ field: "loading", value: false });
              homeDispatch({ field: "messageIsStreaming", value: false });
              return;
            }
            else {
              console.log("WebSocket connected successfully!, Resend the query");
              handleSend(message, 1)
              return
            }
          }
          toast.dismiss()

          // ✅ HYBRID: Remove placeholder creation from handleSend 
          // The previous implementation created assistant messages dynamically on first WebSocket response
          // This approach was more reliable - let's restore it

          saveConversation(updatedConversation);
          const updatedConversations: Conversation[] = conversations.map(
            (conversation) => {
              if (conversation.id === selectedConversation.id) {
                return updatedConversation;
              }
              return conversation;
            },
          );
          if (updatedConversations.length === 0) {
            updatedConversations.push(updatedConversation);
          }
          homeDispatch({
            field: 'conversations',
            value: updatedConversations,
          });
          saveConversations(updatedConversations);

          let chatMessages
          if(chatHistory) {
            chatMessages = updatedConversation?.messages?.map((message: Message) => {
              return {
                role: message.role,
                content : [
                  {
                    type: 'text',
                    text: message?.content?.trim() || ''
                  },
                  ...(((message as any)?.content?.attachments?.length > 0)
                    ? ((message as any)?.content?.attachments?.map((attachment: any) => ({
                        type: 'image',
                        image_url: attachment?.content
                      })))
                    : [])
                ]
              };
            })
          }
          // else set only the user last message
          else {
            chatMessages = [updatedConversation?.messages[updatedConversation?.messages?.length - 1]].map((message) => {
              return {
                role: message.role,
                content: [
                  {
                    type: 'text',
                    text: message?.content?.trim() || ''
                  }
                ],
              };
            })
          }

          // Send via WebSocket transport
          const success = transport.sendUserMessage({
            messages: chatMessages
          });

          if (!success) {
            console.error("Failed to send WebSocket message via transport");
            homeDispatch({ field: "loading", value: false });
            homeDispatch({ field: "messageIsStreaming", value: false });
          }
          
          return
        }

        // cleaning up messages to fit the request payload
        const messagesCleaned = updatedConversation.messages.map((message) => {
          return {
            role: message.role,
            content: message.content.trim(),
          };
        })

        const chatBody: ChatBody = {
          messages: chatHistory ? messagesCleaned : [{ role: 'user', content: message?.content }],
          chatCompletionURL: sessionStorage.getItem('chatCompletionURL') || chatCompletionURL,
          additionalProps: {
            enableIntermediateSteps: sessionStorage.getItem('enableIntermediateSteps')
            ? sessionStorage.getItem('enableIntermediateSteps') === 'true'
            : enableIntermediateSteps,
          }
        };

        const endpoint = getEndpoint({ service: 'chat' });
        let body;
        body = JSON.stringify({
          ...chatBody,
        });

        let response;
        try {
          response = await fetch(`${window.location.origin}\\${endpoint}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Conversation-Id': selectedConversation?.id || '',
            },
            signal: controllerRef.current.signal, // Use ref here
            body,
          });

          if (!response?.ok) {
            homeDispatch({ field: 'loading', value: false });
            homeDispatch({ field: 'messageIsStreaming', value: false });
            toast.error(response.statusText);
            return;
          }

          const data = response?.body;
          if (!data) {
            homeDispatch({ field: 'loading', value: false });
            homeDispatch({ field: 'messageIsStreaming', value: false });
            toast.error('Error: No data received from server');
            return;
          }
          if (!false) {
            if (updatedConversation.messages.length === 1) {
              const { content } = message;
              const customName =
                content.length > 30
                  ? content.substring(0, 30) + '...'
                  : content;
              updatedConversation = {
                ...updatedConversation,
                name: customName,
              };
            }
            homeDispatch({ field: 'loading', value: false });
            const reader = data.getReader();
            const decoder = new TextDecoder();
            let done = false;
            let isFirst = true;
            let text = '';
            let counter = 1;
            let partialIntermediateStep = ''; // Add this to store partial chunks
            while (!done) {
              const { value, done: doneReading } = await reader.read();
              done = doneReading;
              let chunkValue = decoder.decode(value);
              counter++;

              // First, handle any partial chunk from previous iteration
              if (partialIntermediateStep) {
                chunkValue = partialIntermediateStep + chunkValue;
                partialIntermediateStep = "";
              }

              // Check for incomplete tags
              const openingTagIndex = chunkValue.lastIndexOf("<intermediatestep>");
              const closingTagIndex = chunkValue.lastIndexOf("</intermediatestep>");

              // If we have an opening tag without a closing tag (or closing tag comes before opening)
              if (openingTagIndex > closingTagIndex) {
                // Store the partial chunk for the next iteration
                partialIntermediateStep = chunkValue.substring(openingTagIndex);
                // Remove the partial chunk from current processing
                chunkValue = chunkValue.substring(0, openingTagIndex);
              }

              // Process complete intermediate steps
              let rawIntermediateSteps: any[] = [];
              let messages = chunkValue.match(/<intermediatestep>(.*?)<\/intermediatestep>/g) || [];
              for (const message of messages) {
                try {
                  const jsonString = message.replace('<intermediatestep>', '').replace('</intermediatestep>', '').trim();
                  let rawIntermediateMessage = JSON.parse(jsonString);
                  // handle intermediate data
                  if (rawIntermediateMessage?.type === 'system_intermediate') {
                    rawIntermediateSteps.push(rawIntermediateMessage);
                  }
                } catch (error) {
                  // console.log('Stream response parse error:', error.message);
                }
              }

              // if the received chunk contains rawIntermediateSteps then remove them from the chunkValue
              if (messages.length > 0) {
                chunkValue = chunkValue.replace(/<intermediatestep>[\s\S]*?<\/intermediatestep>/g, '');
              }

              text = text + chunkValue;

              homeDispatch({ field: 'loading', value: false });
              if (isFirst) {
                isFirst = false;

                // loop through rawIntermediateSteps and add them to the processedIntermediateSteps
                let processedIntermediateSteps: any[] = []
                rawIntermediateSteps.forEach((step) => {
                  processedIntermediateSteps = processIntermediateMessage(processedIntermediateSteps, step, sessionStorage.getItem('intermediateStepOverride') === 'false' ? false : intermediateStepOverride )
                })

                // update the message
                const updatedMessages: Message[] = [
                  ...updatedConversation.messages,
                  {
                    role: 'assistant',
                    content: text, // main response content without intermediate steps
                    intermediateSteps: [...processedIntermediateSteps], // intermediate steps
                  },
                ];

                updatedConversation = {
                  ...updatedConversation,
                  messages: updatedMessages,
                };

                homeDispatch({
                  field: 'selectedConversation',
                  value: updatedConversation,
                });
              } else {

                const updatedMessages: Message[] =
                  updatedConversation.messages.map((message, index) => {
                    if (index === updatedConversation.messages.length - 1) {
                      // process intermediate steps
                      // need to loop through raw rawIntermediateSteps and add them to the updatedIntermediateSteps
                      let updatedIntermediateSteps: any[] = [...(message?.intermediateSteps || [])]
                      rawIntermediateSteps.forEach((step) => {
                        updatedIntermediateSteps = processIntermediateMessage(updatedIntermediateSteps, step, sessionStorage.getItem('intermediateStepOverride') === 'false' ? false : intermediateStepOverride)
                      })

                      // update the message
                      const msg = {
                        ...message,
                        content: text, // main response content
                        intermediateSteps: updatedIntermediateSteps // intermediate steps
                      };
                      return msg
                    }
                    return message;
                  });
                updatedConversation = {
                  ...updatedConversation,
                  messages: updatedMessages,
                };
                homeDispatch({
                  field: 'selectedConversation',
                  value: updatedConversation,
                });
              }
            }

            saveConversation(updatedConversation);
            const updatedConversations: Conversation[] = conversations.map(
              (conversation) => {
                if (conversation.id === selectedConversation.id) {
                  return updatedConversation;
                }
                return conversation;
              },
            );
            if (updatedConversations.length === 0) {
              updatedConversations.push(updatedConversation);
            }
            homeDispatch({
              field: 'conversations',
              value: updatedConversations,
            });
            saveConversations(updatedConversations);
            // to show the message on UI and scroll to the bottom after 500ms delay
            setTimeout(() => {
              homeDispatch({ field: 'messageIsStreaming', value: false });
              homeDispatch({ field: 'loading', value: false });
            }, 200);
          } else {
            const { answer } = await response?.json();
            const updatedMessages: Message[] = [
              ...updatedConversation.messages,
              { role: 'assistant', content: answer },
            ];
            updatedConversation = {
              ...updatedConversation,
              messages: updatedMessages,
            };
            homeDispatch({
              field: 'selectedConversation',
              value: updateConversation,
            });
            saveConversation(updatedConversation);
            const updatedConversations: Conversation[] = conversations.map(
              (conversation) => {
                if (conversation.id === selectedConversation.id) {
                  return updatedConversation;
                }
                return conversation;
              },
            );
            if (updatedConversations.length === 0) {
              updatedConversations.push(updatedConversation);
            }
            homeDispatch({
              field: 'conversations',
              value: updatedConversations,
            });
            saveConversations(updatedConversations);
            homeDispatch({ field: 'loading', value: false });
            homeDispatch({ field: 'messageIsStreaming', value: false });
          }
        } catch (error) {
          saveConversation(updatedConversation);
          homeDispatch({ field: 'loading', value: false });
          homeDispatch({ field: 'messageIsStreaming', value: false });
          if (error === 'aborted' || (error as any)?.name === 'AbortError') {
            return;
          } else {
            console.log('error during chat completion - ', error);
            return;
          }
        }
      }
    },
    [
      conversations,
      selectedConversation,
      homeDispatch,
      chatHistory,
      transport,
      webSocketSchema,
      chatCompletionURL,
      expandIntermediateSteps,
      intermediateStepOverride,
      enableIntermediateSteps
    ],
  );

  // Add a new effect to handle streaming state changes
  useEffect(() => {
    if (messageIsStreaming) {
      setAutoScrollEnabled(true);
      setShowScrollDownButton(false);
      homeDispatch({ field: 'autoScroll', value: true });
    }
  }, [messageIsStreaming]);

  // Add an effect to set up wheel and touchmove event listeners
  useEffect(() => {
    const container = chatContainerRef.current;
    if (!container) return;

    // Function to handle user input events (mouse wheel, touch)
    const handleUserInput = () => {
      // Mark this as user-initiated scrolling
      isUserInitiatedScroll.current = true;

      // Reset the flag after a short delay
      if (scrollTimeout.current) {
        clearTimeout(scrollTimeout.current);
      }
      scrollTimeout.current = setTimeout(() => {
        isUserInitiatedScroll.current = false;
      }, 200) as any;
    };

    // Add event listeners for user interactions
    container.addEventListener('wheel', handleUserInput, { passive: true });
    container.addEventListener('touchmove', handleUserInput, { passive: true });

    return () => {
      // Clean up
      container.removeEventListener('wheel', handleUserInput);
      container.removeEventListener('touchmove', handleUserInput);
      if (scrollTimeout.current) {
        clearTimeout(scrollTimeout.current);
      }
    };
  }, [chatContainerRef.current]); // Only re-run if the container ref changes

// Now modify your handleScroll function to use this flag
  const handleScroll = useCallback(() => {
    if (!chatContainerRef.current || !isUserInitiatedScroll.current) return;

    const { scrollTop, scrollHeight, clientHeight } = chatContainerRef.current;
    const isScrollingUp = scrollTop < lastScrollTop.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 20;

    // Only disable auto-scroll if it's a user-initiated upward scroll
    if (isScrollingUp && autoScrollEnabled && messageIsStreaming) {
      setAutoScrollEnabled(false);
      homeDispatch({ field: 'autoScroll', value: false });
      setShowScrollDownButton(true);
    }

    // Re-enable auto-scroll if user scrolls to bottom
    if (isAtBottom && !autoScrollEnabled) {
      setAutoScrollEnabled(true);
      homeDispatch({ field: 'autoScroll', value: true });
      setShowScrollDownButton(false);
    }

    lastScrollTop.current = scrollTop;
  }, [autoScrollEnabled, messageIsStreaming]);

  const handleScrollDown = () => {
    chatContainerRef.current?.scrollTo({
      top: chatContainerRef.current.scrollHeight,
      behavior: 'smooth',
    });
    // Enable auto-scroll after user clicks scroll down, assuming the user wants to auto-scroll
    setAutoScrollEnabled(true);
    homeDispatch({ field: 'autoScroll', value: true });
  };

  const scrollDown = () => {
    if (autoScrollEnabled) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }

  const throttledScrollDown = throttle(scrollDown, 250);

  useEffect(() => {
    throttledScrollDown();
    selectedConversation &&
      setCurrentMessage(
        selectedConversation.messages[selectedConversation.messages.length - 2],
      );
  }, [selectedConversation, throttledScrollDown]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          textareaRef.current?.focus();
        }

        // Only auto-scroll if we're streaming and auto-scroll is enabled
        if (autoScrollEnabled && messageIsStreaming) {
          requestAnimationFrame(() => {
            messagesEndRef.current?.scrollIntoView({
              behavior: 'smooth',
              block: 'end',
            });
          });
        }
      },
      {
        root: null,
        threshold: 0.5,
      }
    );

    const messagesEndElement = messagesEndRef.current;
    if (messagesEndElement) {
      observer.observe(messagesEndElement);
    }
    return () => {
      if (messagesEndElement) {
        observer.unobserve(messagesEndElement);
      }
    };
  }, [autoScrollEnabled, messageIsStreaming]);

  return (
    <div
      className="relative flex-1 overflow-hidden bg-white dark:bg-[#343541] transition-all duration-300 ease-in-out"
    >
      <>
        <div
          className="max-h-full overflow-x-hidden"
          ref={chatContainerRef}
          onScroll={handleScroll}
        >
          <ChatHeader 
            webSocketMode={transport.isWebSocketMode}
            webSocketConnected={transport.isConnected}
            onWebSocketToggle={() => transport.setWebSocketMode(!transport.isWebSocketMode)}
          />
          {selectedConversation?.messages.map((message, index) => (
            <MemoizedChatMessage
              key={message.id || `message-${index}`}
              message={message}
              messageIndex={index}
              onEdit={(editedMessage) => {
                setCurrentMessage(editedMessage);
                handleSend(
                  editedMessage,
                  selectedConversation?.messages.length - index,
                );
              }}
            />
          ))}
          {loading && <ChatLoader statusUpdateText={`Thinking...`} />}
          <div
            className="h-[162px] bg-white dark:bg-[#343541]"
            ref={messagesEndRef}
          >
          </div>
        </div>
        <ChatInput
          textareaRef={textareaRef}
          onSend={(message) => {
            setCurrentMessage(message);
            handleSend(message, 0);
          }}
          onScrollDownClick={handleScrollDown}
          onRegenerate={() => {
            if (currentMessage && currentMessage?.role === 'user') {
              handleSend(currentMessage, 0);
            } else {
              const lastUserMessage = fetchLastMessage(
                {messages: (selectedConversation?.messages || []) as any, role: 'user'}
              );
              lastUserMessage && handleSend(lastUserMessage, 1);
            }
          }}
          showScrollDownButton={showScrollDownButton}
          controller={controllerRef}
        />
        <InteractionModal isOpen={modalOpen} interactionMessage={interactionMessage} onClose={() => setModalOpen(false)} onSubmit={handleUserInteraction} />
      </>
    </div>
  );
};

// Main Chat component that provides WebSocket transport
export const Chat = () => {
  const {
    state: {
      selectedConversation,
      conversations,
      webSocketURL,
      webSocketSchema,
    },
    dispatch: homeDispatch,
  } = useContext(HomeContext);

  // Handler for WebSocket messages - refactored to use React state exclusively
  const handleWebSocketMessage = useCallback((message: any) => {
    console.log(`🔄 WebSocket message received for conversation: ${selectedConversation?.id}`);
    
    try {
      // Validate message structure
      if (!validateWebSocketMessage(message)) {
        console.error('Invalid WebSocket message structure:', message);
        return;
      }

      // Validate current state - using React state from HomeContext
      if (!selectedConversation) {
        console.error('No selected conversation available for WebSocket message processing');
        return;
      }

      const stateValidation = validateConversationState(conversations, selectedConversation);
      if (!stateValidation.isValid) {
        console.error('Invalid conversation state:', stateValidation.error);
        return;
      }

      // ✅ RESTORE: Handle system interaction messages (like OAuth consent and other modals)
      if (message?.type === webSocketMessageTypes.systemInteractionMessage) {
        // Handle OAuth consent messages
        if (message?.content?.input_type === 'oauth_consent') {
          const oauthUrl = message?.content?.oauth_url || message?.content?.redirect_url || message?.content?.text;
          if (oauthUrl) {
            const popup = window.open(
              oauthUrl,
              'oauth-popup',
              'width=600,height=700,scrollbars=yes,resizable=yes'
            );

            const handleOAuthComplete = (event: MessageEvent) => {
              console.log('OAuth flow completed:', event.data);
              if (popup && !popup.closed) {
                popup.close();
              }
              window.removeEventListener('message', handleOAuthComplete);
            };
            window.addEventListener('message', handleOAuthComplete);
          } else {
            console.error('OAuth consent message received but no URL found in content:', message?.content);
            toast.error('OAuth URL not found in message content');
          }
          return;
        }
        
        // ✅ RESTORE: Other interaction messages should be processed for assistant updates
        // Continue to normal processing to add to conversation
      }

      // Process message using pure function with React state as input
      const processingResult: WebSocketMessageProcessorResult | null = processWebSocketMessage(
        message,
        conversations, // From React state (HomeContext)
        selectedConversation, // From React state (HomeContext)
        webSocketSchema
      );

      if (!processingResult) {
        console.warn('WebSocket message processing returned null, skipping update');
        return;
      }



      // Update React state atomically
      homeDispatch({
        field: 'selectedConversation',
        value: processingResult.updatedSelectedConversation,
      });

      homeDispatch({
        field: 'conversations',
        value: processingResult.updatedConversations,
      });

      // ✅ HYBRID: Use previous implementation's completion logic
      homeDispatch({ field: 'loading', value: false }); // Always stop loading
      
      if (message?.status === 'complete') {
        // ✅ EXACT PREVIOUS LOGIC: Stop streaming with delay when complete
        setTimeout(() => {
          homeDispatch({ field: 'messageIsStreaming', value: false });
        }, 200);
      }

      // Note: sessionStorage sync now happens via useEffect in home.tsx
      // This ensures one-way data flow: React state → sessionStorage
      
    } catch (error) {
      console.error('Error processing WebSocket message:', error);
      // Don't update state if processing failed - preserve existing conversations
      homeDispatch({ field: 'loading', value: false });
      homeDispatch({ field: 'messageIsStreaming', value: false });
    }
  }, [conversations, selectedConversation, homeDispatch, webSocketSchema]);

  // Handler for connection changes
  const handleConnectionChange = useCallback((connected: boolean) => {
    console.log(`🔌 WebSocket connection changed: ${connected} for conversation: ${selectedConversation?.id}`);
    
    // Note: No longer updating global webSocketConnected state to prevent cross-conversation interference
    // Each conversation manages its own connection state via transport props
    
    if (!connected) {
      // Only update loading/streaming state for the current conversation
      homeDispatch({ field: 'loading', value: false });
      homeDispatch({ field: 'messageIsStreaming', value: false });
    }
  }, [selectedConversation?.id, homeDispatch]);

  // Handler for WebSocket errors
  const handleWebSocketError = useCallback((error: any) => {
    console.error('WebSocket error:', error);
    toast.error(`WebSocket error for conversation ${selectedConversation?.id?.slice(0, 8)}`);
  }, [selectedConversation?.id]);

  if (!selectedConversation) {
    return null;
  }

  return (
    <WebSocketTransportProvider
      conversationId={selectedConversation.id}
      webSocketURL={webSocketURL}
      webSocketSchema={webSocketSchema}
      onMessage={handleWebSocketMessage}
      onConnectionChange={handleConnectionChange}
      onError={handleWebSocketError}
    >
      <ChatInternal />
    </WebSocketTransportProvider>
  );
};

Chat.displayName = 'Chat';
