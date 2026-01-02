import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";

const router = express.Router();

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, "../../uploads");
const imagesDir = path.join(uploadsDir, "images");
const audioDir = path.join(uploadsDir, "audio");

[uploadsDir, imagesDir, audioDir].forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Configure multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Determine type based on mimetype since body fields aren't available yet
    const isAudio = file.mimetype.startsWith("audio/") || 
                    file.mimetype === "video/webm" ||
                    file.mimetype === "application/octet-stream";
    const dir = isAudio ? audioDir : imagesDir;
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, `${uniqueSuffix}${ext}`);
  },
});

// File filter to validate file types
const fileFilter = (req: any, file: any, cb: any) => {
  // Accept both image and audio files
  if (file.mimetype.startsWith("image/")) {
    cb(null, true);
  } else if (
    file.mimetype.startsWith("audio/") ||
    file.mimetype === "video/webm" ||
    file.mimetype === "application/octet-stream"
  ) {
    cb(null, true);
  } else {
    cb(new Error("Only image and audio files are allowed"));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
});

// Upload endpoint
router.post("/", upload.single("file"), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    // Determine type based on mimetype
    const isAudio = req.file.mimetype.startsWith("audio/") || 
                    req.file.mimetype === "video/webm" ||
                    req.file.mimetype === "application/octet-stream";
    const type = isAudio ? "audio" : "images";
    
    // Return relative path - frontend will add baseURL
    const fileUrl = `/uploads/${type}/${req.file.filename}`;

    res.status(200).json({
      message: "File uploaded successfully",
      url: fileUrl,
      filename: req.file.filename,
      size: req.file.size,
      mimetype: req.file.mimetype,
    });
  } catch (error: any) {
    console.error("Upload error:", error);
    res.status(500).json({ message: error.message || "File upload failed" });
  }
});

// Optional: Delete uploaded file endpoint (for cleanup)
router.delete("/:type/:filename", (req, res) => {
  try {
    const { type, filename } = req.params;
    const dir = type === "audio" ? audioDir : imagesDir;
    const filePath = path.join(dir, filename);

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      res.json({ message: "File deleted successfully" });
    } else {
      res.status(404).json({ message: "File not found" });
    }
  } catch (error: any) {
    console.error("Delete error:", error);
    res.status(500).json({ message: error.message || "Failed to delete file" });
  }
});

export default router;
