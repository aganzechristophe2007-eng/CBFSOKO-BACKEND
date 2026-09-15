import { Router, Request, Response, NextFunction, RequestHandler } from 'express';
import { Role } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as FacebookStrategy } from 'passport-facebook';
import { protect } from '../middleware/auth.middleware';
import { getMe } from '../controllers/auth.controller';
import { AppError } from '../utils/AppError';
import { prisma } from '../lib/prisma';

const router = Router();

// Validation stricte du secret JWT en production
const getJwtSecret = (): string => {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret === 'secret_default') {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('FATAL: JWT_SECRET non défini ou insécurisé en environnement de production.');
    }
    return 'dev_only_jwt_secret_change_in_production_32bytes';
  }
  return secret;
};

const JWT_SECRET = getJwtSecret();
const FRONTEND_URL = (process.env.FRONTEND_URL || 'https://cbfsoko-bukavu.vercel.app').replace(/\/$/, '');

// Attributs utilisateurs sécurisés à renvoyer au client
const USER_SAFE_SELECT = {
  id: true,
  name: true,
  email: true,
  phone: true,
  role: true,
  avatar: true,
  createdAt: true,
} as const;

// Utilitaire d'attribution dynamique et sécurisée des rôles
const determineRoleByEmail = (email: string): Role => {
  const normalized = email.toLowerCase().trim();
  if (normalized === 'benjaminkulimushi1@gmail.com') return Role.ADMIN;
  if (normalized === 'mambofelicien91@gmail.com' && 'ADMIN_FINANCE' in Role) {
    return (Role as Record<string, Role>)['ADMIN_FINANCE'];
  }
  return Role.USER;
};

// --- Configuration Passport (Google OAuth) ---
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: process.env.GOOGLE_CALLBACK_URL || 'https://cbfsoko-backend.onrender.com/api/auth/google/callback',
      },
      async (_accessToken, _refreshToken, profile, done) => {
        try {
          const rawEmail = profile.emails && profile.emails[0] ? profile.emails[0].value : null;
          if (!rawEmail) {
            return done(new AppError('Aucun email valide associé à ce compte Google.', 400), undefined);
          }

          const email = rawEmail.trim().toLowerCase();
          const avatarUrl = profile.photos && profile.photos[0] ? profile.photos[0].value : null;

          let user = await prisma.user.findUnique({ where: { email } });

          if (!user) {
            // Mot de passe aléatoire cryptographiquement fort pour les comptes OAuth
            const randomPassword = crypto.randomBytes(32).toString('hex');
            const hashedPassword = await bcrypt.hash(randomPassword, 12);
            const assignedRole = determineRoleByEmail(email);

            user = await prisma.user.create({
              data: {
                name: profile.displayName ? profile.displayName.trim() : 'Utilisateur Google',
                email,
                passwordHash: hashedPassword,
                role: assignedRole,
                avatar: avatarUrl,
              },
            });
          } else if (avatarUrl && !user.avatar) {
            user = await prisma.user.update({
              where: { id: user.id },
              data: { avatar: avatarUrl },
            });
          }

          return done(null, user);
        } catch (error) {
          return done(error as Error, undefined);
        }
      }
    )
  );
}

// --- Configuration Passport (Facebook OAuth) ---
if (process.env.FACEBOOK_APP_ID && process.env.FACEBOOK_APP_SECRET) {
  passport.use(
    new FacebookStrategy(
      {
        clientID: process.env.FACEBOOK_APP_ID,
        clientSecret: process.env.FACEBOOK_APP_SECRET,
        callbackURL: process.env.FACEBOOK_CALLBACK_URL || 'https://cbfsoko-backend.onrender.com/api/auth/facebook/callback',
        profileFields: ['id', 'displayName', 'emails', 'photos'],
      },
      async (_accessToken, _refreshToken, profile, done) => {
        try {
          const rawEmail = profile.emails && profile.emails[0] ? profile.emails[0].value : `${profile.id}@facebook.tmp`;
          const email = rawEmail.trim().toLowerCase();
          const avatarUrl = profile.photos && profile.photos[0] ? profile.photos[0].value : null;

          let user = await prisma.user.findUnique({ where: { email } });

          if (!user) {
            const randomPassword = crypto.randomBytes(32).toString('hex');
            const hashedPassword = await bcrypt.hash(randomPassword, 12);
            const assignedRole = determineRoleByEmail(email);

            user = await prisma.user.create({
              data: {
                name: profile.displayName ? profile.displayName.trim() : 'Utilisateur Facebook',
                email,
                passwordHash: hashedPassword,
                role: assignedRole,
                avatar: avatarUrl,
              },
            });
          }

          return done(null, user);
        } catch (error) {
          return done(error as Error, undefined);
        }
      }
    )
  );
}

// --- Stockage Fichiers / Multer Sécurisé ---
const uploadDir = path.join(process.cwd(), 'public', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = crypto.randomBytes(16).toString('hex');
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `avatar-${Date.now()}-${uniqueSuffix}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // Max 5Mo
  fileFilter: (_req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (extname && mimetype) {
      return cb(null, true);
    }
    cb(new AppError('Format de fichier non supporté. Utiliser JPG, PNG ou WEBP.', 400));
  },
});

// --- Contrôleurs ---

const register = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { name, email, password, phone } = req.body;

    if (!name || !email || !password || !phone) {
      return next(new AppError('Tous les champs (nom, email, mot de passe, téléphone) sont requis.', 400));
    }

    if (typeof password !== 'string' || password.length < 8) {
      return next(new AppError('Le mot de passe doit contenir au moins 8 caractères.', 400));
    }

    const normalizedEmail = email.trim().toLowerCase();

    const existingUser = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existingUser) {
      return next(new AppError('Un compte associé à cette adresse existe déjà.', 400));
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const assignedRole = determineRoleByEmail(normalizedEmail);

    const user = await prisma.user.create({
      data: {
        name: name.trim(),
        email: normalizedEmail,
        passwordHash: hashedPassword,
        phone: phone.trim(),
        role: assignedRole,
      },
      select: USER_SAFE_SELECT,
    });

    const token = jwt.sign(
      { id: user.id, userId: user.id, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      success: true,
      message: 'Inscription réussie',
      token,
      data: user,
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

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return next(new AppError('Identifiants incorrects.', 401));
    }

    const token = jwt.sign(
      { id: user.id, userId: user.id, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    const safeUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      avatar: user.avatar,
    };

    res.status(200).json({
      success: true,
      message: 'Connexion réussie',
      token,
      data: safeUser,
    });
  } catch (error) {
    next(error);
  }
};

const updateProfileInline = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = (req as any).user?.id || (req as any).user?.userId;
    if (!userId) {
      return next(new AppError('Utilisateur non authentifié.', 401));
    }

    const { name, phone } = req.body;
    const updateData: Record<string, any> = {};

    if (name && typeof name === 'string') updateData.name = name.trim();
    if (phone !== undefined) updateData.phone = typeof phone === 'string' && phone.trim() !== '' ? phone.trim() : null;

    const uploadedFile = req.file || (req.files && (req.files as Express.Multer.File[])[0]);
    if (uploadedFile) {
      updateData.avatar = `/uploads/${uploadedFile.filename}`;
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: USER_SAFE_SELECT,
    });

    res.status(200).json({
      success: true,
      message: 'Profil mis à jour avec succès',
      data: updatedUser,
    });
  } catch (error) {
    next(error);
  }
};

// --- Déclaration des Routes ---

router.post('/register', register as unknown as RequestHandler);
router.post('/login', login as unknown as RequestHandler);
router.get('/me', protect as unknown as RequestHandler, getMe as unknown as RequestHandler);
router.put('/update-profile', protect as unknown as RequestHandler, upload.single('avatar'), updateProfileInline as unknown as RequestHandler);

// --- Callbacks OAuth Google ---
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'], session: false }));
router.get(
  '/google/callback',
  passport.authenticate('google', { session: false, failureRedirect: `${FRONTEND_URL}/login?error=auth_failed` }),
  ((req: any, res: Response) => {
    const user = req.user;
    const token = jwt.sign({ id: user.id, userId: user.id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
    const userData = encodeURIComponent(JSON.stringify({ id: user.id, name: user.name, email: user.email, role: user.role }));
    res.redirect(`${FRONTEND_URL}/login?token=${token}&user=${userData}`);
  }) as unknown as RequestHandler
);

// --- Callbacks OAuth Facebook ---
router.get('/facebook', passport.authenticate('facebook', { scope: ['email'], session: false }));
router.get(
  '/facebook/callback',
  passport.authenticate('facebook', { session: false, failureRedirect: `${FRONTEND_URL}/login?error=auth_failed` }),
  ((req: any, res: Response) => {
    const user = req.user;
    const token = jwt.sign({ id: user.id, userId: user.id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
    const userData = encodeURIComponent(JSON.stringify({ id: user.id, name: user.name, email: user.email, role: user.role }));
    res.redirect(`${FRONTEND_URL}/login?token=${token}&user=${userData}`);
  }) as unknown as RequestHandler
);

export default router;