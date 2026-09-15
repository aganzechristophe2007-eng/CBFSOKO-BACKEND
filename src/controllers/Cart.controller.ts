import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { AppError } from '../utils/AppError';
import { prisma } from '../lib/prisma';

// Plafond anti-abus : évite qu'un client malveillant/buggé envoie une quantité
// absurde (négative, 999999...) qui fausserait les calculs de commande.
const MAX_QUANTITY_PER_ITEM = 20;

function getUserId(req: AuthRequest): string | undefined {
  // Même logique de secours que product.controller.ts, pour rester cohérent
  // avec le reste du projet (certains tokens portent "userId", d'autres "id").
  return req.user?.userId || (req as any).userId || req.user?.id;
}

function sanitizeQuantity(raw: unknown, fallback = 1): number {
  const parsed = parseInt(String(raw), 10);
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, MAX_QUANTITY_PER_ITEM);
}

// Récupérer le panier de l'utilisateur connecté (jamais celui d'un autre)
export const getCart = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return next(new AppError('Utilisateur non authentifié.', 401));
    }

    const cart = await prisma.cart.findUnique({
      where: { userId },
      include: {
        items: {
          orderBy: { createdAt: 'asc' },
          include: {
            product: {
              select: {
                id: true,
                title: true,
                priceUSD: true,
                priceCDF: true,
                images: true,
                quantity: true,
                status: true,
                isSold: true,
                sellerId: true,
                seller: { select: { id: true, name: true } },
              },
            },
          },
        },
      },
    });

    res.status(200).json({ success: true, data: cart?.items || [] });
  } catch (error: any) {
    console.error('--> ERREUR CRITIQUE GET CART :', error);
    next(new AppError(error.message || 'Erreur lors de la récupération du panier.', 500));
  }
};

// Ajouter un produit au panier (ou incrémenter la quantité s'il y est déjà)
export const addToCart = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return next(new AppError('Utilisateur non authentifié.', 401));
    }

    const { productId } = req.body;
    if (!productId || typeof productId !== 'string') {
      return next(new AppError('Identifiant de produit invalide.', 400));
    }

    const qty = sanitizeQuantity(req.body.quantity, 1);

    // On vérifie toujours l'existence ET la disponibilité réelle du produit
    // côté serveur — jamais confiance au prix/titre envoyés par le client.
    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) {
      return next(new AppError('Produit introuvable.', 404));
    }
    if (product.isSold || product.status !== 'ACTIVE') {
      return next(new AppError("Ce produit n'est plus disponible à l'achat.", 400));
    }
    if (product.sellerId === userId) {
      return next(new AppError('Vous ne pouvez pas ajouter votre propre produit à votre panier.', 400));
    }

    // Un panier par utilisateur, créé à la volée s'il n'existe pas encore
    const cart = await prisma.cart.upsert({
      where: { userId },
      update: {},
      create: { userId },
    });

    const existingItem = await prisma.cartItem.findUnique({
      where: { cartId_productId: { cartId: cart.id, productId } },
    });

    const cartItem = existingItem
      ? await prisma.cartItem.update({
          where: { id: existingItem.id },
          data: { quantity: Math.min(existingItem.quantity + qty, MAX_QUANTITY_PER_ITEM) },
        })
      : await prisma.cartItem.create({
          data: { cartId: cart.id, productId, quantity: qty },
        });

    res.status(201).json({ success: true, data: cartItem });
  } catch (error: any) {
    console.error('--> ERREUR CRITIQUE ADD TO CART :', error);
    next(new AppError(error.message || "Erreur lors de l'ajout au panier.", 500));
  }
};

// Modifier la quantité d'un article du panier
export const updateCartItem = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return next(new AppError('Utilisateur non authentifié.', 401));
    }

    const { id } = req.params;
    const quantity = sanitizeQuantity(req.body.quantity, NaN as unknown as number);
    if (!Number.isInteger(quantity) || Number.isNaN(quantity)) {
      return next(new AppError(`Quantité invalide (entre 1 et ${MAX_QUANTITY_PER_ITEM}).`, 400));
    }

    const item = await prisma.cartItem.findUnique({
      where: { id },
      include: { cart: true },
    });

    if (!item) {
      return next(new AppError('Article de panier introuvable.', 404));
    }

    // SÉCURITÉ : un utilisateur ne peut modifier qu'un article de SON propre panier
    if (item.cart.userId !== userId) {
      return next(new AppError("Vous n'avez pas l'autorisation de modifier cet article.", 403));
    }

    const updated = await prisma.cartItem.update({
      where: { id },
      data: { quantity },
    });

    res.status(200).json({ success: true, data: updated });
  } catch (error: any) {
    console.error('--> ERREUR CRITIQUE UPDATE CART ITEM :', error);
    next(new AppError(error.message || 'Erreur lors de la mise à jour du panier.', 500));
  }
};

// Retirer un article du panier
export const removeCartItem = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return next(new AppError('Utilisateur non authentifié.', 401));
    }

    const { id } = req.params;

    const item = await prisma.cartItem.findUnique({
      where: { id },
      include: { cart: true },
    });

    if (!item) {
      // Idempotent : si l'article n'existe déjà plus, ce n'est pas une erreur pour le client
      res.status(200).json({ success: true, message: 'Article déjà retiré du panier.' });
      return;
    }

    // SÉCURITÉ : un utilisateur ne peut supprimer qu'un article de SON propre panier
    if (item.cart.userId !== userId) {
      return next(new AppError("Vous n'avez pas l'autorisation de supprimer cet article.", 403));
    }

    await prisma.cartItem.delete({ where: { id } });

    res.status(200).json({ success: true, message: 'Article retiré du panier.' });
  } catch (error: any) {
    console.error('--> ERREUR CRITIQUE REMOVE CART ITEM :', error);
    next(new AppError(error.message || 'Erreur lors de la suppression.', 500));
  }
};