import React, { useEffect, useState, useRef } from 'react';
import {
  StyleSheet, Text, View, TextInput, TouchableOpacity,
  FlatList, KeyboardAvoidingView, Platform, SafeAreaView
} from 'react-native';
import { io } from 'socket.io-client';
import { Stack } from 'expo-router';

// ⚠️ CRITICAL MOBILE GOTCHA:
// You cannot use "localhost" on a mobile device because the phone looks for a server
// running inside the phone itself! Use your server's public IP address.
// Example: "http://159.65.200.145:4000"
const SERVER_URL = "http://159.65.200.145:4000";

const socket = io(SERVER_URL, {
  autoConnect: false
});

const SECRET_PASSWORD = "bzizila";

export default function ChatScreen() {
  const [messages, setMessages] = useState<any[]>([]);
  const [inputText, setInputText] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isJoined, setIsJoined] = useState(false);

  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    if (!isJoined) return;

    socket.connect();
    socket.emit("join_chat");

    socket.on("chat_history", (history: any[]) => setMessages(history));
    socket.on("new_message", (msg: any) => setMessages((prev) => [...prev, msg]));

    return () => {
      socket.off("chat_history");
      socket.off("new_message");
      socket.disconnect();
    };
  }, [isJoined]);

  const handleJoin = () => {
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

  const handleSendMessage = () => {
    if (!inputText.trim()) return;

    const newMessage = {
      sender: username,
      text: inputText,
      timestamp: Date.now()
    };

    socket.emit("send_message", newMessage);
    setMessages((prev) => [...prev, newMessage]);
    setInputText("");
  };

  // 1. THE LOBBY
  if (!isJoined) {
    return (
      <SafeAreaView style={styles.lobbyContainer}>
        <View style={styles.card}>
          <Text style={styles.title}>Secret Group Chat</Text>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <TextInput
            style={styles.input}
            placeholder="Your Name"
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
          />
          <TextInput
            style={styles.input}
            placeholder="Secret Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />

          <TouchableOpacity style={styles.button} onPress={handleJoin}>
            <Text style={styles.buttonText}>Enter Room</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // 2. THE CHAT ROOM
  const renderMessage = ({ item }: { item: any }) => {
    const isMe = item.sender === username;
    return (
      <View style={[styles.messageWrapper, isMe ? styles.messageMe : styles.messageThem]}>
        {!isMe && <Text style={styles.senderName}>{item.sender}</Text>}
        <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem]}>
          <Text style={isMe ? styles.textMe : styles.textThem}>{item.text}</Text>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.chatContainer}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.header}>
        <Text style={styles.headerTitle}>Friend Group Chat</Text>
        <Text style={styles.headerSub}>Chatting as {username}</Text>
      </View>

      <KeyboardAvoidingView
        style={styles.flex1}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(_, index) => index.toString()}
          renderItem={renderMessage}
          contentContainerStyle={styles.listContent}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
        />

        <View style={styles.inputRow}>
          <TextInput
            style={styles.chatInput}
            placeholder="Type a message..."
            value={inputText}
            onChangeText={setInputText}
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
  title: { fontSize: 24, fontWeight: 'bold', textAlign: 'center', marginBottom: 20 },
  errorText: { color: 'red', textAlign: 'center', marginBottom: 10, fontWeight: 'bold' },
  input: { borderWidth: 1, borderColor: '#ccc', padding: 12, borderRadius: 8, marginBottom: 15, fontSize: 16 },
  button: { backgroundColor: '#2563eb', padding: 15, borderRadius: 8, alignItems: 'center' },
  buttonText: { color: 'white', fontWeight: 'bold', fontSize: 16 },

  chatContainer: { flex: 1, backgroundColor: '#f9fafb' },
  flex1: { flex: 1 },
  header: { padding: 15, backgroundColor: 'white', borderBottomWidth: 1, borderColor: '#eee' },
  headerTitle: { fontSize: 18, fontWeight: 'bold' },
  headerSub: { fontSize: 14, color: 'gray' },

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
  chatInput: { flex: 1, borderWidth: 1, borderColor: '#ddd', borderRadius: 25, paddingHorizontal: 15, paddingVertical: 10, fontSize: 16, marginRight: 10 },
  sendButton: { backgroundColor: '#2563eb', justifyContent: 'center', paddingHorizontal: 20, borderRadius: 25 },
  sendButtonDisabled: { opacity: 0.5 }
});
