import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { AppError } from '../utils/AppError';
import { prisma } from '../lib/prisma';

// GET /api/follows/me — liste des vendeurs suivis par l'utilisateur connecté
export const getMyFollows = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) return next(new AppError('Utilisateur non authentifié.', 401));

    const follows = await prisma.follow.findMany({
      where: { followerId: userId },
      orderBy: { createdAt: 'desc' },
    });

    res.status(200).json({ success: true, data: follows });
  } catch (error: any) {
    console.error('Erreur getMyFollows:', error);
    next(new AppError(error.message || 'Erreur serveur interne.', 500));
  }
};

// POST /api/sellers/:id/follow — suivre un vendeur
export const followSeller = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user?.userId;
    const { id: sellerId } = req.params;

    if (!userId) return next(new AppError('Utilisateur non authentifié.', 401));
    if (!sellerId) return next(new AppError('Identifiant du vendeur manquant.', 400));
    if (userId === sellerId) return next(new AppError('Vous ne pouvez pas vous suivre vous-même.', 400));

    const sellerExists = await prisma.user.findUnique({ where: { id: sellerId }, select: { id: true } });
    if (!sellerExists) return next(new AppError('Vendeur introuvable.', 404));

    const follow = await prisma.follow.upsert({
      where: { followerId_followingId: { followerId: userId, followingId: sellerId } },
      update: {},
      create: { followerId: userId, followingId: sellerId },
    });

    res.status(201).json({ success: true, data: follow });
  } catch (error: any) {
    console.error('Erreur followSeller:', error);
    next(new AppError(error.message || 'Erreur serveur interne.', 500));
  }
};

// DELETE /api/sellers/:id/follow — ne plus suivre un vendeur
export const unfollowSeller = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user?.userId;
    const { id: sellerId } = req.params;

    if (!userId) return next(new AppError('Utilisateur non authentifié.', 401));

    await prisma.follow.deleteMany({
      where: { followerId: userId, followingId: sellerId },
    });

    res.status(200).json({ success: true, message: 'Vendeur retiré de vos abonnements.' });
  } catch (error: any) {
    console.error('Erreur unfollowSeller:', error);
    next(new AppError(error.message || 'Erreur serveur interne.', 500));
  }
};