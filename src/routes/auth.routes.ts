import { Router, Request, Response, NextFunction } from 'express';
import { Role } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { protect } from '../middleware/auth.middleware';
import { getMe } from '../controllers/auth.controller';
import { AppError } from '../utils/AppError';
import { prisma } from '../lib/prisma';

const router = Router();

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
  limits: { fileSize: 5 * 1024 * 1024 } // Limite de 5 Mo par image
});

const register = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { name, email, password, phone } = req.body;

    if (!name || !email || !password) {
      return next(new AppError('Veuillez remplir tous les champs obligatoires.', 400));
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
        phone: phone ? phone.trim() : null,
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
      data: { id: user.id, name: user.name, email: user.email, role: user.role }
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
      data: { id: user.id, name: user.name, email: user.email, role: user.role, avatar: user.avatar }
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

    // Récupération sécurisée du fichier (qu'il s'appelle req.file ou qu'il soit dans req.files)
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

router.post('/register', register);
router.post('/login', login);
router.get('/me', protect, getMe);

// Utilisation de upload.any() pour accepter n'importe quel nom de champ d'image envoyé par le frontend (évite les erreurs 500)
router.put('/update-profile', protect, upload.any(), updateProfileInline);

export default router;