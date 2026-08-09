import { Queue, QueueEvents } from "bullmq";
import Redis from "ioredis";

// Lazy Redis connection helper - only connects if REDIS_URL is explicitly set in environment
const getRedisConnection = () => {
  if (!process.env.REDIS_URL) {
    return null;
  }
  return new Redis(process.env.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableOfflineQueue: false,
  });
};

const connection = getRedisConnection();

export const ingestionQueueName = "ingestion-queue";
export const ingestionQueue = connection ? new Queue(ingestionQueueName, { connection }) : null as any;

export const pollerQueueName = "poller-queue";
export const pollerQueue = connection ? new Queue(pollerQueueName, { connection }) : null as any;

export const ingestionQueueEvents = connection ? new QueueEvents(ingestionQueueName, { connection }) : null as any;
export const pollerQueueEvents = connection ? new QueueEvents(pollerQueueName, { connection }) : null as any;

export async function closeQueues() {
  if (ingestionQueue) await ingestionQueue.close();
  if (pollerQueue) await pollerQueue.close();
  if (connection) await connection.quit();
}
