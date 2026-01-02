# Blog Posts Media Upload Migration

## Overview
This migration changes how blog post media files (images, videos, PDFs) are stored. Instead of storing binary data in the database, files are now saved to disk and only URLs are stored in the database.

## Changes Made

### 1. Updated `posts.ts` Route
- Changed from `multer.memoryStorage()` to `multer.diskStorage()`
- Files are now saved to dedicated directories:
  - `poll_server/uploads/blog-images/` - Image files
  - `poll_server/uploads/blog-videos/` - Video files
  - `poll_server/uploads/blog-pdfs/` - PDF files
- Database now stores JSON arrays of URLs instead of binary data
- File size limit increased to 50MB per file

### 2. Database Schema Changes
- `image_data`, `video_data`, `pdf_data` columns changed from `bytea` to `text`
- These columns now store JSON arrays of file URLs

### 3. Directory Structure
New directories are automatically created when the server starts:
```
poll_server/
  uploads/
    blog-images/
    blog-videos/
    blog-pdfs/
```

## Migration Steps

### 1. Run Database Migration

Execute the SQL migration:

```bash
cd poll_server
psql -U your_username -d your_database -f migrations/alter_blog_posts_media_columns.sql
```

Or run the migration through your database client.

**⚠️ Warning:** This migration will drop existing media data. If you have existing posts, export them first.

### 2. Ensure Environment Variables

Make sure your `.env` file has the `BASE_URL` set:

```env
BASE_URL=http://localhost:8082
```

This is used to generate file URLs. If not set, it defaults to `http://localhost:8082`.

### 3. Restart the Server

After running the migration, restart your server:

```bash
cd poll_server
pnpm run dev
```

## API Changes

### POST /api/blogs/posts

**Request remains the same:**
- Content-Type: `multipart/form-data`
- Fields: `title`, `content`, `media` (array of files)
- Max 6 files total (3 images, 3 videos, 3 PDFs)

**Response:**
```json
{
  "message": "✅ Post Successifully Created"
}
```

### GET /api/blogs/posts/:id

**Response structure changed:**

Before (base64 encoded):
```json
{
  "images": ["data:image/jpeg;base64,/9j/4AAQ..."],
  "videos": ["data:video/mp4;base64,AAAAH..."],
  "pdfs": ["data:application/pdf;base64,JVB..."]
}
```

After (URLs):
```json
{
  "images": ["http://localhost:8082/uploads/blog-images/1735804800000-123456789.jpg"],
  "videos": ["http://localhost:8082/uploads/blog-videos/1735804800000-987654321.mp4"],
  "pdfs": ["http://localhost:8082/uploads/blog-pdfs/1735804800000-111222333.pdf"]
}
```

## Benefits

1. **Performance**: Database queries are faster without large binary data
2. **Scalability**: Files can be easily moved to CDN/cloud storage later
3. **Maintenance**: Easier to manage, backup, and serve files
4. **Storage**: More efficient disk usage and database size
5. **Caching**: Web servers can cache static files efficiently

## Notes

- Files are served as static content through the `/uploads` route
- Old base64 data responses are replaced with direct file URLs
- Frontend can directly use these URLs in `<img>`, `<video>`, and `<a>` tags
- File cleanup: Consider implementing a cleanup mechanism for deleted posts
