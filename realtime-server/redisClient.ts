import { createClient } from 'redis';

// 1. Create the client and point it to your Docker container
const redisClient = createClient({
  // By default, Docker exposes Redis on localhost:6379
  url: process.env.REDIS_URL || 'redis://localhost:6379'
});

// 2. Listen for errors so your server doesn't crash silently if Docker stops
redisClient.on('error', (err) => {
  console.error('Redis Client Error:', err);
});

// 3. Create a helper function to start the connection
export const connectRedis = async () => {
  try {
    if (!redisClient.isOpen) {
      await redisClient.connect();
      console.log('✅ Connected to Redis successfully');
    }
  } catch (error) {
    console.error('❌ Could not connect to Redis:', error);
  }
};

// 4. Export the client so your server.ts file can use it
export default redisClient;