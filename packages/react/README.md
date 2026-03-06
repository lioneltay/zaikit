# @zaikit/react

React hooks and components for building AI agent UIs — `AgentProvider`, `useAgent`, `useAgentChat`, and `useToolRenderer`.

## Install

```bash
pnpm add @zaikit/react
```

## Usage

```tsx
import { AgentProvider, useAgentChat } from "@zaikit/react";

function App() {
  return (
    <AgentProvider api="/api/chat">
      <Chat />
    </AgentProvider>
  );
}

function Chat() {
  const { messages, input, setInput, submit } = useAgentChat();

  return (
    <div>
      {messages.map((m) => (
        <div key={m.id}>{m.content}</div>
      ))}
      <input value={input} onChange={(e) => setInput(e.target.value)} />
      <button onClick={submit}>Send</button>
    </div>
  );
}
```

## Documentation

[https://zaikit.dev](https://zaikit.dev)

## License

Apache-2.0
