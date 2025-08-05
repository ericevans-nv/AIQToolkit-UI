# Testing Guide

This document outlines the testing setup and best practices for the WebSocket/HTTP chat implementation.

## Overview

The testing stack includes:
- **Jest** for test runner and assertion library
- **React Testing Library (RTL)** for component testing
- **TypeScript** support with ts-jest
- **Coverage reporting** with configurable thresholds
- **Mock WebSocket** for testing real-time functionality

## Setup

### Installation

```bash
npm install
npm run prepare  # Sets up Husky pre-commit hooks
```

### Configuration Files

- `jest.config.js` - Main Jest configuration with Next.js support
- `jest.setup.js` - Global test setup and mocks
- `__mocks__/websocket.ts` - WebSocket mock for testing
- `.eslintrc.js` - ESLint configuration with testing overrides
- `.prettierrc.js` - Code formatting configuration

## Running Tests

### Basic Commands

```bash
# Run all tests
npm run test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Run tests for CI (no watch, with coverage)
npm run test:ci
```

### Coverage Thresholds

Global coverage requirements:
- **Lines:** 80%
- **Branches:** 80%
- **Functions:** 80%
- **Statements:** 80%

Critical files have higher thresholds (90%):
- `utils/chatTransform.ts` - Pure business logic
- `components/Chat/Chat.tsx` - Main chat component (85%)

## Test Organization

### Directory Structure

```
__tests__/
├── components/
│   └── Chat.test.tsx          # Component integration tests
├── types/
│   └── websocket.test.ts      # Type guard tests
└── utils/
    └── chatTransform.test.ts  # Pure function tests

__mocks__/
└── websocket.ts               # WebSocket mock implementation
```

### Test Categories

#### 1. Pure Function Tests (`__tests__/utils/chatTransform.test.ts`)

Tests for business logic functions with no side effects:

- **`shouldAppendResponse`** - Message filtering logic
- **`appendAssistantText`** - Content concatenation rules
- **`applyMessageUpdate`** - Immutable conversation updates
- **`createAssistantMessage`** - Message factory function
- **`shouldRenderAssistantMessage`** - Rendering conditions

#### 2. Type Guard Tests (`__tests__/types/websocket.test.ts`)

Tests for WebSocket message validation:

- **Message type detection** - `isSystemResponseMessage`, etc.
- **Status checking** - `isSystemResponseInProgress`
- **OAuth handling** - `isOAuthConsentMessage`, `extractOAuthUrl`
- **Message validation** - `validateWebSocketMessage`

#### 3. Component Integration Tests (`__tests__/components/Chat.test.tsx`)

Tests for React component behavior:

- **Basic rendering** - Message display, empty states
- **WebSocket message handling** - Real-time updates
- **State consistency** - Conversation isolation
- **User interactions** - OAuth popups, error handling

## WebSocket Testing

### Mock WebSocket Usage

The WebSocket mock provides controllable WebSocket behavior:

```typescript
import MockWebSocket from '@/__mocks__/websocket';

// In your test
const mockWs = MockWebSocket.lastInstance!;

// Simulate incoming message
mockWs.mockMessage({
  type: 'system_response_message',
  status: 'in_progress',
  content: { text: 'Hello from assistant!' },
  conversation_id: 'test-conv-1',
});

// Verify WebSocket was called
expect(mockWs.send).toHaveBeenCalledWith(expectedData);
```

### Tested WebSocket Scenarios

1. **System Response Messages**
   - In-progress content appending
   - Complete status handling (ignored)
   - Content validation and filtering

2. **Intermediate Steps**
   - Step creation and indexing
   - Content preservation during updates
   - Toggle respect for intermediate steps

3. **Interaction Messages**
   - OAuth consent flow
   - Popup window management
   - URL extraction and validation

4. **Error Messages**
   - Error attachment to assistant messages
   - Graceful error handling

5. **State Management**
   - Conversation isolation
   - Race condition prevention
   - Ref synchronization

## Mocking Strategy

### Global Mocks (jest.setup.js)

- **DOM APIs** - IntersectionObserver, ResizeObserver, matchMedia
- **Storage APIs** - sessionStorage, localStorage
- **Window methods** - scrollTo, open (for OAuth)
- **External libraries** - react-hot-toast, uuid

### Test-Specific Mocks

- **WebSocket** - Controllable real-time messaging
- **Next.js dependencies** - i18n, routing
- **HTTP requests** - fetch/stream mocking (when needed)

## Best Practices

### Writing Tests

1. **Pure functions first** - Test business logic in isolation
2. **Type safety** - Use proper TypeScript types in tests
3. **Immutability checks** - Verify objects aren't mutated
4. **Edge cases** - Test empty inputs, error conditions
5. **Stable assertions** - Use data-testid for reliable element selection

### Test Structure

```typescript
describe('Component/Function Name', () => {
  describe('specific behavior', () => {
    it('does something specific under specific conditions', () => {
      // Arrange
      const input = createTestData();
      
      // Act
      const result = functionUnderTest(input);
      
      // Assert
      expect(result).toEqual(expectedOutput);
    });
  });
});
```

### WebSocket Test Patterns

```typescript
it('handles WebSocket message correctly', async () => {
  // Setup component with mock context
  renderChatWithContext(testState);
  
  // Wait for WebSocket connection
  await waitFor(() => {
    const mockWs = MockWebSocket.lastInstance!;
    expect(mockWs).toBeTruthy();
    
    // Send test message
    mockWs.mockMessage(testWebSocketMessage);
  });
  
  // Verify state updates
  await waitFor(() => {
    expect(mockDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        field: 'conversations',
        value: expect.arrayContaining([...])
      })
    );
  });
});
```

## Coverage Reports

Coverage reports are generated in multiple formats:
- **Console output** - Summary during test runs
- **HTML report** - `coverage/lcov-report/index.html`
- **LCOV file** - `coverage/lcov.info` (for CI integration)

## Continuous Integration

### Pre-commit Hooks

Automatically run on `git commit`:
1. ESLint (code quality)
2. TypeScript check (type safety)
3. Jest tests (functionality)

### CI Pipeline (Recommended)

```yaml
# .github/workflows/test.yml
- name: Install dependencies
  run: npm ci
  
- name: Run linting
  run: npm run lint
  
- name: Run type checking
  run: npm run typecheck
  
- name: Run tests
  run: npm run test:ci
  
- name: Build application
  run: npm run build
```

## Debugging Tests

### Common Issues

1. **WebSocket mock not working**
   - Ensure `MockWebSocket.lastInstance` is available
   - Check timing with `waitFor` calls

2. **State updates not reflected**
   - Use `waitFor` for async state changes
   - Verify mock dispatch calls

3. **Type errors in tests**
   - Use proper imports from type files
   - Add `@ts-expect-error` for intentional violations

### Debug Commands

```bash
# Run specific test file
npm test -- Chat.test.tsx

# Run tests matching pattern
npm test -- --testNamePattern="WebSocket"

# Run with verbose output
npm test -- --verbose

# Run without coverage (faster)
npm test -- --no-coverage
```

## Performance Testing

### Test Performance

- Tests run with `--runInBand` to avoid race conditions
- WebSocket mocks prevent real network calls
- Component mounts are optimized with proper cleanup

### Avoiding Slow Tests

- Mock external dependencies
- Use shallow rendering when deep rendering isn't needed
- Cleanup timers and event listeners
- Avoid unnecessary `waitFor` calls

## Test Data Factories

Use factory functions for consistent test data:

```typescript
const createTestConversation = (id = 'test-conv'): Conversation => ({
  id,
  name: 'Test Conversation',
  messages: [],
  models: [],
  prompt: '',
  temperature: 0.7,
  folderId: null,
});

const createTestMessage = (role: 'user' | 'assistant', content: string): Message => ({
  role,
  content,
  id: 'test-msg-' + Math.random(),
});
```

This ensures tests are maintainable and data is consistent across test cases.