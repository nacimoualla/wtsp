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

  // EVENT A: User Joins
  socket.on("join_chat", async () => {
    socket.join(ROOM_ID);
    
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
    // 1. Turn the JavaScript object into a string for Redis
    const messageString = JSON.stringify(messageData);

    // 2. Push it to the front of the list (index 0)
    await redisClient.lPush(REDIS_ROOM_KEY, messageString);

    // 3. Trim the list so it never grows larger than 100 messages
    await redisClient.lTrim(REDIS_ROOM_KEY, 0, 99);

    // 4. Broadcast the message to everyone ELSE currently in the room
    socket.to(ROOM_ID).emit("new_message", messageData);
  });

  // EVENT C: User Disconnects
  socket.on('disconnect', () => {
    console.log(`🔴 User disconnected: ${socket.id}`);
  });
});