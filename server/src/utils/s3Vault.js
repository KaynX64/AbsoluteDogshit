// server/src/utils/s3Vault.js
import 'dotenv/config';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  CreateBucketCommand,
} from '@aws-sdk/client-s3';

// Helper to fail closed if credentials are missing from .env
function requiredEnv(name) {
  const val = process.env[name];
  if (!val) {
    throw new Error(`[S3 Vault] Missing required environment variable: ${name}`);
  }
  return val;
}

export const BUCKET_NAME = process.env.S3_BUCKET || 'valetudo-attachments';

// Configure S3 Client pointing to MinIO
export const s3 = new S3Client({
  region: process.env.S3_REGION || 'us-east-1',
  endpoint: process.env.S3_ENDPOINT || 'http://127.0.0.1:9000',
  credentials: {
    accessKeyId: requiredEnv('S3_ACCESS_KEY'),
    secretAccessKey: requiredEnv('S3_SECRET_KEY'),
  },
  forcePathStyle: true, // Required for MinIO
});

/**
 * Ensures the target bucket exists on startup
 */
export async function ensureBucketExists() {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: BUCKET_NAME }));
  } catch (err) {
    if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) {
      try {
        await s3.send(new CreateBucketCommand({ Bucket: BUCKET_NAME }));
        console.log(`📦 [MinIO S3] Bucket "${BUCKET_NAME}" created successfully.`);
      } catch (createErr) {
        console.error('❌ [MinIO S3] Failed to create bucket:', createErr.message);
      }
    } else {
      console.warn(
        `⚠️ [MinIO S3] MinIO connection warning: ${err.message} (HTTP ${err.$metadata?.httpStatusCode})`
      );
    }
  }
}

/**
 * Uploads a file buffer to MinIO S3
 */
export async function uploadToS3({ buffer, key, mimeType }) {
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: mimeType,
    })
  );
  return key;
}

/**
 * Retrieves a file stream from MinIO S3
 */
export async function getFromS3(key) {
  const response = await s3.send(
    new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    })
  );
  return response;
}