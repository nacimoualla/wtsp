"use client";

import { useEffect, useState, useRef } from "react";
import { io } from "socket.io-client";

// Use environment variable for backend URL, fallback to localhost for development
const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:4000";

const socket = io(SERVER_URL, {
  autoConnect: false,
});

const SECRET_PASSWORD = "bzizila";

interface Message {
  sender: string;
  text: string;
  timestamp: number;
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isJoined, setIsJoined] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isJoined) return;

    socket.connect();
    socket.emit("join_chat");

    socket.on("chat_history", (history: Message[]) => setMessages(history));
    socket.on("new_message", (msg: Message) =>
      setMessages((prev) => [...prev, msg])
    );

    return () => {
      socket.off("chat_history");
      socket.off("new_message");
      socket.disconnect();
    };
  }, [isJoined]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== SECRET_PASSWORD) {
      setError("Wrong password!");
      return;
    }
    if (!username.trim()) {
      setError("Please enter a name!");
      return;
    }
    setError("");
    setIsJoined(true);
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;

    const newMessage: Message = {
      sender: username,
      text: inputText,
      timestamp: Date.now(),
    };

    socket.emit("send_message", newMessage);
    setMessages((prev) => [...prev, newMessage]);
    setInputText("");
  };

  // LOBBY
  if (!isJoined) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-100">
        <form
          onSubmit={handleJoin}
          className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-lg"
        >
          <h1 className="mb-6 text-center text-2xl font-bold text-black">
            Secret Group Chat
          </h1>

          {error && (
            <p className="mb-4 text-center font-semibold text-red-500">
              {error}
            </p>
          )}

          <input
            type="text"
            placeholder="Your Name"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="mb-4 w-full rounded-lg border text-black border-zinc-300 px-4 py-3 text-lg outline-none focus:border-blue-500"
          />
          <input
            type="password"
            placeholder="Secret Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mb-6 w-full rounded-lg border text-black border-zinc-300 px-4 py-3 text-lg outline-none focus:border-blue-500"
          />

          <button
            type="submit"
            className="w-full rounded-lg bg-blue-600 py-3 text-lg font-semibold text-white transition-colors hover:bg-blue-700"
          >
            Enter Room
          </button>
        </form>
      </div>
    );
  }

  // CHAT ROOM
  return (
    <div className="flex h-screen flex-col bg-zinc-50">
      {/* Header */}
      <div className="border-b border-zinc-200 bg-white px-6 py-4">
        <h1 className="text-lg font-bold text-black">Friend Group Chat</h1>
        <p className="text-sm text-black">Chatting as {username}</p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {messages.map((msg, i) => {
          const isMe = msg.sender === username;
          return (
            <div
              key={i}
              className={`mb-4 flex ${isMe ? "justify-end" : "justify-start"}`}
            >
              <div className={`max-w-md ${isMe ? "order-2" : ""}`}>
                {!isMe && (
                  <p className="mb-1 ml-1 text-xs text-black">
                    {msg.sender}
                  </p>
                )}
                <div
                  className={`rounded-2xl px-4 py-2.5 ${
                    isMe
                      ? "rounded-br-sm bg-blue-500 text-white"
                      : "rounded-bl-sm bg-zinc-200 text-black"
                  }`}
                >
                  <p className="text-base text-inherit">{msg.text}</p>
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <form
        onSubmit={handleSendMessage}
        className="flex items-center gap-3 border-t border-zinc-200 bg-white px-6 py-4"
      >
        <input
          type="text"
          placeholder="Type a message..."
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          className="flex-1 rounded-full border border-zinc-300 px-5 py-2.5 text-base outline-none focus:border-blue-500"
        />
        <button
          type="submit"
          disabled={!inputText.trim()}
          className="rounded-full bg-blue-600 px-6 py-2.5 font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </div>
  );
}
