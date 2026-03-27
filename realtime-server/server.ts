import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import redisClient, { connectRedis } from './redisClient.js';

const app = express();
const httpServer = createServer(app);

// 1. Initialize Socket.io and configure CORS
// CORS is required so your Next.js app (on port 3000) is allowed to talk to this server (on port 4000)
const io = new Server(httpServer, {
  cors: {
    origin: process.env.CORS_ORIGIN || "*",
    methods: ["GET", "POST"]
  }
});

// 2. Start the HTTP Server and connect to Redis
const PORT = process.env.PORT || 4000;
httpServer.listen(PORT, async () => {
  await connectRedis(); // This calls the function we exported from redisClient.ts
  console.log(`🚀 Real-time server running on http://localhost:${PORT}`);
});

// 3. The Core Chat Logic
io.on('connection', (socket) => {
  console.log(`🟢 User connected: ${socket.id}`);

  // We are hardcoding the room since it's just you and your friends
  const ROOM_ID = "friend_group_chat";
  const REDIS_ROOM_KEY = `chat:${ROOM_ID}`;

  // Typing indicator: map socket id to { username, timeout }
  const typingUsers = new Map<string, { username: string, timeout: ReturnType<typeof setTimeout> }>();
  // Active users: map socket id to username
  const activeUsers = new Map<string, string>();

  // Helper to broadcast typing status to others in the room
  const broadcastTyping = (username: string, isTyping: boolean) => {
    socket.to(ROOM_ID).emit("typing", { username, isTyping });
  };
  // Helper to broadcast active users to the room
  const broadcastActiveUsers = () => {
    const users = Array.from(activeUsers.values());
    io.to(ROOM_ID).emit("users_update", users);
  };

  // Helper to clear typing for a socket
  const clearTyping = (socketId: string) => {
    const typingData = typingUsers.get(socketId);
    if (typingData) {
      clearTimeout(typingData.timeout);
      typingUsers.delete(socketId);
      broadcastTyping(typingData.username, false);
    }
  };

  // EVENT A: User Joins
  socket.on("join_chat", async (username: string) => {
    socket.join(ROOM_ID);
    // Store user in active users map
    activeUsers.set(socket.id, username);
    // Broadcast updated user list to the room
    broadcastActiveUsers();
    
    // Fetch the last 100 messages from Redis
    const rawHistory = await redisClient.lRange(REDIS_ROOM_KEY, 0, 99);
    
    // Parse the JSON strings back into objects
    let parsedHistory = rawHistory.map((msg: string) => JSON.parse(msg));
    
    // ⚠️ CRITICAL FIX: Because we use lPush (Left Push), Redis stores the NEWEST 
    // message at index 0. We need to reverse the array so the oldest messages 
    // render at the top of the screen, and the newest render at the bottom.
    parsedHistory = parsedHistory.reverse();
    
    // Send the correctly ordered history only to the user who just joined
    socket.emit("chat_history", parsedHistory);
  });

  // EVENT B: User Sends a Message
  socket.on("send_message", async (messageData) => {
    // Ensure user is in active users map (fallback if join_chat not called)
    if (!activeUsers.has(socket.id)) {
      activeUsers.set(socket.id, messageData.sender);
      broadcastActiveUsers();
    }
    // Clear typing for this user when they send a message
    clearTyping(socket.id);
    
    // 1. Turn the JavaScript object into a string for Redis
    const messageString = JSON.stringify(messageData);

    // 2. Push it to the front of the list (index 0)
    await redisClient.lPush(REDIS_ROOM_KEY, messageString);

    // 3. Trim the list so it never grows larger than 100 messages
    await redisClient.lTrim(REDIS_ROOM_KEY, 0, 99);

    // 4. Broadcast the message to everyone ELSE currently in the room
    socket.to(ROOM_ID).emit("new_message", messageData);
  });

  // EVENT D: User starts typing
  socket.on("typing_start", (username: string) => {
    // Ensure user is in active users map (fallback if join_chat not called)
    if (!activeUsers.has(socket.id)) {
      activeUsers.set(socket.id, username);
      broadcastActiveUsers();
    }
    // Clear existing timeout for this socket
    const existing = typingUsers.get(socket.id);
    if (existing) {
      clearTimeout(existing.timeout);
    }
    // Set a new timeout to automatically stop typing after 3 seconds
    const timeout = setTimeout(() => {
      clearTyping(socket.id);
    }, 3000);
    typingUsers.set(socket.id, { username, timeout });
    broadcastTyping(username, true);
  });

  // EVENT E: User stops typing (optional, can be triggered by blur or manual stop)
  socket.on("typing_stop", (username: string) => {
    clearTyping(socket.id);
  });

  // EVENT C: User Disconnects
  socket.on('disconnect', () => {
    // Clear typing for this user
    clearTyping(socket.id);
    // Remove from active users
    activeUsers.delete(socket.id);
    broadcastActiveUsers();
    console.log(`🔴 User disconnected: ${socket.id}`);
  });
});
app.get('/', (req, res) => {
     res.send('Realtime server is running');
   });