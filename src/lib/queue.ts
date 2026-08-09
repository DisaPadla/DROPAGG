import { Queue, Worker, QueueEvents } from "bullmq";
import Redis from "ioredis";

// Configure Redis connection
// In a real environment, use process.env.REDIS_URL
const connection = new Redis(process.env.REDIS_URL || "redis://127.0.0.1:6379", {
  maxRetriesPerRequest: null,
});

// 1. Ingestion Queue
// Handles the heavy lifting: fetching large JSON feeds, processing them, and inserting into DB.
export const ingestionQueueName = "ingestion-queue";
export const ingestionQueue = new Queue(ingestionQueueName, { connection });

// 2. Poller Queue
// Handles the lightweight HEAD requests to check for hash changes before triggering full ingestion.
export const pollerQueueName = "poller-queue";
export const pollerQueue = new Queue(pollerQueueName, { connection });

// Queue Events for Monitoring
export const ingestionQueueEvents = new QueueEvents(ingestionQueueName, { connection });
export const pollerQueueEvents = new QueueEvents(pollerQueueName, { connection });

/**
 * Helper to gracefully close connections
 */
export async function closeQueues() {
  await ingestionQueue.close();
  await pollerQueue.close();
  await connection.quit();
}
