import express from "express";
import cors from "cors";
import path from "path";
import pollRoutes from "./routes/polls";
import postRoutes from "./routes/posts";
import pool from "./config-db";
import aspirant from "./routes/aspirants";
import dotenv from "dotenv";
import votes from "./routes/votes";
import updateAdmin from "./routes/update-admin";
import comments from "./routes/comments";
import liveVotes from "./routes/votehistory";
import opinionsPolls from "./routes/opinion_poll";
import authRoutes from "./routes/auth";
import uploadRoutes from "./routes/upload";
import surveyRequestRoutes from "./routes/survey-requests";

dotenv.config();

const app = express();
app.set('trust proxy', 1);

// CORS configuration - only allow requests from politrack.africa domain
const corsOptions = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    // Allow requests from politrack.africa and its subdomains
    const allowedOrigins = [
      'https://politrack.africa',
      'https://www.politrack.africa',
      'http://politrack.africa',
      'http://www.politrack.africa'
    ];
    
    // SECURITY: Log a warning for requests without origin header (bots, curl, etc.)
    if (!origin) {
      console.warn('⚠️ Warning: Origin header is missing.');
      callback(null, false); // Reject the request without throwing an error
      return;
    }
    
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Bot detection middleware - allow crawlers for GET, block for voting/mutations
app.use((req, res, next) => {
  const userAgent = req.headers['user-agent'] || '';
  const origin = req.headers['origin'];
  const referer = req.headers['referer'];
  
  // Only block bots on state-changing requests (POST/PUT/DELETE/PATCH)
  // Allow bots to crawl and index content via GET requests
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
    // Block requests with bot-like user agents from making changes
    const botPatterns = /curl|wget|python-requests|postman|insomnia/i;
    if (botPatterns.test(userAgent)) {
      console.warn(`🚫 Bot blocked from ${req.method}: ${userAgent} from IP ${req.headers['cf-connecting-ip'] || req.ip}`);
      return res.status(403).json({ message: 'Automated requests are not allowed' });
    }
    
    // Require origin or referer from legitimate domain for state-changing requests
    const legitimateDomains = ['politrack.africa', 'www.politrack.africa'];
    const hasLegitOrigin = origin && legitimateDomains.some(domain => origin.includes(domain));
    const hasLegitReferer = referer && legitimateDomains.some(domain => referer.includes(domain));
    
    if (!hasLegitOrigin && !hasLegitReferer) {
      console.warn(`🚫 Request blocked - no valid origin/referer from IP ${req.headers['cf-connecting-ip'] || req.ip}`);
      return res.status(403).json({ message: 'Invalid request origin' });
    }
  }

  
  next();
});

const port = process.env.PORT || 8082;

// Serve uploaded files statically
app.use("/api/uploads", express.static(path.join(__dirname, "../uploads")));

app.use("/api/polls", pollRoutes);
app.use("/api/blogs", postRoutes);
app.use("/api/aspirant", aspirant);
app.use("/api/votes", votes);
app.use("/api/update-admin", updateAdmin);
app.use("/api/comments", comments);
app.use("/api/live-votes", liveVotes);
app.use("/api/Opinions", opinionsPolls);
app.use("/api/auth", authRoutes);
app.use("/api/upload", uploadRoutes);
app.use("/api/survey-requests", surveyRequestRoutes);

pool.query("SELECT NOW()", (err, res) => {
  if (err) {
    console.error("❌ Database connection failed:", err);
  } else {
    console.log("✅ Database connected successfully:", res.rows[0].now);
  }
});
app.use((err: any, req: any, res: any, next: any) => {
  console.error("🔥 GLOBAL ERROR CAUGHT:", err.message);
  console.error(err.stack);

  res.status(500).json({
    success: false,
    message: "Internal Server Error",
    error: err.message,
  });
});
app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
});
