import { Request, Response, NextFunction } from 'express';
import { Role } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { AppError } from '../utils/AppError';
import { prisma } from '../lib/prisma';

// Inscription d'un nouvel utilisateur
export const register = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { name, email, password, phone } = req.body;

    if (!email || !password || !name) {
      return next(new AppError('Veuillez remplir tous les champs obligatoires.', 400));
    }

    const normalizedEmail = email.trim().toLowerCase();

    const existingUser = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existingUser) {
      return next(new AppError('Cet email est déjà utilisé.', 400));
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: {
        name: name.trim(),
        email: normalizedEmail,
        passwordHash,
        phone: phone ? phone.trim() : null,
        role: Role.USER,
      },
    });

    res.status(201).json({
      success: true,
      message: 'Inscription réussie',
      data: { id: user.id, name: user.name, email: user.email, role: user.role }
    });
  } catch (error) {
    next(error);
  }
};

// Récupération du profil utilisateur connecté avec son solde
export const getMe = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = (req as any).user?.id || (req as any).user?.userId || (req as any).userId;
    
    if (!userId) {
      return next(new AppError('Utilisateur non authentifié ou ID manquant.', 401));
    }

    const user = await prisma.user.findUnique({ 
      where: { id: userId },
      select: { 
        id: true, 
        name: true, 
        email: true, 
        role: true, 
        phone: true,
        avatar: true,
        wallet: {
          select: { balanceUSD: true, balanceCDF: true }
        }
      }
    });

    if (!user) {
      return next(new AppError('Utilisateur introuvable.', 404));
    }

    const userData = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      phone: user.phone,
      avatar: user.avatar,
      balanceUSD: user.wallet?.balanceUSD || 0,
      balanceCDF: user.wallet?.balanceCDF || 0
    };

    res.status(200).json({
      success: true,
      data: userData
    });
  } catch (error) {
    next(error);
  }
};

// Connexion et génération du token JWT
export const login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
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

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new AppError("La configuration du serveur est incomplète (JWT_SECRET manquant).", 500);
    }
    
    const token = jwt.sign(
      { userId: user.id, role: user.role },
      secret,
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

// Mise à jour du profil utilisateur (nom, téléphone, avatar)
export const updateProfile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = (req as any).user?.id || (req as any).user?.userId || (req as any).userId;
    
    if (!userId) {
      return next(new AppError('Utilisateur non authentifié ou ID manquant.', 401));
    }

    const { name, phone } = req.body;
    const updateData: any = {};

    if (name) updateData.name = name.trim();
    if (phone !== undefined) updateData.phone = phone ? phone.trim() : null;

    // Récupération sécurisée du fichier uploadé via Multer (champ 'avatar')
    if (req.file) {
      updateData.avatar = `/uploads/${req.file.filename}`;
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
      },
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