import { Router, Request, Response, NextFunction, RequestHandler } from 'express';
import { Role } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as FacebookStrategy } from 'passport-facebook';
import { protect } from '../middleware/auth.middleware';
import { getMe } from '../controllers/auth.controller';
import { AppError } from '../utils/AppError';
import { prisma } from '../lib/prisma';

const router = Router();

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://cbfsoko-bukavu.vercel.app';

// --- Configuration de Passport (Google OAuth) sécurisée ---
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(new GoogleStrategy({
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL || 'https://cbfsoko-backend.onrender.com/api/auth/google/callback'
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const email = profile.emails && profile.emails[0] ? profile.emails[0].value.trim().toLowerCase() : null;
        if (!email) {
          return done(new Error("Aucun email trouvé via le compte Google."), undefined);
        }

        let user = await prisma.user.findUnique({ where: { email } });

        if (!user) {
          let assignedRole: Role = Role.USER;
          if (email === 'benjaminkulimushi1@gmail.com') {
            assignedRole = Role.ADMIN;
          } else if (email === 'mambofelicien91@gmail.com') {
            assignedRole = 'ADMIN_FINANCE' as Role;
          }

          user = await prisma.user.create({
            data: {
              name: profile.displayName || 'Utilisateur Google',
              email: email,
              passwordHash: await bcrypt.hash(Math.random().toString(36), 12),
              role: assignedRole,
              avatar: profile.photos && profile.photos[0] ? profile.photos[0].value : null
            }
          });
        }
        return done(null, user);
      } catch (error) {
        return done(error, undefined);
      }
    }
  ));
}

// --- Configuration de Passport (Facebook OAuth) sécurisée ---
if (process.env.FACEBOOK_APP_ID && process.env.FACEBOOK_APP_SECRET) {
  passport.use(new FacebookStrategy({
      clientID: process.env.FACEBOOK_APP_ID,
      clientSecret: process.env.FACEBOOK_APP_SECRET,
      callbackURL: process.env.FACEBOOK_CALLBACK_URL || 'https://cbfsoko-backend.onrender.com/api/auth/facebook/callback',
      profileFields: ['id', 'displayName', 'emails', 'photos']
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const email = profile.emails && profile.emails[0] ? profile.emails[0].value.trim().toLowerCase() : `${profile.id}@facebook.tmp`;
        
        let user = await prisma.user.findUnique({ where: { email } });

        if (!user) {
          let assignedRole: Role = Role.USER;
          if (email === 'benjaminkulimushi1@gmail.com') {
            assignedRole = Role.ADMIN;
          } else if (email === 'mambofelicien91@gmail.com') {
            assignedRole = 'ADMIN_FINANCE' as Role;
          }

          user = await prisma.user.create({
            data: {
              name: profile.displayName || 'Utilisateur Facebook',
              email: email,
              passwordHash: await bcrypt.hash(Math.random().toString(36), 12),
              role: assignedRole,
              avatar: profile.photos && profile.photos[0] ? profile.photos[0].value : null
            }
          });
        }
        return done(null, user);
      } catch (error) {
        return done(error, undefined);
      }
    }
  ));
}

// --- Configuration de Multer pour stocker l'avatar dans public/uploads ---
const uploadDir = path.join(process.cwd(), 'public', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, 'avatar-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }
});

const register = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { name, email, password, phone } = req.body;

    if (!name || !email || !password || !phone) {
      return next(new AppError('Veuillez remplir tous les champs obligatoires, y compris le numéro de téléphone.', 400));
    }

    const normalizedEmail = email.trim().toLowerCase();
    const existingUser = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existingUser) {
      return next(new AppError('Cet email est déjà utilisé.', 400));
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    
    let assignedRole: Role = Role.USER;
    if (normalizedEmail === 'benjaminkulimushi1@gmail.com') {
      assignedRole = Role.ADMIN;
    } else if (normalizedEmail === 'mambofelicien91@gmail.com') {
      assignedRole = 'ADMIN_FINANCE' as Role;
    }

    const user = await prisma.user.create({
      data: {
        name: name.trim(),
        email: normalizedEmail,
        passwordHash: hashedPassword,
        phone: phone.trim(),
        role: assignedRole,
      },
    });

    const token = jwt.sign(
      { id: user.id, userId: user.id, role: user.role },
      process.env.JWT_SECRET || 'secret_default',
      { expiresIn: '7d' }
    );

    res.status(201).json({
      success: true,
      message: 'Inscription réussie',
      token,
      data: { id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role, avatar: user.avatar }
    });
  } catch (error) {
    next(error);
  }
};

const login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return next(new AppError('Veuillez fournir un email et un mot de passe.', 400));
    }

    const normalizedEmail = email.trim().toLowerCase();
    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (!user) {
      return next(new AppError('Email ou mot de passe incorrect.', 401));
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      return next(new AppError('Email ou mot de passe incorrect.', 401));
    }

    const token = jwt.sign(
      { id: user.id, userId: user.id, role: user.role },
      process.env.JWT_SECRET || 'secret_default',
      { expiresIn: '7d' }
    );

    res.status(200).json({
      success: true,
      message: 'Connexion réussie',
      token,
      data: { id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role, avatar: user.avatar }
    });
  } catch (error) {
    next(error);
  }
};

const updateProfileInline = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = (req as any).user?.id || (req as any).user?.userId;
    const { name, phone } = req.body;

    const updateData: any = {};
    if (name) updateData.name = name.trim();
    if (phone !== undefined) updateData.phone = phone ? phone.trim() : null;

    const uploadedFile = req.file || (req.files && (req.files as Express.Multer.File[])[0]);
    if (uploadedFile) {
      updateData.avatar = `/uploads/${uploadedFile.filename}`;
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        avatar: true,
      }
    });

    res.status(200).json({
      success: true,
      message: 'Profil mis à jour avec succès dans la base de données',
      data: updatedUser
    });
  } catch (error) {
    next(error);
  }
};

// --- Routes d'authentification classiques avec typage sécurisé ---
router.post('/register', register as unknown as RequestHandler);
router.post('/login', login as unknown as RequestHandler);
router.get('/me', protect as unknown as RequestHandler, getMe as unknown as RequestHandler);
router.put('/update-profile', protect as unknown as RequestHandler, upload.any(), updateProfileInline as unknown as RequestHandler);

// --- Route Google pour l'Application Mobile (POST) ---
router.post('/google', (async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { email, name, avatar } = req.body;

    if (!email) {
      return next(new AppError('Email non fourni par Google.', 400));
    }

    const normalizedEmail = email.trim().toLowerCase();
    let user = await prisma.user.findUnique({ where: { email: normalizedEmail } });

    if (!user) {
      let assignedRole: Role = Role.USER;
      if (normalizedEmail === 'benjaminkulimushi1@gmail.com') {
        assignedRole = Role.ADMIN;
      } else if (normalizedEmail === 'mambofelicien91@gmail.com') {
        assignedRole = 'ADMIN_FINANCE' as Role;
      }

      user = await prisma.user.create({
        data: {
          name: name ? name.trim() : 'Utilisateur Google',
          email: normalizedEmail,
          passwordHash: await bcrypt.hash(Math.random().toString(36), 12),
          role: assignedRole,
          avatar: avatar || null
        }
      });
    }

    const token = jwt.sign(
      { id: user.id, userId: user.id, role: user.role },
      process.env.JWT_SECRET || 'secret_default',
      { expiresIn: '7d' }
    );

    res.status(200).json({
      success: true,
      message: 'Connexion Google réussie',
      token,
      data: { id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role, avatar: user.avatar }
    });
  } catch (error) {
    next(error);
  }
}) as unknown as RequestHandler);

// --- Routes d'authentification Sociale (Google Web Redirection) ---
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'], session: false }));
router.get('/google/callback', 
  passport.authenticate('google', { session: false, failureRedirect: `${FRONTEND_URL}/login` }),
  ((req: any, res: Response) => {
    const user = req.user;
    const token = jwt.sign(
      { id: user.id, userId: user.id, role: user.role },
      process.env.JWT_SECRET || 'secret_default',
      { expiresIn: '7d' }
    );
    res.redirect(`${FRONTEND_URL}/login?token=${token}`);
  }) as unknown as RequestHandler
);

// --- Routes d'authentification Sociale (Facebook) ---
router.get('/facebook', passport.authenticate('facebook', { scope: ['email'], session: false }));
router.get('/facebook/callback', 
  passport.authenticate('facebook', { session: false, failureRedirect: `${FRONTEND_URL}/login` }),
  ((req: any, res: Response) => {
    const user = req.user;
    const token = jwt.sign(
      { id: user.id, userId: user.id, role: user.role },
      process.env.JWT_SECRET || 'secret_default',
      { expiresIn: '7d' }
    );
    res.redirect(`${FRONTEND_URL}/login?token=${token}`);
  }) as unknown as RequestHandler
);

export default router;