import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { Role, User } from '@prisma/client';
import { AppError } from '../utils/AppError';
import 'multer'; // <--- Import indispensable pour que TypeScript reconnaisse Express.Multer.File

// Interface étendue assouplie pour éviter les conflits de types avec Prisma et les autres routes
export interface AuthRequest extends Request {
  user?: {
    id?: string;
    userId?: string;
    role: Role;
    [key: string]: any;
  } | User;
  userId?: string;
  file?: Express.Multer.File;
}

export const protect = (req: AuthRequest, res: Response, next: NextFunction): void => {
  const authHeader = req.headers.authorization;
  console.log("--> 1. REQUÊTE REÇUE - Auth Header :", authHeader);

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.log("--> 2. ERREUR : Header manquant ou mal formaté");
    next(new AppError('Accès non autorisé. Token manquant.', 401));
    return;
  }

  const token = authHeader.split(' ')[1];
  console.log("--> 3. TOKEN EXTRAIT :", token.substring(0, 15) + "...");

  try {
    const secret = process.env.JWT_SECRET || 'secret';
    console.log("--> 4. Tentative de vérification avec le secret...");
    
    const decoded = jwt.verify(token, secret) as { userId: string; role: Role };
    console.log("--> 5. SUCCÈS - Token décodé avec succès :", decoded);
    
    req.user = decoded;
    next();
  } catch (error: any) {
    console.error("--> ❌ ERREUR CATCH JWT_VERIFY :", error.name, "->", error.message);
    next(new AppError('Token invalide ou expiré.', 401));
  }
};

// Utilisation directe de l'Enum Role de Prisma pour sécuriser les niveaux d'accès
export const restrictTo = (...roles: Role[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role)) {
      next(new AppError("Vous n'avez pas les permissions nécessaires pour cette action.", 403));
      return;
    }
    next();
  };
};

// Alias pour assurer la compatibilité avec les routes qui importent authMiddleware
export const authMiddleware = protect;