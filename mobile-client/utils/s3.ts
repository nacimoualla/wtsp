/**
 * S3/R2 Upload Utility for Audio Messages
 * Compatible with Cloudflare R2
 */

import { PutObjectCommand, S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';

// ============================================
// CLOUDFLARE R2 CONFIGURATION
// Replace these with your actual R2 credentials
// ============================================
const R2_CONFIG = {
  // Your Cloudflare Account ID
  accountId: 'YOUR_CLOUDFLARE_ACCOUNT_ID',
  
  // R2 Access Key (create in Cloudflare Dashboard > R2 > Manage R2 API Tokens)
  accessKeyId: 'YOUR_R2_ACCESS_KEY_ID',
  
  // R2 Secret Key
  secretAccessKey: 'YOUR_R2_SECRET_ACCESS_KEY',
  
  // Your R2 bucket name
  bucketName: 'YOUR_R2_BUCKET_NAME',
  
  // Your custom domain for R2 (optional, or use the r2.dev public URL)
  // Example: https://pub-xxx.r2.dev or your custom domain
  publicUrl: 'https://YOUR_PUBLIC_URL.r2.dev',
};

// S3 Client configured for Cloudflare R2
const s3Client = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_CONFIG.accountId}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_CONFIG.accessKeyId,
    secretAccessKey: R2_CONFIG.secretAccessKey,
  },
});

/**
 * Upload audio file to Cloudflare R2
 * @param audioUri - Local file URI from expo-av recording
 * @param messageId - Unique message ID for filename
 * @returns Public URL of uploaded file
 */
export const uploadAudioToR2 = async (
  audioUri: string,
  messageId: string
): Promise<string> => {
  try {
    // Fetch the file
    const response = await fetch(audioUri);
    const blob = await response.blob();
    
    // Convert blob to ArrayBuffer for AWS SDK
    const arrayBuffer = await blob.arrayBuffer();
    
    // Generate filename with timestamp for cleanup
    const timestamp = Date.now();
    const fileName = `audio/${messageId}_${timestamp}.m4a`;
    
    // Upload to R2
    const command = new PutObjectCommand({
      Bucket: R2_CONFIG.bucketName,
      Key: fileName,
      Body: arrayBuffer,
      ContentType: 'audio/m4a',
      // Metadata for auto-cleanup
      Metadata: {
        uploadedAt: timestamp.toString(),
        expiresAt: (timestamp + 20 * 60 * 1000).toString(), // 20 minutes
      },
    });
    
    await s3Client.send(command);
    
    // Return public URL
    const publicUrl = `${R2_CONFIG.publicUrl}/${fileName}`;
    console.log('[S3] Audio uploaded:', publicUrl);
    
    return publicUrl;
  } catch (error) {
    console.error('[S3] Upload failed:', error);
    throw error;
  }
};

/**
 * Delete audio file from R2
 * @param fileName - The key/filename in R2
 */
export const deleteAudioFromR2 = async (fileName: string): Promise<void> => {
  try {
    const command = new DeleteObjectCommand({
      Bucket: R2_CONFIG.bucketName,
      Key: fileName,
    });
    
    await s3Client.send(command);
    console.log('[S3] Audio deleted:', fileName);
  } catch (error) {
    console.error('[S3] Delete failed:', error);
  }
};

/**
 * Extract filename from public URL
 */
export const getFileNameFromUrl = (url: string): string => {
  const urlParts = url.split('/');
  return urlParts.slice(-2).join('/'); // Returns 'audio/filename.m4a'
};

/**
 * Check if audio URL is expired (older than 20 minutes)
 */
export const isAudioExpired = (url: string): boolean => {
  try {
    // Extract timestamp from filename format: audio/{messageId}_{timestamp}.m4a
    const parts = url.split('_');
    const timestampPart = parts[parts.length - 1];
    const timestamp = parseInt(timestampPart.replace('.m4a', ''), 10);
    
    if (isNaN(timestamp)) return false;
    
    const twentyMinutes = 20 * 60 * 1000;
    return Date.now() - timestamp > twentyMinutes;
  } catch {
    return false;
  }
};
