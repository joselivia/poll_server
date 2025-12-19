import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import pool from "../config-db";

// JWT Secret - should match the one in routes/auth.ts
const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-this-in-production";

export interface AuthRequest extends Request {
  user?: {
    id: number;
    email: string;
    name: string;
    role: "admin" | "enumerator" | "client";
  };
  session?: {
    id: string;
    userId: number;
    expiresAt: Date;
  };
}

/**
 * Base authentication middleware
 * Verifies JWT token and attaches user to request
 */
export const authenticate = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "No authorization token provided",
      });
    }

    const token = authHeader.substring(7); // Remove "Bearer " prefix

    // Verify JWT token
    const decoded = jwt.verify(token, JWT_SECRET) as {
      userId: number;
      email: string;
      name: string;
      role: "admin" | "enumerator" | "client";
      iat: number;
      exp: number;
    };

    // Optionally fetch fresh user data from database
    const userResult = await pool.query(
      `SELECT id, email, name, role FROM users WHERE id = $1`,
      [decoded.userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: "User not found",
      });
    }

    const user = userResult.rows[0];

    // Attach user to request
    req.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    };

    req.session = {
      id: token,
      userId: user.id,
      expiresAt: new Date(decoded.exp * 1000),
    };

    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      return res.status(401).json({
        success: false,
        message: "Invalid token",
      });
    }
    if (error instanceof jwt.TokenExpiredError) {
      return res.status(401).json({
        success: false,
        message: "Token expired",
      });
    }
    console.error("Authentication error:", error);
    return res.status(500).json({
      success: false,
      message: "Authentication failed",
    });
  }
};

/**
 * Middleware to restrict access to admin users only
 */
export const requireAdmin = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  await authenticate(req, res, () => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    if (req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Access denied. Admin privileges required.",
      });
    }

    next();
  });
};

/**
 * Middleware to restrict access to enumerator users (or higher)
 */
export const requireEnumerator = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  await authenticate(req, res, () => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    if (req.user.role !== "admin" && req.user.role !== "enumerator") {
      return res.status(403).json({
        success: false,
        message: "Access denied. Enumerator privileges required.",
      });
    }

    next();
  });
};

/**
 * Middleware to restrict access to authenticated clients (any authenticated user)
 */
export const requireClient = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  await authenticate(req, res, next);
};

/**
 * Middleware factory to allow specific roles
 * Usage: requireRole(['admin', 'enumerator'])
 */
export const requireRole = (allowedRoles: Array<"admin" | "enumerator" | "client">) => {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    await authenticate(req, res, () => {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: "Authentication required",
        });
      }

      if (!allowedRoles.includes(req.user.role)) {
        return res.status(403).json({
          success: false,
          message: `Access denied. Required roles: ${allowedRoles.join(", ")}`,
        });
      }

      next();
    });
  };
};
