import { createClient } from 'redis';

const redisClient = createClient({ url: process.env.REDIS_URL || 'redis://localhost:6379' });

redisClient.on('error', (err) => console.error('Redis error:', err));
redisClient.on('connect', () => console.log('Redis connected'));

export const connectRedis = async () => {
  try {
    await redisClient.connect();
  } catch (err) {
    console.warn('Redis connection failed');
    throw err;
  }
};
export default redisClient;
