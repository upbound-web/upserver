import { join } from 'path';
import { mkdir, writeFile } from 'fs/promises';
import { access } from 'fs/promises';
import { nanoid } from 'nanoid';

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/svg+xml'];
const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.svg'];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export class ImageUploadService {
  /**
   * Gets file extension from MIME type
   */
  static getExtensionFromMimeType(mimeType: string): string {
    const mimeToExt: Record<string, string> = {
      'image/jpeg': '.jpg',
      'image/jpg': '.jpg',
      'image/png': '.png',
      'image/webp': '.webp',
      'image/svg+xml': '.svg',
    };
    return mimeToExt[mimeType] || '.jpg';
  }

  /**
   * Validates an uploaded image file
   */
  static validateFile(file: Express.Multer.File): { valid: boolean; error?: string } {
    // Check file size
    if (file.size > MAX_FILE_SIZE) {
      return {
        valid: false,
        error: `File size exceeds maximum of ${MAX_FILE_SIZE / 1024 / 1024}MB`,
      };
    }

    // Check MIME type (primary validation)
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      return {
        valid: false,
        error: `File type not allowed. Allowed types: ${ALLOWED_EXTENSIONS.join(', ')}`,
      };
    }

    // Check file extension - if not present or invalid, derive from MIME type
    const ext = file.originalname.toLowerCase().match(/\.[^.]+$/)?.[0];
    if (!ext || !ALLOWED_EXTENSIONS.includes(ext)) {
      // If MIME type is valid, we can trust it and derive extension
      // This handles cases where client-side optimization changes the filename
      const derivedExt = this.getExtensionFromMimeType(file.mimetype);
      if (derivedExt) {
        // File is valid, extension will be derived from MIME type
        return { valid: true };
      }
      return {
        valid: false,
        error: `File extension not allowed. Allowed extensions: ${ALLOWED_EXTENSIONS.join(', ')}`,
      };
    }

    return { valid: true };
  }

  /**
   * Sanitizes a filename to prevent path traversal
   */
  static sanitizeFilename(filename: string): string {
    // Remove path separators and dangerous characters
    return filename
      .replace(/[\/\\]/g, '_')
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .substring(0, 255); // Limit length
  }

  /**
   * Generates a unique filename for an uploaded image
   */
  static generateFilename(originalName: string, mimeType: string): string {
    // Try to get extension from filename first
    let ext = originalName.toLowerCase().match(/\.[^.]+$/)?.[0];
    
    // If no valid extension, derive from MIME type
    if (!ext || !ALLOWED_EXTENSIONS.includes(ext)) {
      ext = this.getExtensionFromMimeType(mimeType);
    }
    
    // Fallback to .jpg if still no extension
    if (!ext) {
      ext = '.jpg';
    }
    
    const sanitized = this.sanitizeFilename(originalName.replace(/\.[^.]+$/, ''));
    const timestamp = Date.now();
    const randomId = nanoid(8);
    return `${timestamp}-${randomId}-${sanitized}${ext}`;
  }

  /**
   * Saves uploaded images to the customer's site folder
   * @param files Array of uploaded files
   * @param sitePath Path to the customer's site folder
   * @returns Array of relative paths to the saved images
   */
  static async saveImages(
    files: Express.Multer.File[],
    sitePath: string
  ): Promise<string[]> {
    // Verify site directory exists
    try {
      await access(sitePath);
    } catch {
      throw new Error(`Site directory does not exist: ${sitePath}`);
    }

    // Create uploads directory if it doesn't exist
    const uploadsDir = join(sitePath, 'public', 'uploads');
    try {
      await access(uploadsDir);
    } catch {
      await mkdir(uploadsDir, { recursive: true });
    }

    const savedPaths: string[] = [];

    for (const file of files) {
      // Validate file
      const validation = this.validateFile(file);
      if (!validation.valid) {
        throw new Error(
          `Invalid file ${file.originalname || 'unknown'} (MIME: ${file.mimetype}): ${validation.error}`
        );
      }

      // Generate unique filename (pass mimeType to handle cases where extension is missing)
      const filename = this.generateFilename(file.originalname, file.mimetype);
      const filePath = join(uploadsDir, filename);

      // Save file
      await writeFile(filePath, file.buffer);

      // Return relative path from site root
      const relativePath = `public/uploads/${filename}`;
      savedPaths.push(relativePath);
    }

    return savedPaths;
  }
}

