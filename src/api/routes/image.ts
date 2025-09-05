import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { imageBucketName, minioClient, multerUpload, getImageUrl } from '../../services/minio';
import { UploadImage200Response } from '../openapi-client/models/UploadImage200Response';
import { auth } from '../../middlewares';
import sharp from 'sharp';

const router = Router();
export default router;

// Allowed image types and max size
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const MAX_FILE_SIZE = 1 * 1024 * 1024; // 1MB

router.post(
  '/upload',
  auth.required,
  multerUpload.single('image'),
  async (req: Request, res: Response) => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const userId = req.user!.userId; // guaranteed by auth middleware
      if (!req.file) {
        res.status(400).json({ success: false, error: 'No file provided' });
        return;
      }

      // Validate file type
      if (!ALLOWED_MIME_TYPES.includes(req.file.mimetype)) {
        res.status(400).json({
          success: false,
          error: 'Invalid file type. Only JPEG, PNG, GIF, and WebP are allowed.',
        });
        return;
      }

      // Validate file size
      if (req.file.size > MAX_FILE_SIZE) {
        res.status(400).json({ success: false, error: 'File too large. Maximum size is 5MB.' });
        return;
      }

      // Convert image to WebP
      // Reduce quality until the file size is below PREFERRED_MAX_SIZE
      const PREFERRED_MAX_SIZE = 100 * 1024; // 100KB
      let processedBuffer: Buffer;
      let quality = 80;

      do {
        processedBuffer = await sharp(req.file.buffer).webp({ quality }).toBuffer();
        quality -= 5;
      } while (quality >= 10 && processedBuffer.length > PREFERRED_MAX_SIZE);

      // Update the buffer and mime type
      req.file.buffer = processedBuffer;
      req.file.mimetype = 'image/webp';

      const metaData = { userId: userId, uploadedAt: new Date().toISOString() };
      const filename = `${uuidv4()}.webp`;

      await minioClient.putObject(imageBucketName, filename, req.file.buffer, undefined, metaData);

      const response: UploadImage200Response = {
        success: true,
        url: getImageUrl(filename),
      };

      res.status(200).json(response);
    } catch (err) {
      console.error('Error uploading file:', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  },
);
