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
  validateWebSocketMessage,
  isSystemResponseMessage,
  isSystemIntermediateMessage,
  isSystemInteractionMessage,
  isErrorMessage,
  extractOAuthUrl,
  shouldAppendResponseContent,
  createAssistantMessage,
  updateConversationTitle,
  appendToAssistantContent,
  shouldRenderAssistantMessage,
} from '@/utils/app/helper';
import { throttle } from '@/utils/data/throttle';
import { ChatBody, Conversation, Message, WebSocketMessage } from '@/types/chat';
import HomeContext from '@/pages/api/home/home.context';
import { ChatInput } from './ChatInput';
import { ChatLoader } from './ChatLoader';
import { MemoizedChatMessage } from './MemoizedChatMessage';

import { v4 as uuidv4 } from 'uuid';
import { InteractionModal } from '@/components/Chat/ChatInteractionMessage';
import { webSocketMessageTypes } from '@/utils/app/const';
import { ChatHeader } from './ChatHeader';

export const Chat = () => {
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
  const conversationsRef = useRef(conversations);

  const [modalOpen, setModalOpen] = useState(false);
  const [interactionMessage, setInteractionMessage] = useState(null);
  const webSocketRef = useRef<WebSocket | null>(null);
  const webSocketConnectedRef = useRef(false);
  const webSocketModeRef = useRef(sessionStorage.getItem('webSocketMode') === 'false' ? false : webSocketMode);
  let websocketLoadingToastId: string | null = null;
  const lastScrollTop = useRef(0); // Store last known scroll position

  // Add these variables near the top of your component
  const isUserInitiatedScroll = useRef(false);
  const scrollTimeout = useRef<NodeJS.Timeout | null>(null);


  const openModal = (data : any = {}) => {
    setInteractionMessage(data);
    setModalOpen(true);
  };

  const handleUserInteraction = ({interactionMessage = {}, userResponse = ''} : any) => {
    // todo send user input to websocket server as user response to interaction message
    // console.log("User response:", userResponse);
    const wsMessage = {
      type: webSocketMessageTypes.userInteractionMessage,
      id: uuidv4(), //new id for every new message
      thread_id: interactionMessage?.thread_id, // same thread_id from interaction message received
      parent_id: interactionMessage?.parent_id, // same parent_id from interaction message received
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
    webSocketRef?.current?.send(JSON.stringify(wsMessage));
  };

  useEffect(() => {
    selectedConversationRef.current = selectedConversation;
  }, [selectedConversation]);

  // Keep conversations ref up to date to avoid stale closure
  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);

  useEffect(() => {
    if (webSocketModeRef?.current && !webSocketConnectedRef.current) {
      connectWebSocket();
    }

    // todo cancel ongoing connection attempts
    else {
      if (websocketLoadingToastId) toast.dismiss(websocketLoadingToastId);
    }

    return () => {
      if (webSocketRef?.current) {
        webSocketRef?.current?.close();
        webSocketConnectedRef.current = false;
      }
    };
  }, [webSocketModeRef?.current, webSocketURL]);

  const connectWebSocket = async (retryCount = 0) => {

    const maxRetries = 3;
    const retryDelay = 1000; // 1-second delay between retries

    if (!(sessionStorage.getItem('webSocketURL') || webSocketURL)) {
      toast.error("Please set a valid WebSocket server in settings");
      return false;
    }

    return new Promise((resolve) => {
      // Universal cookie handling for both cross-origin and same-origin connections
      const getCookie = (name: string) => {
        const value = `; ${document.cookie}`;
        const parts = value.split(`; ${name}=`);
        if (parts.length === 2) return parts.pop()?.split(';').shift();
        return null;
      };

      const sessionCookie = getCookie('aiqtoolkit-session');
      let wsUrl: string = sessionStorage.getItem('webSocketURL') || webSocketURL || 'ws://127.0.0.1:8000/websocket';

      // Determine if this is a cross-origin connection
      const wsUrlObj = new URL(wsUrl);
      const isCrossOrigin = wsUrlObj.origin !== window.location.origin;

      // Always add session cookie as query parameter for reliability
      // This works for both cross-origin (required) and same-origin (redundant but harmless)
      if (sessionCookie) {
        const separator = wsUrl.includes('?') ? '&' : '?';
        wsUrl += `${separator}session=${encodeURIComponent(sessionCookie)}`;

      } else {
      }

      const ws = new WebSocket(wsUrl);

      websocketLoadingToastId = toast.loading(
        "WebSocket is not connected, trying to connect...",
        { id: "websocketLoadingToastId" }
      );

      ws.onopen = () => {

        toast.success("Connected to " + (sessionStorage.getItem('webSocketURL') || webSocketURL), {
          id: "websocketSuccessToastId",
        });
        if (websocketLoadingToastId) toast.dismiss(websocketLoadingToastId);

        // using ref due to usecallback for handlesend which will be recreated during next render when dependency array changes
        // so values inside of are still one and be updated after next render
        // so we'll not see any changes to websocket (state variable) or webSocketConnected (context variable) changes while the function is executing
        webSocketConnectedRef.current = true;
        homeDispatch({ field: "webSocketConnected", value: true });
        webSocketRef.current = ws;
        resolve(true); // Resolve true only when connected
      };

      ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        handleWebSocketMessage(message);
      };

      ws.onclose = async () => {
        if (retryCount < maxRetries) {
          retryCount++;

          // Retry and capture the result
          if(webSocketModeRef?.current) {
             // Wait for retry delay
            await new Promise((res) => setTimeout(res, retryDelay));
  
            const success = await connectWebSocket(retryCount);
            resolve(success);
          }
        } else {
          // Only resolve(false) after all retries fail
          homeDispatch({ field: "webSocketConnected", value: false });
          webSocketConnectedRef.current = false;
          homeDispatch({ field: "loading", value: false });
          homeDispatch({ field: "messageIsStreaming", value: false });
          if (websocketLoadingToastId) toast.dismiss(websocketLoadingToastId);
          toast.error("WebSocket connection failed.", {
            id: "websocketErrorToastId",
          });
          resolve(false);
        }
      };

      ws.onerror = (error) => {
        homeDispatch({ field: "webSocketConnected", value: false });
        webSocketConnectedRef.current = false;
        homeDispatch({ field: "loading", value: false });
        homeDispatch({ field: "messageIsStreaming", value: false });
        ws.close(); // Ensure the WebSocket is closed on error
      };
    });
  };


  // Re-attach the WebSocket handler when intermediateStepOverride changes because we need updated value from settings
  useEffect(() => {
    if (webSocketRef.current) {
      webSocketRef.current.onmessage = (event) => {
        const message = JSON.parse(event.data);
        handleWebSocketMessage(message);
      };
    }
  }, [intermediateStepOverride]);


  /**
   * Handles OAuth consent flow by opening popup window
   */
  const handleOAuthConsent = (message: WebSocketMessage) => {
    if (!isSystemInteractionMessage(message)) return false;
    
    if (message.content?.input_type === 'oauth_consent') {
      const oauthUrl = extractOAuthUrl(message);
      if (oauthUrl) {
        const popup = window.open(
          oauthUrl,
          'oauth-popup',
          'width=600,height=700,scrollbars=yes,resizable=yes'
        );
        const handleOAuthComplete = (event: MessageEvent) => {
          if (popup && !popup.closed) popup.close();
          window.removeEventListener('message', handleOAuthComplete);
        };
        window.addEventListener('message', handleOAuthComplete);
      }
      return true;
    }
    return false;
  };

  /**
   * Updates refs immediately before React dispatch to prevent stale reads
   */
  const updateRefsAndDispatch = (
    updatedConversations: Conversation[],
    updatedConversation: Conversation,
    currentSelectedConversation: Conversation | null | undefined
  ) => {
    // Write-through to refs before dispatch to avoid stale reads on next WS tick
    conversationsRef.current = updatedConversations;
    if (currentSelectedConversation?.id === updatedConversation.id) {
      selectedConversationRef.current = updatedConversation;
    }

    // Dispatch and persist
    homeDispatch({ field: 'conversations', value: updatedConversations });
    saveConversations(updatedConversations);

    if (currentSelectedConversation?.id === updatedConversation.id) {
      homeDispatch({ field: 'selectedConversation', value: updatedConversation });
      saveConversation(updatedConversation);
    }
  };

  /**
   * Processes system response messages for content updates
   * Only appends content for in_progress status with non-empty text
   */
  const processSystemResponseMessage = (
    message: WebSocketMessage,
    messages: Message[]
  ): Message[] => {
    if (!isSystemResponseMessage(message) || !shouldAppendResponseContent(message)) {
      return messages;
    }

    const incomingText = message.content?.text?.trim() || '';
    const lastMessage = messages.at(-1);
    const isLastAssistant = lastMessage?.role === 'assistant';

    if (isLastAssistant) {
      // Append to existing assistant message
      const combinedContent = appendToAssistantContent(lastMessage.content || '', incomingText);
      return messages.map((m, idx) =>
        idx === messages.length - 1
          ? { ...m, content: combinedContent, timestamp: Date.now() }
          : m
      );
    } else {
      // Create new assistant message
      return [
        ...messages,
        createAssistantMessage(message.id, message.parent_id, incomingText),
      ];
    }
  };

  /**
   * Processes intermediate step messages without modifying content
   */
  const processIntermediateStepMessage = (
    message: WebSocketMessage,
    messages: Message[]
  ): Message[] => {
    if (!isSystemIntermediateMessage(message)) return messages;

    const lastMessage = messages.at(-1);
    const isLastAssistant = lastMessage?.role === 'assistant';

    if (!isLastAssistant) {
      // Create new assistant message with empty content for intermediate steps
      return [
        ...messages,
        createAssistantMessage(message.id, message.parent_id, '', [{ ...message, index: 0 }]),
      ];
    } else {
      // Update intermediate steps on existing assistant message
      const lastIdx = messages.length - 1;
      const lastSteps = messages[lastIdx]?.intermediateSteps || [];
      const mergedSteps = processIntermediateMessage(
        lastSteps,
        { ...message, index: lastSteps.length || 0 },
        sessionStorage.getItem('intermediateStepOverride') === 'false'
          ? false
          : intermediateStepOverride
      );

      return messages.map((m, idx) =>
        idx === lastIdx
          ? {
              ...m,
              content: m.content || '', // Preserve existing content
              intermediateSteps: mergedSteps,
              timestamp: Date.now(),
            }
          : m
      );
    }
  };

  /**
   * Processes error messages by attaching them to assistant messages
   */
  const processErrorMessage = (
    message: WebSocketMessage,
    messages: Message[]
  ): Message[] => {
    if (!isErrorMessage(message)) return messages;

    const lastMessage = messages.at(-1);
    const isLastAssistant = lastMessage?.role === 'assistant';

    if (isLastAssistant) {
      // Attach error to existing assistant message
      return messages.map((m, idx) =>
        idx === messages.length - 1
          ? {
              ...m,
              errorMessages: [...(m.errorMessages || []), message],
              timestamp: Date.now(),
            }
          : m
      );
    } else {
      // Create new assistant message for error
      return [
        ...messages,
        createAssistantMessage(message.id, message.parent_id, '', [], [], [message]),
      ];
    }
  };

  /**
   * Main WebSocket message handler
   * Processes different message types and updates conversation state
   */
  const handleWebSocketMessage = (message: any) => {
    // Validate message structure early
    if (!validateWebSocketMessage(message)) return;

    // End loading indicators as messages arrive
    homeDispatch({ field: 'loading', value: false });
    if (message.status === 'complete') {
      setTimeout(() => {
        homeDispatch({ field: 'messageIsStreaming', value: false });
      }, 200);
    }

    // Handle human-in-the-loop interactions
    if (isSystemInteractionMessage(message)) {
      if (handleOAuthConsent(message)) return;
      openModal(message);
      return;
    }

    // Respect intermediate-steps toggle
    if (
      sessionStorage.getItem('enableIntermediateSteps') === 'false' &&
      isSystemIntermediateMessage(message)
    ) {
      return;
    }

    // Skip creating/updating assistant text for system_response:complete
    if (isSystemResponseMessage(message) && message.status === 'complete') {
      return;
    }

    // Find target conversation
    const currentConversations = conversationsRef.current;
    const currentSelectedConversation = selectedConversationRef.current;
    const targetConversation = currentConversations.find(
      (c) => c.id === message.conversation_id
    );
    if (!targetConversation) return;

    // Process message based on type
    let updatedMessages = targetConversation.messages;
    updatedMessages = processSystemResponseMessage(message, updatedMessages);
    updatedMessages = processIntermediateStepMessage(message, updatedMessages);
    updatedMessages = processErrorMessage(message, updatedMessages);

    // Update conversation with new messages and title
    const updatedConversation = updateConversationTitle({
      ...targetConversation,
      messages: updatedMessages,
    });

    // Update conversations array
    const updatedConversations = currentConversations.map((c) =>
      c.id === updatedConversation.id ? updatedConversation : c
    );

    // Update state and persistence
    updateRefsAndDispatch(updatedConversations, updatedConversation, currentSelectedConversation);
  };


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
        if (webSocketModeRef?.current) {
          if (!webSocketConnectedRef?.current) {
            const connected = await connectWebSocket();
            if (!connected) {
              homeDispatch({ field: "loading", value: false });
              homeDispatch({ field: "messageIsStreaming", value: false });
              return;
            }
            else {
              handleSend(message, 1)
              return
            }

          }
          toast.dismiss()

          saveConversation(updatedConversation);
          // Use conversationsRef.current to avoid stale closure that causes conversation wiping
          const updatedConversations: Conversation[] = conversationsRef.current.map(
            (conversation) => {
              if (conversation.id === selectedConversation.id) {
                return updatedConversation;
              }
              return conversation;
            },
          );
          // Removed fallback block that was wiping conversations
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
                  ...((typeof message?.content === 'object' && message?.content && 'attachments' in message.content && (message.content as any).attachments?.length > 0)
                    ? (message.content as any).attachments?.map((attachment: any) => ({
                        type: 'image',
                        image_url: attachment?.content
                      }))
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

          const wsMessage = {
            type: webSocketMessageTypes.userMessage,
            schema_type: sessionStorage.getItem('webSocketSchema') || webSocketSchema,
            id: message?.id,
            conversation_id: selectedConversation.id,
            content: {
              messages: chatMessages
            },
            timestamp: new Date().toISOString(),
          };
          // console.log('Sent message via websocket', wsMessage)
          webSocketRef?.current?.send(JSON.stringify(wsMessage));
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
              let rawIntermediateSteps = [];
              let messages = chunkValue.match(/<intermediatestep>([\s\S]*?)<\/intermediatestep>/g) || [];
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
                      let updatedIntermediateSteps = [...message?.intermediateSteps]
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
              value: updatedConversation,
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
      webSocketConnected,
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
      }, 200) as NodeJS.Timeout;
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
          <ChatHeader webSocketModeRef={webSocketModeRef} />
          {selectedConversation?.messages.map((message, index) => {
            if (!shouldRenderAssistantMessage(message)) {
              return null; // Hide empty assistant messages
            }

            return (
              <MemoizedChatMessage
                key={message.id ?? index}
                message={message}
                messageIndex={index}
                onEdit={(editedMessage) => {
                  setCurrentMessage(editedMessage);
                  handleSend(editedMessage, selectedConversation?.messages.length - index);
                }}
              />
            );
          })}
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
                {messages: selectedConversation?.messages || [], role: 'user'}
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
Chat.displayName = 'Chat';
