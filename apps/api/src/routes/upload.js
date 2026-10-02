import multer from 'multer';
import env from '../config/env.js';

/**
 * Multipart upload handling.
 *
 * Files are held in memory rather than written to a temp directory: images are
 * capped at MEDIA_MAX_BYTES, they are re-encoded with sharp before being stored,
 * and the intermediate temp file would just be deleted. This also keeps uploads
 * out of the web-writable document root entirely.
 *
 * This is only the first pass. multer trusts the declared MIME type and size,
 * so src/services/media.service.js decodes each file with sharp to confirm it is
 * genuinely an image before anything is written to storage.
 */
const storage = multer.memoryStorage();

export const upload = multer({
  storage,

  limits: {
    fileSize: env.MEDIA_MAX_BYTES,
    files: 10,
    // Reject unexpected fields outright rather than silently ignoring them.
    fields: 20,
    fieldSize: 1024 * 100,
  },

  fileFilter(request, file, callback) {
    if (!env.MEDIA_ALLOWED_TYPES.includes(file.mimetype)) {
      callback(
        Object.assign(new Error(`File type ${file.mimetype} is not accepted`), { statusCode: 400 }),
      );
      return;
    }
    callback(null, true);
  },
});

/** Single-file variant, for endpoints that take one image. */
export const uploadSingle = upload.single('file');

export default upload;