import { useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";

const transport = new DefaultChatTransport({
  api: "http://localhost:7301/api/chat",
});

export default function App() {
  const { messages, sendMessage, status } = useChat({ transport });
  const [input, setInput] = useState("");

  const isLoading = status === "streaming" || status === "submitted";

  return (
    <div className="chat-container">
      <div className="messages">
        {messages.map((message) => (
          <div key={message.id} className={`message ${message.role}`}>
            <strong>{message.role === "user" ? "You" : "Assistant"}</strong>
            <div>
              {message.parts.map((part, i) => {
                if (part.type === "text") {
                  return <p key={i}>{part.text}</p>;
                }
                if (part.type === "dynamic-tool") {
                  return (
                    <pre key={i}>
                      Tool: {part.toolName}
                    </pre>
                  );
                }
                return null;
              })}
            </div>
          </div>
        ))}
        {isLoading && <div className="loading">Thinking...</div>}
      </div>
      <form
        className="input-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!input.trim()) return;
          sendMessage({ text: input });
          setInput("");
        }}
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a message..."
          disabled={isLoading}
        />
        <button type="submit" disabled={isLoading || !input.trim()}>
          Send
        </button>
      </form>
    </div>
  );
}
