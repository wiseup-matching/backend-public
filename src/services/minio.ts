import { Client } from 'minio';
import multer from 'multer';

export const minioClient = new Client({
  endPoint: process.env.MINIO_ENDPOINT ?? '',
  port: process.env.MINIO_API_PORT ? parseInt(process.env.MINIO_API_PORT, 10) : undefined,
  useSSL: false, // TODO: only for development, use SSL in production
  accessKey: process.env.MINIO_ROOT_USER,
  secretKey: process.env.MINIO_ROOT_PASSWORD,
});

const storage = multer.memoryStorage();
export const multerUpload = multer({ storage: storage });

export const imageBucketName = 'images';

export function getImageUrl(filename: string): string {
  if (!process.env.MINIO_PUBLIC_ENDPOINT || !process.env.MINIO_API_PORT) {
    throw new Error('MINIO_ENDPOINT or MINIO_PORT is not defined in environment variables');
  }

  // TODO: use https in production
  return `http://${process.env.MINIO_PUBLIC_ENDPOINT}:${process.env.MINIO_API_PORT}/${imageBucketName}/${filename}`;
}

export async function ensureBucketExists() {
  try {
    const bucketExists = await minioClient.bucketExists(imageBucketName);
    if (!bucketExists) {
      await minioClient.makeBucket(imageBucketName, process.env.MINIO_REGION);
      console.log(`Bucket "${imageBucketName}" created.`);
    }
  } catch (err) {
    console.error('Error creating bucket', err);
  }
}

// allows public read access to the bucket
// This is necessary to allow the frontend to access the images without authentication
export async function setBucketPolicy() {
  const policy = `{
    "Version": "2012-10-17",
    "Statement": [
      {
        "Effect": "Allow",
        "Principal": "*",
        "Action": "s3:GetObject",
        "Resource": "arn:aws:s3:::${imageBucketName}/*"
      }
    ]
  }`;

  try {
    await minioClient.setBucketPolicy(imageBucketName, policy);
    console.log(`Set bucket policy for "${imageBucketName}".`);
  } catch (err) {
    console.error('error setting bucket policy', err);
  }
}

ensureBucketExists()
  .then(async () => {
    await setBucketPolicy();
  })
  .catch((err: unknown) => {
    console.error('Error intitializing minio', err);
  });
