import { Worker, Job } from "bullmq";
import Redis from "ioredis";
import { pollerQueueName, ingestionQueue } from "../lib/queue";
import crypto from "crypto";
import { prisma } from "../lib/prisma";
const connection = new Redis(process.env.REDIS_URL || "redis://127.0.0.1:6379", {
  maxRetriesPerRequest: null,
});

export const pollerWorker = new Worker(
  pollerQueueName,
  async (job: Job) => {
    const { brandId, feedUrl } = job.data;
    
    if (!brandId || !feedUrl) {
      throw new Error("Missing brandId or feedUrl in job data");
    }

    console.log(`[Poller] Checking updates for brand ${brandId} at ${feedUrl}`);

    const brand = await prisma.brand.findUnique({
      where: { id: brandId }
    });

    if (!brand) {
      throw new Error(`Brand ${brandId} not found`);
    }

    try {
      // Perform a lightweight HEAD request first if possible
      const response = await fetch(feedUrl, { method: "HEAD" });
      
      let currentHash = "";

      // Try to use ETag or Last-Modified first (Zero payload cost)
      const etag = response.headers.get("etag");
      const lastModified = response.headers.get("last-modified");

      if (etag) {
        currentHash = etag;
      } else if (lastModified) {
        currentHash = lastModified;
      } else {
        // Fallback: If the server doesn't support HEAD or doesn't return ETag, 
        // we have to fetch the body and hash it (still better than full ingestion processing)
        const getResponse = await fetch(feedUrl);
        const text = await getResponse.text();
        currentHash = crypto.createHash("md5").update(text).digest("hex");
      }

      // Check if the hash has changed
      if (brand.lastPolledHash !== currentHash) {
        console.log(`[Poller] Change detected for brand ${brand.name}. Enqueueing ingestion.`);
        
        // Update the hash in the DB
        await prisma.brand.update({
          where: { id: brand.id },
          data: { lastPolledHash: currentHash }
        });

        // Enqueue to the heavy ingestion queue
        await ingestionQueue.add(`ingest-${brand.id}`, {
          brandId: brand.id,
          feedUrl: feedUrl,
          platformType: brand.platformType
        });
      } else {
        console.log(`[Poller] No changes for brand ${brand.name}. Skipping ingestion.`);
      }

    } catch (error: any) {
      console.error(`[Poller] Error polling brand ${brand.name}:`, error.message);
      throw error; // Let BullMQ handle retries
    }
  },
  { connection, concurrency: 5 }
);

// Worker event listeners
pollerWorker.on("completed", (job) => {
  console.log(`[Poller] Job ${job.id} completed.`);
});

pollerWorker.on("failed", (job, err) => {
  console.error(`[Poller] Job ${job?.id} failed with error ${err.message}`);
});
