import { Request, Response, NextFunction } from "express";
import { auth } from "../lib/auth";
import pool from "../config-db";

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
 * Verifies session and attaches user to request
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

    // Query session from database
    const sessionResult = await pool.query(
      `SELECT s.id, s.user_id, s.expires_at, u.id as user_id, u.email, u.name, u.role
       FROM sessions s
       JOIN users u ON s.user_id = u.id
       WHERE s.id = $1 AND s.expires_at > NOW()`,
      [token]
    );

    if (sessionResult.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: "Invalid or expired session",
      });
    }

    const session = sessionResult.rows[0];

    // Attach user and session to request
    req.user = {
      id: session.user_id,
      email: session.email,
      name: session.name,
      role: session.role,
    };

    req.session = {
      id: session.id,
      userId: session.user_id,
      expiresAt: session.expires_at,
    };

    next();
  } catch (error) {
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
