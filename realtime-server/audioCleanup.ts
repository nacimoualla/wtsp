/**
 * Audio Cleanup Utility
 * Automatically deletes audio files older than 20 minutes from Cloudflare R2
 */

import { S3Client, ListObjectsV2Command, DeleteObjectCommand } from '@aws-sdk/client-s3';
import cron from 'node-cron';

// Cloudflare R2 Configuration
const R2_CONFIG = {
  accountId: process.env.R2_ACCOUNT_ID || 'c9a4537b9a1c43578ccc82d2a6771d88',
  accessKeyId: process.env.R2_ACCESS_KEY_ID || '1066d035159616d706f9e46dc8652657',
  secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || 'f6bfecfa780fc778bd0cecd65946153a8d1051cc26b37828f556d51a0af78ee5',
  bucketName: process.env.R2_BUCKET_NAME || 'chat',
};

const s3Client = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_CONFIG.accountId}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_CONFIG.accessKeyId,
    secretAccessKey: R2_CONFIG.secretAccessKey,
  },
});

const TWENTY_MINUTES = 20 * 60 * 1000; // 20 minutes in milliseconds

/**
 * Clean up audio files older than 20 minutes
 */
export const cleanupOldAudioFiles = async (): Promise<number> => {
  try {
    console.log('[AUDIO-CLEANUP] Starting cleanup...');
    
    // List all objects in the audio/ prefix
    const listCommand = new ListObjectsV2Command({
      Bucket: R2_CONFIG.bucketName,
      Prefix: 'audio/',
    });
    
    const listResponse = await s3Client.send(listCommand);
    
    if (!listResponse.Contents || listResponse.Contents.length === 0) {
      console.log('[AUDIO-CLEANUP] No audio files found');
      return 0;
    }
    
    const now = Date.now();
    let deletedCount = 0;
    
    for (const object of listResponse.Contents) {
      if (!object.Key || !object.LastModified) continue;
      
      // Extract timestamp from filename format: audio/{messageId}_{timestamp}.m4a
      const parts = object.Key.split('_');
      const timestampPart = parts[parts.length - 1];
      const timestamp = parseInt(timestampPart.replace('.m4a', ''), 10);
      
      if (isNaN(timestamp)) {
        // Try alternative: use LastModified from R2
        const fileAge = now - new Date(object.LastModified).getTime();
        if (fileAge > TWENTY_MINUTES) {
          await deleteFile(object.Key);
          deletedCount++;
        }
      } else {
        // Use timestamp from filename
        const fileAge = now - timestamp;
        if (fileAge > TWENTY_MINUTES) {
          await deleteFile(object.Key);
          deletedCount++;
        }
      }
    }
    
    console.log(`[AUDIO-CLEANUP] Cleanup complete. Deleted ${deletedCount} files.`);
    return deletedCount;
    
  } catch (error) {
    console.error('[AUDIO-CLEANUP] Error during cleanup:', error);
    return 0;
  }
};

/**
 * Delete a single file from R2
 */
const deleteFile = async (key: string): Promise<void> => {
  try {
    const deleteCommand = new DeleteObjectCommand({
      Bucket: R2_CONFIG.bucketName,
      Key: key,
    });
    
    await s3Client.send(deleteCommand);
    console.log(`[AUDIO-CLEANUP] Deleted: ${key}`);
  } catch (error) {
    console.error(`[AUDIO-CLEANUP] Failed to delete ${key}:`, error);
  }
};

/**
 * Start the cron job to run cleanup every 5 minutes
 */
export const startAudioCleanupScheduler = (): void => {
  // Run every 5 minutes
  cron.schedule('*/5 * * * *', async () => {
    console.log('[AUDIO-CLEANUP] Running scheduled cleanup...');
    await cleanupOldAudioFiles();
  });
  
  console.log('[AUDIO-CLEANUP] Scheduler started (runs every 5 minutes)');
  
  // Also run initial cleanup on startup
  cleanupOldAudioFiles();
};
