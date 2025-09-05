import express from 'express';
import type { Request, Response } from 'express';
import { sendMagicLinkEmail, setTokenStore } from '../../services/mailer.js';
import { Retiree, Startup, User, UserDoc } from '../../db/schema.js';
import jwt from 'jsonwebtoken';
import type { Document } from 'mongoose';
import crypto from 'crypto';
import { auth } from '../../middlewares.js';

interface IUser extends Document {
  _id: string;
  email: string;
  name?: string;
  nameFirst?: string;
  nameLast?: string;
  title?: string;
  contactPersonNameLast?: string;
  contactPersonNameFirst?: string;
  userType: string;
}

const router = express.Router();

// In-memory store for temporary tokens
const tokenStore = new Map<string, { email: string; expiresAt: Date }>();

// Share the tokenStore with mailer service
setTokenStore(tokenStore);

// Helper function to clear all cookies
const clearAllCookies = (req: Request, res: Response) => {
  const cookies = req.cookies;
  for (const cookie in cookies) {
    res.clearCookie(cookie, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
      path: '/',
    });
  }
};

// Helper function to create JWT token
const createJwtToken = (user: IUser, userType: string) => {
  if (!process.env.JWT_SECRET) throw Error('JWT_SECRET env not set.');
  return jwt.sign(
    {
      userId: user._id,
      email: user.email,
      userType: userType,
      name: user.name ?? user.title ?? user.contactPersonNameLast ?? user.contactPersonNameFirst,
    },
    process.env.JWT_SECRET,
    { expiresIn: '7d' },
  );
};

// Helper function to set auth cookie
const setAuthCookie = (res: Response, token: string) => {
  res.cookie('auth_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  });
};

// Helper function to cleanup expired tokens
const cleanupExpiredTokens = () => {
  for (const [storedToken, data] of tokenStore.entries()) {
    if (data.expiresAt < new Date()) {
      tokenStore.delete(storedToken);
    }
  }
};

// Helper function to create magic link token
const createMagicLinkToken = (email: string) => {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
  tokenStore.set(token, { email, expiresAt });
  cleanupExpiredTokens();
  return token;
};

// Helper function to create user based on userType
const createUser = async (
  email: string,
  userType: string,
): Promise<{ user: IUser; actualUserType: string }> => {
  if ((userType as string).toLowerCase() === 'retiree') {
    const newRetiree = await Retiree.create({
      email,
      nameFirst: '',
      nameLast: '',
      status: 'atcapacity',
      hasCompletedTutorial: false,
    });
    return { user: newRetiree as unknown as IUser, actualUserType: 'Retiree' };
  } else if ((userType as string).toLowerCase() === 'startup') {
    const newStartup = await Startup.create({
      email,
      title: '',
    });
    return { user: newStartup as unknown as IUser, actualUserType: 'Startup' };
  } else {
    throw new Error('Unknown userType');
  }
};

// Helper function to check if we're in development mode
const isDevelopmentMode = (email: string) => {
  return process.env.NODE_ENV !== 'production' || email.includes('@example.com');
};

// Helper function to check if user has empty data
const hasEmptyData = (user: IUser, userType: string): boolean => {
  if (userType === 'Retiree') {
    return !(
      user.nameFirst &&
      user.nameFirst.trim() !== '' &&
      user.nameLast &&
      user.nameLast.trim() !== ''
    );
  } else {
    return !(user.title && user.title.trim() !== '');
  }
};

// POST /login
router.post('/login', async (req: Request, res: Response) => {
  // same logic as /magiclink
  const { email, userType } = req.body;
  if (!email) {
    res.status(400).json({ error: 'Email required' });
    return;
  }
  try {
    const existingUser: UserDoc | null = await User.findOne({ email });
    const isRegistration = !existingUser;
    clearAllCookies(req, res);
    if (!userType) {
      if (!existingUser) {
        res.status(404).json({
          error: 'User not found',
          redirectToSignup: true,
          message: 'This email is not registered. Please sign up first.',
        });
        return;
      }
      const existingUserType = existingUser.userType;
      if (isDevelopmentMode(email)) {
        const user = existingUser as unknown as IUser;
        const jwtToken = createJwtToken(user, existingUserType);
        setAuthCookie(res, jwtToken);
        await new Promise((resolve) => setTimeout(resolve, 50));

        res.json({
          message: 'Development mode: Direct authentication successful',
          redirect: true,
          userType: existingUserType,
          hasEmptyData: hasEmptyData(user, existingUserType),
        });
        return;
      } else {
        const token = createMagicLinkToken(email);
        await sendMagicLinkEmail(email, token, existingUserType, false);
        res.json({ message: 'Magic link sent' });
        return;
      }
    }
    if (isDevelopmentMode(email)) {
      let user: IUser;
      let actualUserType: string;
      if (existingUser) {
        user = existingUser as unknown as IUser;
        actualUserType = existingUser.userType;
      } else {
        try {
          const { user: newUser, actualUserType: newUserType } = await createUser(
            email,
            userType as string,
          );
          user = newUser;
          actualUserType = newUserType;
        } catch (error) {
          res.status(400).json({ error: 'Unknown userType' });
          return;
        }
      }
      const jwtToken = createJwtToken(user, actualUserType);
      setAuthCookie(res, jwtToken);
      await new Promise((resolve) => setTimeout(resolve, 50));
      res.json({
        message: 'Development mode: Direct authentication successful',
        redirect: true,
        userType: actualUserType,
        hasEmptyData: hasEmptyData(user, actualUserType),
      });
    } else {
      const token = createMagicLinkToken(email);
      const tokenUserType = existingUser ? existingUser.userType : userType;
      await sendMagicLinkEmail(email, token, tokenUserType, isRegistration);
      res.json({ message: 'Magic link sent' });
    }
  } catch (err) {
    console.error('Magic link error:', err);
    res.status(500).json({ error: 'Failed to process authentication request' });
  }
});

// POST /register - Initial registration endpoint
router.post('/register', async (req: Request, res: Response) => {
  const { email, userType } = req.body;
  if (!email || !userType) {
    res.status(400).json({ error: 'Email and userType required' });
    return;
  }
  try {
    const existingUser: UserDoc | null = await User.findOne({ email });

    // If user already exists, return error
    if (existingUser) {
      res.status(409).json({
        error: 'User already exists',
        message: 'This email is already registered. Please login instead.',
      });
      return;
    }

    clearAllCookies(req, res);

    // Create new user based on userType
    let user: IUser;
    let actualUserType: string;

    try {
      const { user: newUser, actualUserType: newUserType } = await createUser(
        email,
        userType as string,
      );
      user = newUser;
      actualUserType = newUserType;
    } catch (error) {
      res.status(400).json({ error: 'Unknown userType' });
      return;
    }

    if (isDevelopmentMode(email)) {
      // Development mode: Direct authentication
      const jwtToken = createJwtToken(user, actualUserType);
      setAuthCookie(res, jwtToken);

      await new Promise((resolve) => setTimeout(resolve, 50));

      res.json({
        message: 'Development mode: Direct authentication successful',
        redirect: true,
        userType: actualUserType,
        hasEmptyData: true, // New users always have empty data
      });
    } else {
      // Production mode: Send magic link
      const token = createMagicLinkToken(email);
      await sendMagicLinkEmail(email, token, actualUserType as 'Retiree' | 'Startup', true); // isRegistration = true
      res.json({ message: 'Magic link sent' });
    }
  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).json({ error: 'Failed to process registration request' });
  }
});

// POST /verify-magiclink
router.get('/verify-magiclink', async (req: Request, res: Response) => {
  const { token, userType, strict, redirect } = req.query;
  if (!token || typeof token !== 'string' || !userType) {
    res.status(400).json({ error: 'Token and userType required' });
    return;
  }
  try {
    clearAllCookies(req, res);
    const data = tokenStore.get(token as string);
    if (!data) {
      throw new Error('Invalid or used token');
    }
    if (data.expiresAt < new Date()) {
      tokenStore.delete(token as string);
      throw new Error('Token expired');
    }
    const email = data.email;
    tokenStore.delete(token as string);
    const existingUser: UserDoc | null = await User.findOne({ email });
    let user: IUser;
    let actualUserType: string;
    if (existingUser) {
      if (strict === 'true') {
        throw new Error(
          `Email ${email} is already registered. Please use a different email or login with your existing account.`,
        );
      }
      user = existingUser as unknown as IUser;
      actualUserType = existingUser.userType;
    } else {
      if ((userType as string).toLowerCase() === 'auto') {
        // For notification magic links, use the existing user's type
        if (!existingUser) {
          res.status(400).json({ error: 'User not found for auto login' });
          return;
        }
        user = existingUser as unknown as IUser;
        actualUserType = (existingUser as any).userType;
      } else {
        try {
          const { user: newUser, actualUserType: newUserType } = await createUser(
            email,
            userType as string,
          );
          user = newUser;
          actualUserType = newUserType;
        } catch (error) {
          res.status(400).json({ error: 'Unknown userType' });
          return;
        }
      }
    }
    const jwtToken = createJwtToken(user, actualUserType);
    setAuthCookie(res, jwtToken);
    await new Promise((resolve) => setTimeout(resolve, 50));

    if (process.env.NODE_ENV === 'production') {
      let redirectPath = '/';

      // If a specific redirect URL is provided, use it
      if (redirect && typeof redirect === 'string') {
        redirectPath = decodeURIComponent(redirect);
      } else {
        // Check if this is a new user (registration) or existing user (login)
        if (!existingUser) {
          // For new users (registration), redirect to profile/edit pages
          if (actualUserType === 'Retiree') {
            redirectPath = '/retiree/profile/edit';
          } else if (actualUserType === 'Startup') {
            redirectPath = '/startup/profile/edit';
          }
        } else {
          // For existing users (login), redirect to browse pages
          if (actualUserType === 'Retiree') {
            redirectPath = '/retiree/browse-jobs';
          } else if (actualUserType === 'Startup') {
            redirectPath = '/startup/browse-retirees';
          }
        }
      }

      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
      res.redirect(frontendUrl + redirectPath);
    } else {
      res.json({
        success: true,
        user: {
          id: user._id,
          email: user.email,
          userType: actualUserType,
          name:
            user.name ?? user.title ?? user.contactPersonNameLast ?? user.contactPersonNameFirst,
        },
      });
    }
  } catch (err) {
    // Always redirect to login page with error parameter
    const errorMessage = encodeURIComponent((err as Error).message || 'Invalid or expired token');
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    res.redirect(`${frontendUrl}/login?error=${errorMessage}`);
  }
});

router.get('/me', auth.required, (req: Request, res: Response) => {
  if (!req.user) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }
  res.json({
    success: true,
    user: {
      id: req.user.userId,
      email: req.user.email,
      userType: req.user.userType,
      name: req.user.name,
    },
  });
});

router.post('/logout', (req: Request, res: Response) => {
  clearAllCookies(req, res);
  res.json({ success: true });
});

export default router;
