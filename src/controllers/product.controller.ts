import { Response, NextFunction } from 'express';
import crypto from 'crypto';
import path from 'path';
import { AuthRequest } from '../middleware/auth.middleware';
import { AppError } from '../utils/AppError';
import { prisma } from '../lib/prisma';

// Regex d'assainissement et validation UUID
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Nettoyeur de chemin pour éviter d'exposer les répertoires système (Path Traversal)
const formatFilePath = (filePath: string): string => {
  const fileName = path.basename(filePath);
  return `/uploads/${fileName}`;
};

// Sélection sécurisée du profil vendeur
const SELLER_SAFE_SELECT = {
  id: true,
  name: true,
  email: true,
  phone: true,
} as const;

// === 1. Récupérer tous les produits (Public / Authentifié) ===
export const getProducts = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const rawPage = parseInt(req.query.page as string, 10);
    const rawLimit = parseInt(req.query.limit as string, 10);

    const page = !isNaN(rawPage) && rawPage > 0 ? rawPage : 1;
    const limit = !isNaN(rawLimit) && rawLimit > 0 && rawLimit <= 50 ? rawLimit : 20;
    const skip = (page - 1) * limit;

    const { official } = req.query;
    const where: Record<string, any> = {};

    if (official === 'true') {
      where.isOfficial = true;
    }

    const userId = req.user?.id || req.user?.userId;

    const products = await prisma.product.findMany({
      where,
      skip,
      take: limit,
      include: {
        category: true,
        seller: { select: SELLER_SAFE_SELECT },
        _count: { select: { favorites: true } },
        ...(userId ? { favorites: { where: { userId }, select: { id: true } } } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });

    const totalCount = await prisma.product.count({ where });

    const shaped = products.map((p: any) => ({
      ...p,
      favoritesCount: p._count?.favorites ?? 0,
      isFavorited: Array.isArray(p.favorites) ? p.favorites.length > 0 : false,
      favorites: undefined,
      _count: undefined,
    }));

    res.status(200).json({
      success: true,
      data: shaped,
      pagination: {
        total: totalCount,
        page,
        limit,
        totalPages: Math.ceil(totalCount / limit),
      },
    });
  } catch (error) {
    next(new AppError('Erreur lors de la récupération des produits.', 500));
  }
};

// === 2. Récupérer un produit par son ID ===
export const getProductById = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;

    if (!id || typeof id !== 'string') {
      return next(new AppError('Identifiant de produit invalide.', 400));
    }

    const userId = req.user?.id || req.user?.userId;

    const product = await prisma.product.findUnique({
      where: { id },
      include: {
        category: true,
        seller: { select: SELLER_SAFE_SELECT },
        _count: { select: { favorites: true } },
        ...(userId ? { favorites: { where: { userId }, select: { id: true } } } : {}),
      },
    });

    if (!product) {
      return next(new AppError('Produit introuvable.', 404));
    }

    const shaped = {
      ...product,
      favoritesCount: (product as any)._count?.favorites ?? 0,
      isFavorited: Array.isArray((product as any).favorites) ? (product as any).favorites.length > 0 : false,
      favorites: undefined,
      _count: undefined,
    };

    res.status(200).json({ success: true, data: shaped });
  } catch (error) {
    next(new AppError('Erreur lors de la récupération du produit.', 500));
  }
};

// === 3. Créer un produit (Authentification obligatoire via Middleware) ===
export const createProduct = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user?.id || req.user?.userId;

    if (!userId) {
      return next(new AppError('Utilisateur non authentifié.', 401));
    }

    const {
      title,
      description,
      categoryId,
      state,
      priceCDF,
      priceUSD,
      quantity,
      type,
      durationMode,
      expiresAt,
      shopId,
      budgetUSD,
      latitude,
      longitude,
      isOfficial,
    } = req.body;

    if (!title || typeof title !== 'string' || title.trim() === '') {
      return next(new AppError('Le titre du produit est obligatoire.', 400));
    }
    if (!description || typeof description !== 'string' || description.trim() === '') {
      return next(new AppError('La description est obligatoire.', 400));
    }
    if (!categoryId || typeof categoryId !== 'string') {
      return next(new AppError('La catégorie est obligatoire.', 400));
    }

    const userRole = req.user?.role;
    const isAdminUser = userRole === 'ADMIN' || userRole === 'SUPER_ADMIN';
    const officialFlag = isAdminUser && (isOfficial === true || isOfficial === 'true');

    const randomBytes = crypto.randomBytes(4).toString('hex');
    const cleanTitle = title.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    const slug = `${cleanTitle}-${Date.now()}-${randomBytes}`;

    const validStates = ['NEW', 'LIKE_NEW', 'GOOD', 'ACCEPTABLE'];
    const productState = validStates.includes(state) ? state : 'GOOD';

    let imageUrls: string[] = [];
    let videoUrl: string | null = null;

    const uploadedFiles = req.files as { [fieldname: string]: Express.Multer.File[] } | Express.Multer.File[] | undefined;

    if (uploadedFiles && !Array.isArray(uploadedFiles)) {
      if (uploadedFiles.images && uploadedFiles.images.length > 0) {
        imageUrls = uploadedFiles.images.map((file) => formatFilePath(file.path));
      }
      if (uploadedFiles.video && uploadedFiles.video.length > 0) {
        videoUrl = formatFilePath(uploadedFiles.video[0].path);
      }
    } else if (uploadedFiles && Array.isArray(uploadedFiles) && uploadedFiles.length > 0) {
      imageUrls = uploadedFiles.map((file) => formatFilePath(file.path));
    } else if (req.file) {
      imageUrls = [formatFilePath(req.file.path)];
    } else if (req.body.images) {
      try {
        const parsed = typeof req.body.images === 'string' ? JSON.parse(req.body.images) : req.body.images;
        if (Array.isArray(parsed)) {
          imageUrls = parsed.filter((img) => typeof img === 'string');
        }
      } catch {
        imageUrls = [];
      }
    }

    const parsedPriceUSD = priceUSD !== undefined && priceUSD !== '' ? Math.max(0, parseFloat(priceUSD)) : 0;
    const parsedPriceCDF = priceCDF !== undefined && priceCDF !== '' ? Math.max(0, parseFloat(priceCDF)) : 0;
    const parsedQuantity = quantity !== undefined && quantity !== '' ? Math.max(1, parseInt(quantity, 10)) : 1;

    const newProduct = await prisma.product.create({
      data: {
        title: title.trim(),
        slug,
        description: description.trim(),
        priceCDF: isNaN(parsedPriceCDF) ? 0 : parsedPriceCDF,
        priceUSD: isNaN(parsedPriceUSD) ? 0 : parsedPriceUSD,
        categoryId,
        state: productState,
        status: officialFlag ? 'ACTIVE' : 'PENDING',
        isOfficial: officialFlag,
        quantity: isNaN(parsedQuantity) ? 1 : parsedQuantity,
        sellerId: userId,
        type: type || 'SALE',
        images: imageUrls,
        videoUrl,
        durationMode: durationMode || 'FREE_24H',
        ...(expiresAt && !isNaN(Date.parse(expiresAt)) && { expiresAt: new Date(expiresAt) }),
        ...(shopId && typeof shopId === 'string' && { shopId }),
        ...(budgetUSD && !isNaN(parseFloat(budgetUSD)) && { budgetUSD: parseFloat(budgetUSD) }),
        ...(latitude !== undefined && latitude !== '' && !isNaN(parseFloat(latitude)) && { latitude: parseFloat(latitude) }),
        ...(longitude !== undefined && longitude !== '' && !isNaN(parseFloat(longitude)) && { longitude: parseFloat(longitude) }),
      },
      include: {
        category: true,
        seller: { select: SELLER_SAFE_SELECT },
      },
    });

    res.status(201).json({
      success: true,
      message: 'Produit créé avec succès.',
      data: newProduct,
    });
  } catch (error) {
    next(new AppError('Erreur interne lors de la création du produit.', 500));
  }
};

// === 4. Basculer l'état Favori (Ajouter / Retirer) ===
export const toggleFavorite = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user?.id || req.user?.userId;
    const { id: productId } = req.params;

    if (!userId) {
      return next(new AppError('Utilisateur non authentifié.', 401));
    }

    if (!productId || typeof productId !== 'string') {
      return next(new AppError('Identifiant du produit manquant.', 400));
    }

    const productExists = await prisma.product.findUnique({
      where: { id: productId },
      select: { id: true },
    });

    if (!productExists) {
      return next(new AppError("Le produit spécifié n'existe pas.", 404));
    }

    const existingFavorite = await prisma.favorite.findFirst({
      where: {
        userId,
        productId,
      },
    });

    if (existingFavorite) {
      await prisma.favorite.deleteMany({
        where: {
          userId,
          productId,
        },
      });

      res.status(200).json({
        success: true,
        isFavorite: false,
        message: 'Produit retiré des favoris.',
      });
      return;
    }

    await prisma.favorite.create({
      data: {
        userId,
        productId,
      },
    });

    res.status(200).json({
      success: true,
      isFavorite: true,
      message: 'Produit ajouté aux favoris.',
    });
  } catch (error) {
    next(new AppError('Erreur lors de la mise à jour des favoris.', 500));
  }
};

// === 5. Marquer un produit comme vendu ===
export const markAsSold = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user?.id || req.user?.userId;

    if (!userId) {
      return next(new AppError('Utilisateur non authentifié.', 401));
    }

    const product = await prisma.product.findUnique({
      where: { id },
      select: { id: true, sellerId: true },
    });

    if (!product) {
      return next(new AppError('Produit introuvable.', 404));
    }

    const userRole = req.user?.role;
    const isAdmin = userRole === 'ADMIN' || userRole === 'SUPER_ADMIN' || userRole === 'ADMIN_FINANCE';

    if (product.sellerId !== userId && !isAdmin) {
      return next(new AppError("Vous n'avez pas l'autorisation de modifier ce produit.", 403));
    }

    const updatedProduct = await prisma.product.update({
      where: { id },
      data: { isSold: true },
    });

    res.status(200).json({ success: true, data: updatedProduct });
  } catch (error) {
    next(new AppError('Erreur lors du changement d\'état du produit.', 500));
  }
};

// === 6. Supprimer un produit ===
export const deleteProduct = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user?.id || req.user?.userId;

    if (!userId) {
      return next(new AppError('Utilisateur non authentifié.', 401));
    }

    const product = await prisma.product.findUnique({
      where: { id },
      select: { id: true, sellerId: true },
    });

    if (!product) {
      return next(new AppError('Produit introuvable.', 404));
    }

    const userRole = req.user?.role;
    const isAdmin = userRole === 'ADMIN' || userRole === 'SUPER_ADMIN' || userRole === 'ADMIN_FINANCE';

    if (product.sellerId !== userId && !isAdmin) {
      return next(new AppError("Vous n'avez pas l'autorisation de supprimer ce produit.", 403));
    }

    await prisma.product.delete({ where: { id } });

    res.status(200).json({
      success: true,
      message: 'Produit supprimé avec succès.',
    });
  } catch (error) {
    next(new AppError('Erreur lors de la suppression du produit.', 500));
  }
};