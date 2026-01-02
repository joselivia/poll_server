import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import pool from '../config-db';

const router = express.Router();

// Create uploads directories if they don't exist
const uploadsDir = path.join(__dirname, "../../uploads");
const blogImagesDir = path.join(uploadsDir, "blog-images");
const blogVideosDir = path.join(uploadsDir, "blog-videos");
const blogPdfsDir = path.join(uploadsDir, "blog-pdfs");

[uploadsDir, blogImagesDir, blogVideosDir, blogPdfsDir].forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Configure multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    let dir = blogImagesDir;
    if (file.mimetype.startsWith('video/')) {
      dir = blogVideosDir;
    } else if (file.mimetype === 'application/pdf') {
      dir = blogPdfsDir;
    }
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, `${uniqueSuffix}${ext}`);
  },
});

const fileFilter = (_req: any, file: Express.Multer.File, cb: any) => {
  const allowedTypes = /jpeg|jpg|png|gif|mp4|webm|avi|mov|pdf/;
  const isValid = allowedTypes.test(file.mimetype);
  cb(null, isValid);
};

const upload = multer({ 
  storage,
  limits: { files: 50, fileSize: 50 * 1024 * 1024 }, // 50MB per file, 50 files max
  fileFilter 
});

// Helper function to delete a file from filesystem
const deleteFileFromUrl = (fileUrl: string) => {
  try {
    // Extract the filename from URL
    const urlParts = fileUrl.split('/uploads/');
    if (urlParts.length < 2) return;
    
    const relativePath = urlParts[1];
    const filePath = path.join(uploadsDir, relativePath);
    
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`✅ Deleted file: ${filePath}`);
    }
  } catch (error) {
    console.error(`❌ Failed to delete file ${fileUrl}:`, error);
  }
};

const posts: {
  id: number;
  title: string;
  content: string;
  images: string[];
  created_at: string;
}[] = [];

router.post('/posts', upload.array('media', 50), async (req, res) => {
  try {
    const { title, content } = req.body;
    const files = req.files as Express.Multer.File[];
    
    const imageUrls: string[] = [];
    const videoUrls: string[] = [];
    const pdfUrls: string[] = [];

    // Store relative paths only - frontend will add baseURL
    files.forEach((file) => {
      if (file.mimetype.startsWith('image/')) {
        const relativePath = `/uploads/blog-images/${file.filename}`;
        imageUrls.push(relativePath);
      } else if (file.mimetype.startsWith('video/')) {
        const relativePath = `/uploads/blog-videos/${file.filename}`;
        videoUrls.push(relativePath);
      } else if (file.mimetype === 'application/pdf') {
        const relativePath = `/uploads/blog-pdfs/${file.filename}`;
        pdfUrls.push(relativePath);
      }
    });

    await pool.query(
      `INSERT INTO blog_posts (title, content, image_data, video_data, pdf_data, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        title, 
        content, 
        imageUrls.length > 0 ? JSON.stringify(imageUrls) : null,
        videoUrls.length > 0 ? JSON.stringify(videoUrls) : null,
        pdfUrls.length > 0 ? JSON.stringify(pdfUrls) : null,
        new Date()
      ]
    );

    res.status(200).json({ message: '✅ Post Successifully Created' });
  } catch (error) {
    console.error('❌ Post creation failed:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

router.get('/posts', async (req, res) => {
  try {
    const limit = Number(req.query.limit) || 10;
    const offset = Number(req.query.offset) || 0;

    const result = await pool.query(
      `SELECT id, title, content, image_data, video_data, pdf_data, created_at FROM blog_posts ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    const posts = result.rows.map(post => ({
      id: post.id,
      title: post.title,
      content: post.content,
      created_at: post.created_at,
      images: Array.isArray(post.image_data) ? post.image_data : [],
      videos: Array.isArray(post.video_data) ? post.video_data : [],
      pdfs: Array.isArray(post.pdf_data) ? post.pdf_data : [],
    }));

    const { rows } = await pool.query("SELECT MAX(created_at) as last_updated FROM blog_posts");
    const lastUpdated = rows[0].last_updated || new Date();

    res.json({ posts, lastUpdated });
  } catch (error) {
    console.error("❌ Failed to fetch posts:", error);
    res.status(500).json({ error: "Failed to fetch posts" });
  }
});

router.get('/posts/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `SELECT id, title, content, image_data, video_data, pdf_data, created_at 
       FROM blog_posts WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Post not found" });
    }

    const post = result.rows[0];

    // JSONB returns already parsed arrays, no need to JSON.parse
    const images: string[] = Array.isArray(post.image_data) ? post.image_data : [];
    const videos: string[] = Array.isArray(post.video_data) ? post.video_data : [];
    const pdfs: string[] = Array.isArray(post.pdf_data) ? post.pdf_data : [];

    return res.json({
      id: post.id,
      title: post.title,
      content: post.content,
      created_at: post.created_at,
      images,
      videos,
      pdfs,
    });
  } catch (error) {
    console.error("❌ Failed to fetch post details:", error);
    return res.status(500).json({ error: "Failed to fetch post details" });
  }
});

router.put('/posts/:id', upload.array('media', 50), async (req, res) => {
  try {
    const { id } = req.params;
    const { title, content, existingImages, existingVideos, existingPdfs } = req.body;
    const files = req.files as Express.Multer.File[];

    // Fetch current post data to identify removed files
    const currentPost = await pool.query(
      `SELECT image_data, video_data, pdf_data FROM blog_posts WHERE id = $1`,
      [id]
    );

    if (currentPost.rows.length === 0) {
      return res.status(404).json({ error: "Post not found" });
    }

    const oldImages: string[] = Array.isArray(currentPost.rows[0].image_data) ? currentPost.rows[0].image_data : [];
    const oldVideos: string[] = Array.isArray(currentPost.rows[0].video_data) ? currentPost.rows[0].video_data : [];
    const oldPdfs: string[] = Array.isArray(currentPost.rows[0].pdf_data) ? currentPost.rows[0].pdf_data : [];
    
    // Parse existing media URLs from request
    const currentImages: string[] = existingImages ? JSON.parse(existingImages) : [];
    const currentVideos: string[] = existingVideos ? JSON.parse(existingVideos) : [];
    const currentPdfs: string[] = existingPdfs ? JSON.parse(existingPdfs) : [];

    // Find and delete removed files
    const removedImages = oldImages.filter(img => !currentImages.includes(img));
    const removedVideos = oldVideos.filter(vid => !currentVideos.includes(vid));
    const removedPdfs = oldPdfs.filter(pdf => !currentPdfs.includes(pdf));

    [...removedImages, ...removedVideos, ...removedPdfs].forEach(deleteFileFromUrl);

    // Add newly uploaded files without limits - store relative paths only
    files.forEach((file) => {
      if (file.mimetype.startsWith('image/')) {
        const relativePath = `/uploads/blog-images/${file.filename}`;
        currentImages.push(relativePath);
      } else if (file.mimetype.startsWith('video/')) {
        const relativePath = `/uploads/blog-videos/${file.filename}`;
        currentVideos.push(relativePath);
      } else if (file.mimetype === 'application/pdf') {
        const relativePath = `/uploads/blog-pdfs/${file.filename}`;
        currentPdfs.push(relativePath);
      }
    });

    await pool.query(
      `UPDATE blog_posts 
       SET title = $1, content = $2, image_data = $3, video_data = $4, pdf_data = $5
       WHERE id = $6`,
      [
        title, 
        content, 
        currentImages.length > 0 ? JSON.stringify(currentImages) : null,
        currentVideos.length > 0 ? JSON.stringify(currentVideos) : null,
        currentPdfs.length > 0 ? JSON.stringify(currentPdfs) : null,
        id
      ]
    );

    res.status(200).json({ message: '✅ Post Updated Successfully' });
  } catch (error) {
    console.error('❌ Post update failed:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

router.delete('/posts/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Fetch post data to get all media files
    const result = await pool.query(
      `SELECT image_data, video_data, pdf_data FROM blog_posts WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Post not found" });
    }

    const post = result.rows[0];
    const images: string[] = Array.isArray(post.image_data) ? post.image_data : [];
    const videos: string[] = Array.isArray(post.video_data) ? post.video_data : [];
    const pdfs: string[] = Array.isArray(post.pdf_data) ? post.pdf_data : [];

    // Delete all media files
    [...images, ...videos, ...pdfs].forEach(deleteFileFromUrl);

    // Delete post from database
    await pool.query(`DELETE FROM blog_posts WHERE id = $1`, [id]);

    res.status(200).json({ message: '✅ Post and all associated files deleted successfully' });
  } catch (error) {
    console.error('❌ Post deletion failed:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

export default router;   