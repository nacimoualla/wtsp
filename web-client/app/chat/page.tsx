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
const TESTING_PASSWORD = "testing";

const getMessageKey = (message: { timestamp: number; sender: string }) => `${message.timestamp}_${message.sender}`;

interface Message {
  sender: string;
  text: string;
  timestamp: number;
  replyTo?: {
    key: string;
    text: string;
    sender: string;
  };
  reactions?: Record<string, number>;
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState("");
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [highlightedMessageKey, setHighlightedMessageKey] = useState<string | null>(null);
  const [reactions, setReactions] = useState<Record<string, Record<string, number>>>({});
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isJoined, setIsJoined] = useState(false);
  const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set());
  const [activeUsers, setActiveUsers] = useState<string[]>([]);
  const [readReceipts, setReadReceipts] = useState<Record<string, string[]>>({});
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>("default");
  const [showReactionPicker, setShowReactionPicker] = useState<string | null>(null);

  const EMOJI_LIST = ['👍', '❤️', '😂', '😮', '😢'];
  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof window === 'undefined') return false;
    const saved = localStorage.getItem('darkMode');
    if (saved !== null) return saved === 'true';
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  // Load saved username on mount for auto-login
  useEffect(() => {
    const savedUsername = localStorage.getItem('savedUsername');
    if (savedUsername) {
      setUsername(savedUsername);
    }
  }, []);

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

    socket.on("reaction_update", (updates: Record<string, Record<string, number>>) => {
      setReactions(prev => ({ ...prev, ...updates }));
    });

    socket.on("message_deleted", (messageKey: string) => {
      setMessages(prev => prev.filter(msg => getMessageKey(msg) !== messageKey));
    });

    return () => {
      socket.off("chat_history");
      socket.off("new_message");
      socket.off("typing");
      socket.off("users_update");
      socket.off("read_receipts_update");
      socket.off("reaction_update");
      socket.off("message_deleted");
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

  // Apply dark mode preference
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('darkMode', String(isDarkMode));
  }, [isDarkMode]);

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== SECRET_PASSWORD && password !== TESTING_PASSWORD) {
      setError("Wrong password!");
      return;
    }
    if (!username.trim()) {
      setError("Please enter a name!");
      return;
    }
    setError("");
    setIsJoined(true);
    localStorage.setItem('savedUsername', username);
  };

  const handleLogout = () => {
    socket.disconnect();
    setIsJoined(false);
    setMessages([]);
    setUsername("");
    setPassword("");
    localStorage.removeItem('savedUsername');
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
      replyTo: replyingTo ? {
        key: getMessageKey(replyingTo),
        text: replyingTo.text,
        sender: replyingTo.sender
      } : undefined,
    };

    socket.emit("send_message", newMessage);
    setMessages((prev) => [...prev, newMessage]);
    setInputText("");
    setReplyingTo(null);
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

  const scrollToMessage = (messageKey: string) => {
    const element = document.getElementById(messageKey);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setHighlightedMessageKey(messageKey);
      setTimeout(() => setHighlightedMessageKey(null), 2000);
    }
  };

  const handleToggleReaction = (messageKey: string, emoji: string) => {
    socket.emit('toggle_reaction', { messageKey, emoji });
  };

  const handleDeleteMessage = (messageKey: string) => {
    socket.emit('delete_message', messageKey);
  };

  // LOBBY
  if (!isJoined) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-100 dark:bg-zinc-900">
        <form
          onSubmit={handleJoin}
          className="w-full max-w-sm rounded-2xl bg-white dark:bg-zinc-800 p-8 shadow-lg"
        >
          <h1 className="mb-6 text-center text-2xl font-bold text-black dark:text-white">
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
            className="mb-4 w-full rounded-lg border bg-white dark:bg-zinc-700 text-black dark:text-white placeholder-zinc-500 dark:placeholder-zinc-400 border-zinc-300 dark:border-zinc-600 px-4 py-3 text-lg outline-none focus:border-blue-500 dark:focus:border-blue-400"
          />
          <input
            type="password"
            placeholder="Secret Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mb-6 w-full rounded-lg border bg-white dark:bg-zinc-700 text-black dark:text-white placeholder-zinc-500 dark:placeholder-zinc-400 border-zinc-300 dark:border-zinc-600 px-4 py-3 text-lg outline-none focus:border-blue-500 dark:focus:border-blue-400"
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
    <div className="flex h-screen flex-col bg-zinc-50 dark:bg-zinc-900">
      {/* Header */}
      <div className="border-b border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-6 py-4">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold text-black dark:text-white">Friend Group Chat</h1>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsDarkMode(!isDarkMode)}
              className="rounded-full p-2 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-700"
              title={isDarkMode ? "Switch to light mode" : "Switch to dark mode"}
            >
              {isDarkMode ? (
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              ) : (
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
              )}
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-full p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
              title="Logout"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          </div>
        </div>
        <p className="text-sm text-black dark:text-zinc-300">Chatting as {username}</p>
        {activeUsers.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {activeUsers.map(user => (
              <span key={user} className="inline-flex items-center rounded-full bg-green-100 dark:bg-green-900 px-2.5 py-0.5 text-xs font-medium text-green-800 dark:text-green-200">
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
          const isHighlighted = highlightedMessageKey === messageKey;
          const msgReactions = reactions[messageKey] || {};
          const hasReactions = Object.keys(msgReactions).length > 0;
          return (
            <div
              id={messageKey}
              key={i}
              className={`mb-4 flex ${isMe ? "justify-end" : "justify-start"} group relative ${isHighlighted ? "highlight-message" : ""} message-enter`}
            >
              <div className={`relative max-w-md ${isMe ? "order-2" : ""}`}>
                {/* Action buttons - positioned relative to bubble */}
                <div className={`absolute top-0 ${isMe ? "-left-10" : "-right-10"} flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity`}>
                  {/* Reply button */}
                  <button
                    type="button"
                    onClick={() => setReplyingTo(msg)}
                    className="rounded-full bg-white dark:bg-zinc-700 p-1.5 shadow-md z-10"
                    title="Reply"
                  >
                    <svg className="h-4 w-4 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                    </svg>
                  </button>
                  {/* Reaction button */}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setShowReactionPicker(showReactionPicker === messageKey ? null : messageKey)}
                      className="rounded-full bg-white dark:bg-zinc-700 p-1.5 shadow-md z-10"
                      title="React"
                    >
                      <span className="text-sm">👍</span>
                    </button>
                    {showReactionPicker === messageKey && (
                      <div className="absolute top-6 left-0 flex gap-1 rounded-full bg-white dark:bg-zinc-700 p-1 shadow-lg z-20">
                        {EMOJI_LIST.map(emoji => (
                          <button
                            key={emoji}
                            type="button"
                            onClick={() => {
                              handleToggleReaction(messageKey, emoji);
                              setShowReactionPicker(null);
                            }}
                            className="rounded-full p-1 hover:bg-zinc-100 dark:hover:bg-zinc-600"
                          >
                            <span className="text-lg">{emoji}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {/* Delete button */}
                  <button
                    type="button"
                    onClick={() => handleDeleteMessage(messageKey)}
                    className="rounded-full bg-white dark:bg-zinc-700 p-1.5 shadow-md z-10"
                    title="Delete"
                  >
                    <svg className="h-4 w-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
                
                {!isMe && (
              <p className="mb-1 ml-1 text-xs text-black dark:text-zinc-300">
                    {msg.sender}
                  </p>
                )}
                <div
                  className={`rounded-2xl px-4 py-2.5 ${
                    isMe
                      ? "rounded-br-sm bg-blue-500 text-white"
                      : "rounded-bl-sm bg-zinc-200 dark:bg-zinc-700 text-black dark:text-white"
                  }`}
                >
                  {/* Reply quote */}
                  {msg.replyTo && (
                    <div 
                      className={`mb-2 cursor-pointer rounded p-2 text-left ${
                        isMe ? 'bg-white/10' : 'bg-black/5'
                      }`} 
                      onClick={() => scrollToMessage(msg.replyTo!.key)}
                    >
                      <p className={`text-xs font-semibold ${isMe ? 'text-white' : 'text-blue-600'}`}>
                        {msg.replyTo.sender}
                      </p>
                      <p className={`text-sm line-clamp-2 ${isMe ? 'text-white/80' : 'text-zinc-600'}`}>
                        {msg.replyTo.text}
                      </p>
                    </div>
                  )}
                  <p className="text-base text-inherit">{msg.text}</p>
                  {/* Reactions */}
                  {hasReactions && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {Object.entries(msgReactions).map(([emoji, count]) => (
                        <button
                          key={emoji}
                          onClick={() => handleToggleReaction(messageKey, emoji)}
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs ${
                            isMe ? 'bg-white/20 text-white' : 'bg-black/5 text-black'
                          }`}
                        >
                          <span>{emoji} {count}</span>
                        </button>
                      ))}
                    </div>
                  )}
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
              <div className="flex space-x-1 rounded-2xl rounded-bl-sm bg-zinc-200 dark:bg-zinc-700 px-4 py-3">
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
        className="flex flex-col gap-2 border-t border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-6 py-4"
      >
        {replyingTo && (
          <div className="flex items-center gap-2 rounded-lg bg-zinc-100 dark:bg-zinc-700 px-4 py-2">
            <div className="flex-1">
              <p className="text-sm font-semibold text-blue-600">
                Replying to {replyingTo.sender}
              </p>
              <p className="text-sm text-zinc-600 truncate">
                {replyingTo.text}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setReplyingTo(null)}
              className="text-zinc-400 hover:text-zinc-600"
            >
              ✕
            </button>
          </div>
        )}
        <div className="flex items-center gap-3">
          <input
            type="text"
            placeholder="Type a message..."
            value={inputText}
            onChange={handleInputChange}
            className="flex-1 rounded-full border bg-white dark:bg-zinc-700 text-black dark:text-white placeholder-zinc-500 dark:placeholder-zinc-400 border-zinc-300 dark:border-zinc-600 px-5 py-2.5 text-base outline-none focus:border-blue-500 dark:focus:border-blue-400"
          />
          <button
            type="submit"
            disabled={!inputText.trim()}
            className="rounded-full bg-blue-600 px-6 py-2.5 font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
}
