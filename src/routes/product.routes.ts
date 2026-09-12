import { Router, Response, NextFunction } from 'express';
import { 
  getProducts, 
  getProductById, 
  createProduct, 
  markAsSold, 
  deleteProduct 
} from '../controllers/product.controller';
import { protect, restrictTo } from '../middleware/auth.middleware';
import { Role } from '@prisma/client';
import upload from '../middleware/upload.middleware';

const router = Router();

// Route publique : Récupérer tous les produits
router.get('/', async (req: any, res: Response, next: NextFunction) => {
  return getProducts(req, res, next);
});

// Route publique : Récupérer un produit par son ID
router.get('/:id', async (req: any, res: Response, next: NextFunction) => {
  return getProductById(req, res, next);
});

// Route protégée : Création d'un produit avec support sécurisé des images (max 5) et de la vidéo (max 1)
router.post(
  '/', 
  protect as any, 
  upload.fields([
    { name: 'images', maxCount: 5 }, 
    { name: 'video', maxCount: 1 }
  ]), 
  async (req: any, res: Response, next: NextFunction) => {
    return createProduct(req, res, next);
  }
); 

// Route protégée : Marquer un produit comme vendu
router.patch('/:id/sold', protect as any, async (req: any, res: Response, next: NextFunction) => {
  return markAsSold(req, res, next);
});

// Route sécurisée et restreinte : Supprimer un produit (Admin / Super Admin uniquement)
router.delete(
  '/:id', 
  protect as any, 
  restrictTo(Role.ADMIN, Role.SUPER_ADMIN) as any, 
  async (req: any, res: Response, next: NextFunction) => {
    return deleteProduct(req, res, next);
  }
);

export default router;