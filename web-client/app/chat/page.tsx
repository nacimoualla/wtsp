"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { io } from "socket.io-client";

// Use proxy on Vercel to avoid Mixed Content error, fallback to direct IP locally
const SERVER_URL = process.env.NODE_ENV === "production" ? "" : (process.env.NEXT_PUBLIC_SERVER_URL || "http://159.65.200.145:4000");

const socket = io(SERVER_URL, {
  autoConnect: false,
  path: "/socket.io",
  transports: ["polling"],
});

const SECRET_PASSWORD = "bzizila";

const getMessageKey = (message: { timestamp: number; sender: string }) => `${message.timestamp}_${message.sender}`;

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
  const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set());
  const [activeUsers, setActiveUsers] = useState<string[]>([]);
  const [readReceipts, setReadReceipts] = useState<Record<string, string[]>>({});
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>("default");

  const bottomRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const readMessagesSent = useRef<Set<string>>(new Set());
  const isTypingRef = useRef(false);

  // Emit typing start/stop with debounce
  const emitTyping = useCallback((typing: boolean) => {
    if (!username) return;
    if (typing) {
      if (!isTypingRef.current) {
        socket.emit("typing_start", username);
        isTypingRef.current = true;
      }
      // Clear previous timeout
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      // Set new timeout to stop typing after 1.5 seconds of inactivity
      typingTimeoutRef.current = setTimeout(() => {
        socket.emit("typing_stop", username);
        isTypingRef.current = false;
      }, 1500);
    } else {
      // Immediate stop
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      socket.emit("typing_stop", username);
      isTypingRef.current = false;
    }
  }, [username]);

  // Emit messages read for given messages
  const emitMessagesRead = useCallback((messages: Message[]) => {
    const keys = messages.map(msg => getMessageKey(msg)).filter(key => !readMessagesSent.current.has(key));
    if (keys.length > 0) {
      keys.forEach(key => readMessagesSent.current.add(key));
      socket.emit("messages_read", keys);
    }
  }, []);

  // Request notification permission when joined
  useEffect(() => {
    if (!isJoined) return;
    if (!("Notification" in window)) {
      console.warn("This browser does not support notifications");
      return;
    }
    if (Notification.permission === "granted") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setNotificationPermission(prev => prev === "granted" ? prev : "granted");
    } else if (Notification.permission !== "denied") {
      Notification.requestPermission().then((permission) => {
        setNotificationPermission(prev => prev === permission ? prev : permission);
      });
    } else {
      setNotificationPermission(prev => prev === Notification.permission ? prev : Notification.permission);
    }
  }, [isJoined]);

  // Show notification for new messages when page is hidden
  const showNotification = useCallback((msg: Message) => {
    if (notificationPermission !== "granted") return;
    if (document.visibilityState === "visible") return;
    if (msg.sender === username) return;

    const notification = new Notification(`${msg.sender}`, {
      body: msg.text,
      icon: "/favicon.ico",
      tag: "new-message",
    });
    notification.onclick = () => {
      window.focus();
      notification.close();
    };
  }, [notificationPermission, username]);

  useEffect(() => {
    if (!isJoined) return;

    socket.connect();
    socket.emit("join_chat", username);

    socket.on("chat_history", (history: Message[]) => {
      setMessages(history);
      emitMessagesRead(history);
    });
    socket.on("new_message", (msg: Message) => {
      setMessages((prev) => [...prev, msg]);
      showNotification(msg);
      if (document.visibilityState === "visible") {
        emitMessagesRead([msg]);
      }
    });

    // Listen for typing events from server
    socket.on("typing", ({ username: typingUser, isTyping }: { username: string; isTyping: boolean }) => {
      setTypingUsers(prev => {
        const newSet = new Set(prev);
        if (isTyping) {
          newSet.add(typingUser);
          // Auto-remove after 3 seconds (server timeout is 3 seconds)
          setTimeout(() => {
            setTypingUsers(current => {
              const updated = new Set(current);
              updated.delete(typingUser);
              return updated;
            });
          }, 3000);
        } else {
          newSet.delete(typingUser);
        }
        return newSet;
      });
    });

    // Listen for active users updates
    socket.on("users_update", (users: string[]) => {
      setActiveUsers(users);
    });

    // Listen for read receipts updates
    socket.on("read_receipts_update", (updates: Record<string, string[]>) => {
      setReadReceipts(prev => ({ ...prev, ...updates }));
    });

    return () => {
      socket.off("chat_history");
      socket.off("new_message");
      socket.off("typing");
      socket.off("users_update");
      socket.off("read_receipts_update");
      socket.disconnect();
    };
  }, [isJoined, showNotification, username, emitMessagesRead]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Emit typing stop when component unmounts or user leaves
  useEffect(() => {
    return () => {
      if (isTypingRef.current) {
        socket.emit("typing_stop", username);
      }
    };
  }, [username]);

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

    // Stop typing when sending a message
    emitTyping(false);

    const newMessage: Message = {
      sender: username,
      text: inputText,
      timestamp: Date.now(),
    };

    socket.emit("send_message", newMessage);
    setMessages((prev) => [...prev, newMessage]);
    setInputText("");
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const text = e.target.value;
    setInputText(text);
    // Emit typing start when there's text, stop when empty
    if (text.trim()) {
      emitTyping(true);
    } else {
      emitTyping(false);
    }
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
            className="mb-4 w-full rounded-lg border bg-white text-black placeholder-zinc-500 border-zinc-300 px-4 py-3 text-lg outline-none focus:border-blue-500"
          />
          <input
            type="password"
            placeholder="Secret Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mb-6 w-full rounded-lg border bg-white text-black placeholder-zinc-500 border-zinc-300 px-4 py-3 text-lg outline-none focus:border-blue-500"
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
        {activeUsers.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {activeUsers.map(user => (
              <span key={user} className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
                {user}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {messages.map((msg, i) => {
          const isMe = msg.sender === username;
          const messageKey = getMessageKey(msg);
          const readers = readReceipts[messageKey] || [];
          const otherReaders = readers.filter(r => r !== msg.sender);
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
                  {otherReaders.length > 0 && (
                    <div className={`mt-1 flex items-center gap-1 ${isMe ? "justify-end" : "justify-start"}`}>
                      <svg className="h-3 w-3 text-current opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                      <span className="text-xs opacity-60">
                        {otherReaders.length === 1 ? otherReaders[0] : `${otherReaders.length}`}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        {/* Typing indicator */}
        {typingUsers.size > 0 && (
          <div className="mb-2 flex justify-start">
              <div className="max-w-md -mt-1">
              <p className="mb-1 ml-1 text-xs text-black">
                {Array.from(typingUsers).join(", ")} {typingUsers.size === 1 ? "is" : "are"} typing
              </p>
              <div className="flex space-x-1 rounded-2xl rounded-bl-sm bg-zinc-200 px-4 py-3">
                <div className="typing-dot h-2 w-2 rounded-full bg-zinc-500"></div>
                <div className="typing-dot h-2 w-2 rounded-full bg-zinc-500"></div>
                <div className="typing-dot h-2 w-2 rounded-full bg-zinc-500"></div>
              </div>
            </div>
          </div>
        )}
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
          onChange={handleInputChange}
          className="flex-1 rounded-full border bg-white text-black placeholder-zinc-500 border-zinc-300 px-5 py-2.5 text-base outline-none focus:border-blue-500"
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
