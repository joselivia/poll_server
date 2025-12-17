# File Upload Setup Instructions

## 1. Install Dependencies

Run this command in the `poll_server` directory:

```bash
npm install multer @types/multer
```

or if using pnpm:

```bash
pnpm add multer @types/multer
```

## 2. Run Database Migration

Execute the SQL migration to add the required columns:

```bash
psql -U your_username -d your_database -f migrations/add_media_uploads.sql
```

Or manually run the SQL commands in your PostgreSQL client.

## 3. Environment Variables

Add this to your `.env` file (optional):

```env
BASE_URL=http://localhost:8082
```

This will be used to generate file URLs. If not set, it defaults to `http://localhost:8082`.

## 4. File Storage

Files are stored locally in:
- `poll_server/uploads/images/` - for image uploads
- `poll_server/uploads/audio/` - for audio recordings

These directories are automatically created when the server starts.

## 5. File Upload Endpoint

**POST** `/api/upload`

**Request:**
- Content-Type: `multipart/form-data`
- Body:
  - `file`: The file to upload (required)
  - `type`: Either "image" or "audio" (required)

**Response:**
```json
{
  "message": "File uploaded successfully",
  "url": "http://localhost:8082/uploads/images/1234567890-123456789.jpg",
  "filename": "1234567890-123456789.jpg",
  "size": 123456,
  "mimetype": "image/jpeg"
}
```

**Error Response:**
```json
{
  "message": "Error message here"
}
```

## 6. File Limits

- Maximum file size: 10MB
- Allowed image types: All image/* MIME types
- Allowed audio types: All audio/* MIME types, video/webm (for browser recordings), application/octet-stream

## 7. Delete Endpoint (Optional)

**DELETE** `/api/upload/:type/:filename`

Deletes an uploaded file. Useful for cleanup.

## 8. Production Deployment

For production, consider:

1. **Cloud Storage**: Modify `routes/upload.ts` to use AWS S3, Cloudinary, or similar
2. **CDN**: Serve uploaded files through a CDN for better performance
3. **File Validation**: Add more robust file type checking
4. **Virus Scanning**: Integrate with a virus scanning service
5. **Rate Limiting**: Add rate limiting to prevent abuse

## 9. Cloud Storage Example (Cloudinary)

To use Cloudinary instead of local storage:

```bash
pnpm add cloudinary
```

Then modify `routes/upload.ts`:

```typescript
import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// In the upload route:
const result = await cloudinary.uploader.upload(req.file.path, {
  folder: type === 'audio' ? 'poll-audio' : 'poll-images',
  resource_type: type === 'audio' ? 'video' : 'image'
});

res.json({
  message: "File uploaded successfully",
  url: result.secure_url,
  ...
});
```

## 10. Testing

Test the upload endpoint with curl:

```bash
# Image upload
curl -X POST http://localhost:8082/api/upload \
  -F "file=@/path/to/image.jpg" \
  -F "type=image"

# Audio upload
curl -X POST http://localhost:8082/api/upload \
  -F "file=@/path/to/audio.webm" \
  -F "type=audio"
```
