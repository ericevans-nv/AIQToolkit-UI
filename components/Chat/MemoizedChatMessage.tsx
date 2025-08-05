import { FC, memo } from 'react';

import { ChatMessage, Props } from './ChatMessage';

import isEqual from 'lodash/isEqual';

export const MemoizedChatMessage: FC<Props> = memo(
  ChatMessage,
  (prevProps, nextProps) => {
    // componenent will render if new props are only different than previous props (to prevent unnecessary re-rendering)
    const shouldRender = isEqual(prevProps.message, nextProps.message);
    return shouldRender;
  },
);
