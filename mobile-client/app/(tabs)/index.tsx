import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  StyleSheet, Text, View, TextInput, TouchableOpacity,
  FlatList, KeyboardAvoidingView, Platform, SafeAreaView
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { io } from 'socket.io-client';
import { Stack } from 'expo-router';
import { registerForPushNotificationsAsync, showLocalNotification } from '../../utils/notifications';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import SwapableComponent from '../../components/SwapableComponent';
import AudioRecorder from '../../components/AudioRecorder';
import AudioPlayer from '../../components/AudioPlayer';

export const options = {
  tabBarStyle: { display: 'none' },
};


// ⚠️ CRITICAL MOBILE GOTCHA:
// You cannot use "localhost" on a mobile device because the phone looks for a server
// running inside the phone itself! Use your server's public IP address.
// Example: "http://159.65.200.145:4000"
const SERVER_URL = "http://159.65.200.145:4000"; // Ensure this server is running and accessible from your device.

const socket = io(SERVER_URL, {
  autoConnect: false,
  path: "/socket.io",
  transports: ["polling", "websocket"],
  upgrade: true,
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000
});

const SECRET_PASSWORD = "bzizila";
const TESTING_PASSWORD = "testing";

const getMessageKey = (message: { timestamp: number; sender: string }) => `${message.timestamp}_${message.sender}`;

export default function ChatScreen() {
  console.log('ChatScreen rendered, SERVER_URL:', SERVER_URL);
  const [messages, setMessages] = useState<any[]>([]);
  const [inputText, setInputText] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isJoined, setIsJoined] = useState(false);
  const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set());
  const [activeUsers, setActiveUsers] = useState<string[]>([]);
  const [readReceipts, setReadReceipts] = useState<Record<string, string[]>>({});
  const [reactions, setReactions] = useState<Record<string, Record<string, number>>>({});
  const [isConnected, setIsConnected] = useState(false);
  const [replyingTo, setReplyingTo] = useState<any>(null); // Stores the message we are replying to
  const [highlightedMessageKey, setHighlightedMessageKey] = useState<string | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [userHasScrolledUp, setUserHasScrolledUp] = useState(false);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTypingRef = useRef(false);

  const flatListRef = useRef<FlatList>(null);
  const insets = useSafeAreaInsets();
  console.log('Safe area insets:', insets);

  useEffect(() => {
    const loadSavedSession = async () => {
      try {
        const savedUsername = await AsyncStorage.getItem('savedUsername');
        if (savedUsername) {
          setUsername(savedUsername);
        }
        const savedDarkMode = await AsyncStorage.getItem('darkMode');
        if (savedDarkMode !== null) {
          setIsDarkMode(savedDarkMode === 'true');
        }
      } catch (e) {
        console.log('Error loading saved session:', e);
      }
    };
    loadSavedSession();
  }, []);

  useEffect(() => {
    if (!isJoined) return;

    socket.connect();

    socket.on('connect', () => {
      console.log('Socket connected');
      setIsConnected(true);
    });

    socket.on('disconnect', () => {
      console.log('Socket disconnected');
      setIsConnected(false);
    });

    socket.on('connect_error', (error) => {
      console.log('Socket connection error:', error);
      setIsConnected(false);
    });

    // Register for push notifications
    registerForPushNotificationsAsync().then(token => {
      if (token) {
        socket.emit('register_push_token', token);
      }
    });
    socket.emit("join_chat", { username, password });

    socket.on("chat_history", (history: any[]) => {
      console.log('Received chat history:', history.length, 'messages');
      setMessages(history);
    });
    socket.on("new_message", (msg: any) => {
      console.log('New message received:', msg);
      setMessages((prev) => [...prev, msg]);
      // Show local notification if the message is from another user
      if (msg.sender !== username) {
        showLocalNotification(`New message from ${msg.sender}`, msg.text, { sender: msg.sender, timestamp: msg.timestamp });
      }
      // Reset auto-scroll for new messages
      if (msg.sender === username) {
        setUserHasScrolledUp(false);
      }
    });

    socket.on("typing", ({ username: typingUser, isTyping }: { username: string; isTyping: boolean }) => {
      setTypingUsers(prev => {
        const newSet = new Set(prev);
        if (isTyping) {
          newSet.add(typingUser);
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

    socket.on("users_update", (users: string[]) => {
      setActiveUsers(users);
    });

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
      socket.off('connect');
      socket.off('disconnect');
      socket.off('connect_error');
      socket.off("chat_history");
      socket.off("new_message");
      socket.off("typing");
      socket.off("users_update");
      socket.off("read_receipts_update");
      socket.off("reaction_update");
      socket.off("message_deleted");
      socket.disconnect();
    };
  }, [isJoined, username]);

  const emitTyping = useCallback((typing: boolean) => {
    if (!username) return;
    if (typing) {
      if (!isTypingRef.current) {
        socket.emit("typing_start", username);
        isTypingRef.current = true;
      }
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        socket.emit("typing_stop", username);
        isTypingRef.current = false;
      }, 1500);
    } else {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      socket.emit("typing_stop", username);
      isTypingRef.current = false;
    }
  }, [username]);

  const handleJoin = () => {
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
    AsyncStorage.setItem('savedUsername', username);
  };

  const handleLogout = () => {
    socket.disconnect();
    setIsJoined(false);
    setMessages([]);
    setUsername("");
    setPassword("");
    AsyncStorage.removeItem('savedUsername');
  };

  const handleSendMessage = () => {
    if (!inputText.trim()) return;
    // Stop typing when sending a message
    emitTyping(false);

    const newMessage = {
      sender: username,
      text: inputText,
      replyTo: replyingTo ? {
        key: getMessageKey(replyingTo),
        text: replyingTo.text,
        sender: replyingTo.sender
      } : null,
      timestamp: Date.now()
    };

    socket.emit("send_message", newMessage);
    setMessages((prev) => [...prev, newMessage]);
    setInputText("");
    setReplyingTo(null);
    setUserHasScrolledUp(false);
  };

  const handleAudioRecorded = (audioUrl: string, duration: number) => {
    emitTyping(false);

    const newMessage = {
      sender: username,
      text: ,
      timestamp: Date.now(),
      type: audio,
      audioUrl,
      audioDuration: duration,
    };

    socket.emit(send_message, newMessage);
    setMessages((prev) => [...prev, newMessage]);
    setUserHasScrolledUp(false);
  };

  // 1. THE LOBBY
  if (!isJoined) {
    return (
      <SafeAreaView style={[styles.lobbyContainer, { backgroundColor: isDarkMode ? '#121212' : '#f3f4f6' }]}>
        <View style={[styles.card, { backgroundColor: isDarkMode ? '#1e1e1e' : 'white' }]}>
          <Text style={[styles.title, { color: isDarkMode ? 'white' : 'black' }]}>Secret Group Chat</Text>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <TextInput
            style={[styles.input, { 
              backgroundColor: isDarkMode ? '#2c2c2c' : 'white',
              borderColor: isDarkMode ? '#444' : '#ccc',
              color: isDarkMode ? 'white' : 'black'
            }]}
            placeholder="Your Name"
            placeholderTextColor={isDarkMode ? '#aaa' : '#666'}
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
          />
          <TextInput
            style={[styles.input, { 
              backgroundColor: isDarkMode ? '#2c2c2c' : 'white',
              borderColor: isDarkMode ? '#444' : '#ccc',
              color: isDarkMode ? 'white' : 'black'
            }]}
            placeholder="Secret Password"
            placeholderTextColor={isDarkMode ? '#aaa' : '#666'}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />

          <TouchableOpacity style={styles.button} onPress={handleJoin}>
            <Text style={styles.buttonText}>Enter Room</Text>
          </TouchableOpacity>
          <Text style={styles.versionText}>
            Version {(Constants.manifest as any)?.version || '1.1.3'}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // 2. THE CHAT ROOM
  const onSwipeToReply = (message: any) => {
    setReplyingTo(message);
  };

  const onToggleReaction = (messageKey: string, emoji: string) => {
    socket.emit('toggle_reaction', { messageKey, emoji });
  };

  const onDeleteMessage = (messageKey: string) => {
    socket.emit('delete_message', messageKey);
  };

  const toggleDarkMode = async () => {
    const newValue = !isDarkMode;
    setIsDarkMode(newValue);
    await AsyncStorage.setItem('darkMode', String(newValue));
  };

  const scrollToMessage = (messageKey: string) => {
    const index = messages.findIndex(msg => getMessageKey(msg) === messageKey);
    if (index >= 0) {
      flatListRef.current?.scrollToIndex({ index, animated: true });
      setHighlightedMessageKey(messageKey);
      setTimeout(() => setHighlightedMessageKey(null), 2000);
    }
  };

  const renderMessage = ({ item }: { item: any }) => {
    const messageKey = getMessageKey(item);
    const msgReactions = reactions[messageKey] || {};
    return (
      <SwapableComponent
        message={item}
        currentUsername={username}
        onSwipeToReply={onSwipeToReply}
        onToggleReaction={onToggleReaction}
        onDeleteMessage={onDeleteMessage}
        onPressReplyQuote={scrollToMessage}
        highlighted={highlightedMessageKey === messageKey}
        isDarkMode={isDarkMode}
        reactions={msgReactions}
      />
    );
  };

  return (
    <SafeAreaView style={[styles.chatContainer, { backgroundColor: isDarkMode ? '#121212' : '#f9fafb' }]}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={[styles.header, { backgroundColor: isDarkMode ? '#1e1e1e' : 'white' }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={[styles.headerTitle, { color: isDarkMode ? 'white' : 'black' }]}>Friend Group Chat</Text>
            <View style={{
              width: 10,
              height: 10,
              borderRadius: 5,
              backgroundColor: isConnected ? '#22c55e' : '#ef4444',
              marginLeft: 10,
            }} />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <TouchableOpacity onPress={toggleDarkMode} style={{ marginRight: 15 }}>
              <Text style={{ fontSize: 20 }}>{isDarkMode ? '☀️' : '🌙'}</Text>
            </TouchableOpacity>
            <Text style={styles.versionTextHeader}>
              v{(Constants.manifest as any)?.version || '1.0.0'}
            </Text>
          </View>
        </View>
        <Text style={[styles.headerSub, { color: isDarkMode ? '#aaa' : '#555' }]}>Chatting as {username}</Text>
      </View>

      {activeUsers.length > 0 && (
        <View style={styles.activeUsersContainer}>
          {activeUsers.map(user => (
            <View key={user} style={[styles.activeUserChip, { backgroundColor: isDarkMode ? '#333' : '#dcfce7' }]}>
              <Text style={[styles.activeUserText, { color: isDarkMode ? '#aaa' : '#166534' }]}>{user}</Text>
            </View>
          ))}
        </View>
      )}

      {typingUsers.size > 0 && (
        <View style={styles.typingContainer}>
          <View style={[styles.typingBubble, { backgroundColor: isDarkMode ? '#333' : '#e5e7eb' }]}>
            {Array.from(typingUsers).map((user, idx) => (
               <Text key={user} style={{ fontSize: 12, color: isDarkMode ? '#aaa' : '#6b7280', marginRight: 4 }}>
                {user}{idx < typingUsers.size - 1 ? ',' : ''} typing
              </Text>
            ))}
            <View style={{ flexDirection: 'row', marginLeft: 6 }}>
               <View style={[styles.typingDot, { backgroundColor: isDarkMode ? '#aaa' : '#6b7280' }]} />
               <View style={[styles.typingDot, { opacity: 0.7, backgroundColor: isDarkMode ? '#aaa' : '#6b7280' }]} />
               <View style={[styles.typingDot, { opacity: 0.4, backgroundColor: isDarkMode ? '#aaa' : '#6b7280' }]} />
            </View>
          </View>
        </View>
      )}


      <KeyboardAvoidingView
        style={styles.flex1}
        behavior="padding"
      >
        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={renderMessage}
          keyExtractor={(item) => `${item.timestamp}_${item.sender}`}
          contentContainerStyle={styles.listContent}
          onScroll={(event) => {
            const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
            const paddingToBottom = 50;
            const isScrolledToBottom = contentSize.height - contentOffset.y - layoutMeasurement.height < paddingToBottom;
            setUserHasScrolledUp(!isScrolledToBottom);
          }}
          onContentSizeChange={() => {
            if (!userHasScrolledUp) {
              flatListRef.current?.scrollToEnd({ animated: true });
            }
          }}
          onLayout={() => {
            if (!userHasScrolledUp) {
              flatListRef.current?.scrollToEnd({ animated: true });
            }
          }}
        />
        {/* Reply bar above input */}
        {replyingTo && (
          <View style={styles.replyBar}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: 'bold', color: '#007AFF' }}>
                Replying to {replyingTo.sender}
              </Text>
              <Text numberOfLines={1} style={{ color: '#666' }}>
                {replyingTo.text}
              </Text>
            </View>
            <TouchableOpacity onPress={() => setReplyingTo(null)}>
              <Text style={{ color: '#999', fontWeight: 'bold' }}>✕</Text>
            </TouchableOpacity>
          </View>
        )}
        <View style={[styles.inputRow, { paddingBottom: insets.bottom + (Platform.OS === 'android' ? 48 : 0) + 10, backgroundColor: isDarkMode ? '#1e1e1e' : 'white' }]}>
          <AudioRecorder onAudioRecorded={handleAudioRecorded} isDarkMode={isDarkMode} />
          <TextInput
            style={[styles.chatInput, { backgroundColor: isDarkMode ? '#2c2c2c' : 'white', borderColor: isDarkMode ? '#444' : '#ddd', color: isDarkMode ? 'white' : 'black' }]}
            placeholder="Type a message..."
            placeholderTextColor="#666"
            value={inputText}
            onChangeText={(text) => {
              setInputText(text);
              if (text.trim()) {
                emitTyping(true);
              } else {
                emitTyping(false);
              }
            }}
          />
          <TouchableOpacity
            style={[styles.sendButton, !inputText.trim() && styles.sendButtonDisabled]}
            onPress={handleSendMessage}
            disabled={!inputText.trim()}
          >
            <Text style={styles.buttonText}>Send</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  lobbyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f3f4f6' },
  card: { width: '80%', padding: 20, backgroundColor: 'white', borderRadius: 15, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 10, elevation: 5 },
  title: { fontSize: 24, fontWeight: 'bold', textAlign: 'center', marginBottom: 20, color: '#000' },
  errorText: { color: 'red', textAlign: 'center', marginBottom: 10, fontWeight: 'bold' },
  input: { borderWidth: 1, borderColor: '#ccc', backgroundColor: '#fff', padding: 12, borderRadius: 8, marginBottom: 15, fontSize: 16, color: '#000' },
  button: { backgroundColor: '#2563eb', padding: 15, borderRadius: 8, alignItems: 'center' },
  buttonText: { color: 'white', fontWeight: 'bold', fontSize: 16 },
  versionText: { color: '#6b7280', fontSize: 12, textAlign: 'center', marginTop: 20 },

  chatContainer: { flex: 1, backgroundColor: '#f9fafb' },
  flex1: { flex: 1 },
  header: { padding: 15, backgroundColor: 'white', borderBottomWidth: 1, borderColor: '#eee' },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#000' },
  versionTextHeader: { color: '#9ca3af', fontSize: 12 },
  headerSub: { fontSize: 14, color: '#555' },
  activeUsersContainer: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 15, paddingTop: 5, backgroundColor: 'white' },
  activeUserChip: { backgroundColor: '#dcfce7', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, marginRight: 6, marginBottom: 6 },
  activeUserText: { color: '#166534', fontSize: 12 },
  typingContainer: { paddingHorizontal: 15, paddingBottom: 5, backgroundColor: 'white' },
  typingBubble: { backgroundColor: '#e5e7eb', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16, alignSelf: 'flex-start', flexDirection: 'row' },
  typingDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#6b7280', marginHorizontal: 2 },

  listContent: { padding: 15, paddingBottom: 20 },
  messageWrapper: { marginBottom: 15, maxWidth: '80%' },
  messageMe: { alignSelf: 'flex-end' },
  messageThem: { alignSelf: 'flex-start' },
  senderName: { fontSize: 12, color: 'gray', marginLeft: 4, marginBottom: 4 },
  bubble: { padding: 12, borderRadius: 20 },
  bubbleMe: { backgroundColor: '#3b82f6', borderBottomRightRadius: 4 },
  bubbleThem: { backgroundColor: '#e5e7eb', borderBottomLeftRadius: 4 },
  textMe: { color: 'white', fontSize: 16 },
  textThem: { color: 'black', fontSize: 16 },

  inputRow: { flexDirection: 'row', padding: 10, backgroundColor: 'white', borderTopWidth: 1, borderColor: '#eee' },
  chatInput: { flex: 1, borderWidth: 1, borderColor: '#ddd', backgroundColor: '#fff', borderRadius: 25, paddingHorizontal: 15, paddingVertical: 10, fontSize: 16, marginRight: 10, color: '#000' },
  sendButton: { backgroundColor: '#2563eb', justifyContent: 'center', paddingHorizontal: 20, borderRadius: 25 },
  sendButtonDisabled: { opacity: 0.5 },

  // The bar that appears above the TextInput
  replyBar: {
    flexDirection: 'row',
    backgroundColor: '#f0f0f0', // Light gray background
    borderLeftWidth: 4,
    borderLeftColor: '#007AFF', // The WhatsApp-style blue/green accent
    padding: 10,
    marginHorizontal: 10,
    marginTop: 5,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    alignItems: 'center',
    // Adds a subtle shadow so it looks like it's "floating" over the chat
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 5, 
  },

  // The small quote box inside the actual Message Bubble
  replyQuoteInBubble: {
    backgroundColor: 'rgba(0,0,0,0.05)', // Very light overlay
    borderLeftWidth: 3,
    borderLeftColor: '#007AFF',
    padding: 8,
    borderRadius: 4,
    marginBottom: 4,
  },

  replySenderName: {
    fontWeight: 'bold',
    fontSize: 12,
    color: '#007AFF',
    marginBottom: 2,
  },

  replyContentText: {
    fontSize: 13,
    color: '#555',
  },

  closeReplyButton: {
    padding: 8,
    marginLeft: 10,
  }
});
