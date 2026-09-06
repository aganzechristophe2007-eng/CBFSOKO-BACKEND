import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AuthRequest } from '../middleware/auth.middleware';
import { AppError } from '../utils/AppError';
import { prisma } from '../lib/prisma';

// Récupérer tous les produits
export const getProducts = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const products = await prisma.product.findMany({
      skip,
      take: limit,
      include: { 
        category: true, 
        seller: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.status(200).json({ success: true, data: products });
  } catch (error: any) {
    console.error("--> ERREUR CRITIQUE GET PRODUCTS :", error);
    next(new AppError(error.message || 'Erreur lors de la récupération des produits.', 500));
  }
};

// Créer un produit
export const createProduct = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    let userId = req.user?.userId || (req as any).userId || req.user?.id;
    
    if (!userId && req.headers.authorization) {
      try {
        const token = req.headers.authorization.split(' ')[1];
        const decoded: any = jwt.verify(token, process.env.JWT_SECRET || 'secret');
        userId = decoded.id || decoded.userId;
      } catch (e) {
        // Ignorer l'erreur de secours
      }
    }

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
      longitude
    } = req.body;

    if (!title || !description || !categoryId) {
      return next(new AppError('Veuillez remplir les champs obligatoires (titre, description, catégorie).', 400));
    }

    // Génération sécurisée du slug unique
    const randomSuffix = Math.random().toString(36).substring(2, 6);
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') + '-' + Date.now() + '-' + randomSuffix;

    const validStates = ['NEW', 'LIKE_NEW', 'GOOD', 'ACCEPTABLE'];
    const productState = validStates.includes(state) ? state : 'GOOD';

    // Gestion des images (fichier unique ou multiple via Multer)
    let imageUrls: string[] = [];
    const files = req.files as Express.Multer.File[];
    if (files && Array.isArray(files) && files.length > 0) {
      const host = req.get('host');
      const protocol = req.protocol;
      imageUrls = files.map(file => `${protocol}://${host}/uploads/${file.filename}`);
    } else if (req.file) {
      const host = req.get('host');
      const protocol = req.protocol;
      imageUrls = [`${protocol}://${host}/uploads/${req.file.filename}`];
    } else if (req.body.images) {
      imageUrls = typeof req.body.images === 'string' ? JSON.parse(req.body.images) : req.body.images;
    }

    // Conversion sécurisée des prix pour éviter les NaN / erreurs Prisma
    const parsedPriceUSD = priceUSD !== undefined && priceUSD !== '' ? parseFloat(priceUSD) : 0;
    const parsedPriceCDF = priceCDF !== undefined && priceCDF !== '' ? parseFloat(priceCDF) : 0;

    const newProduct = await prisma.product.create({
      data: {
        title,
        slug,
        description,
        priceCDF: parsedPriceCDF,
        priceUSD: parsedPriceUSD,
        categoryId,
        state: productState,
        status: 'PENDING',
        quantity: quantity ? parseInt(quantity, 10) : 1,
        sellerId: userId,
        type: type || 'SALE',
        images: imageUrls,
        durationMode: durationMode || 'FREE_24H',
        ...(expiresAt && { expiresAt: new Date(expiresAt) }),
        ...(shopId && { shopId }),
        ...(budgetUSD && { budgetUSD: parseFloat(budgetUSD) }),
        ...(latitude !== undefined && latitude !== '' && { latitude: parseFloat(latitude) }),
        ...(longitude !== undefined && longitude !== '' && { longitude: parseFloat(longitude) }),
      },
    });

    res.status(201).json({
      success: true,
      message: 'Produit créé avec succès',
      data: newProduct,
    });
  } catch (error: any) {
    console.error("--> ERREUR CRITIQUE PRISMA / CREATE PRODUCT :", error);
    next(new AppError(error.message || 'Erreur interne lors de la création.', 500));
  }
};

// Marquer un produit comme vendu
export const markAsSold = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    let userId = req.user?.userId || (req as any).userId || req.user?.id;

    const product = await prisma.product.findUnique({ where: { id } });

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
    next(error);
  }
};

// Supprimer un produit
export const deleteProduct = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId || (req as any).userId || req.user?.id;
    const userRole = req.user?.role;

    const product = await prisma.product.findUnique({ where: { id } });

    if (!product) {
      return next(new AppError('Produit introuvable.', 404));
    }

    const isAdmin = userRole === 'ADMIN' || userRole === 'SUPER_ADMIN' || userRole === 'ADMIN_FINANCE';
    if (product.sellerId !== userId && !isAdmin) {
      return next(new AppError("Vous n'avez pas l'autorisation de supprimer ce produit.", 403));
    }

    await prisma.product.delete({ where: { id } });

    res.status(200).json({
      success: true,
      message: 'Produit supprimé avec succès de la base de données.',
    });
  } catch (error) {
    next(error);
  }
};