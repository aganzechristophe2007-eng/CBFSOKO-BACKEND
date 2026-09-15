import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { AppError } from '../utils/AppError';
import { prisma } from '../lib/prisma';

function getUserId(req: AuthRequest): string | undefined {
  return req.user?.userId || (req as any).userId || req.user?.id;
}

// Bascule automatique : Ajoute si absent, supprime si présent (Attendu par le frontend via POST)
export const toggleFavorite = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return next(new AppError('Utilisateur non authentifié.', 401));
    }

    const { id: productId } = req.params;

    if (!productId || typeof productId !== 'string') {
      return next(new AppError('Identifiant produit invalide.', 400));
    }

    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) {
      return next(new AppError('Produit introuvable.', 404));
    }

    const existingFavorite = await prisma.favorite.findUnique({
      where: { userId_productId: { userId, productId } },
    });

    if (existingFavorite) {
      await prisma.favorite.delete({
        where: { id: existingFavorite.id },
      });

      res.status(200).json({
        success: true,
        isFavorite: false,
        message: 'Produit retiré des favoris.',
      });
      return;
    }

    const newFavorite = await prisma.favorite.create({
      data: { userId, productId },
    });

    res.status(201).json({
      success: true,
      isFavorite: true,
      message: 'Produit ajouté aux favoris.',
      data: newFavorite,
    });
  } catch (error: any) {
    console.error('--> ERREUR CRITIQUE TOGGLE FAVORITE :', error);
    next(new AppError(error.message || 'Erreur lors de la mise à jour des favoris.', 500));
  }
};

// "J'aime" un produit
export const addFavorite = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return next(new AppError('Utilisateur non authentifié.', 401));
    }

    const { id: productId } = req.params;

    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) {
      return next(new AppError('Produit introuvable.', 404));
    }

    const favorite = await prisma.favorite.upsert({
      where: { userId_productId: { userId, productId } },
      update: {},
      create: { userId, productId },
    });

    res.status(201).json({ success: true, data: favorite });
  } catch (error: any) {
    console.error('--> ERREUR CRITIQUE ADD FAVORITE :', error);
    next(new AppError(error.message || "Erreur lors de l'ajout aux favoris.", 500));
  }
};

// Retirer un "j'aime"
export const removeFavorite = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return next(new AppError('Utilisateur non authentifié.', 401));
    }

    const { id: productId } = req.params;

    await prisma.favorite.deleteMany({ where: { userId, productId } });

    res.status(200).json({ success: true, message: 'Retiré des favoris.' });
  } catch (error: any) {
    console.error('--> ERREUR CRITIQUE REMOVE FAVORITE :', error);
    next(new AppError(error.message || 'Erreur lors du retrait des favoris.', 500));
  }
};

// Liste des favoris de l'utilisateur connecté
export const getMyFavorites = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      // ❌ INCORRECT
// ✅ CORRECT
return next(new AppError('Utilisateur non authentifié.', 401));
    }

    const favorites = await prisma.favorite.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        product: {
          select: {
            id: true,
            title: true,
            priceUSD: true,
            priceCDF: true,
            images: true,
            status: true,
          },
        },
      },
    });

    res.status(200).json({ success: true, data: favorites });
  } catch (error: any) {
    console.error('--> ERREUR CRITIQUE GET MY FAVORITES :', error);
    next(new AppError(error.message || 'Erreur lors de la récupération des favoris.', 500));
  }
};