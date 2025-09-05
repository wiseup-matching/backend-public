import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';

export interface JwtPayload {
  userId: string;
  email: string;
  userType: 'Retiree' | 'Startup';
  name: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export const getUserFromRequest = (req: Request): JwtPayload | undefined => {
  try {
    const cookies =
      req.cookies ??
      (req.headers.cookie
        ? req.headers.cookie.split(';').reduce<Record<string, string>>((acc, cookie) => {
            const [name, value] = cookie.split('=');
            acc[name] = decodeURIComponent(value);
            return acc;
          }, {})
        : {});
    const token = cookies.auth_token;
    if (!token) return undefined;
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as JwtPayload;
    // Validate required fields
    if (!decoded.userId || !decoded.userType) {
      throw new Error('Invalid token payload');
    }
    return decoded;
  } catch (err) {
    return undefined;
  }
};

// Basic Authentication
const authenticate = (req: Request, res: Response, next: NextFunction): void => {
  try {
    const user = getUserFromRequest(req);

    if (!user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    req.user = user;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
};

// User Type Check
const requireUserType = (allowedTypes: ('Retiree' | 'Startup')[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    if (!allowedTypes.includes(req.user.userType)) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }

    next();
  };
};

// Combined Middleware for Easy Usage
export const auth = {
  // Only Authentication
  required: authenticate,

  // Authentication + Retiree
  retiree: [authenticate, requireUserType(['Retiree'])],

  // Authentication + Startup
  startup: [authenticate, requireUserType(['Startup'])],

  // Authentication + Both Types
  both: [authenticate, requireUserType(['Retiree', 'Startup'])],
};

// Error Handler
export function notFound(req: Request, res: Response, next: NextFunction) {
  res.status(404);
  const error = new Error(`🔍 - Not Found - ${req.originalUrl}`);
  next(error);
}

export function errorHandler(err: Error, _: Request, res: Response, __: NextFunction) {
  const statusCode = res.statusCode !== 200 ? res.statusCode : 500;
  res.status(statusCode);
  res.json({
    message: err.message,
    stack: process.env.NODE_ENV === 'production' ? '<redacted>' : err.stack,
  });
}
