import { Router, Request, Response, NextFunction, RequestHandler } from 'express';
import { 
  getProducts, 
  getProductById, 
  createProduct, 
  markAsSold, 
  deleteProduct,
  toggleFavorite // Assurez-vous d'avoir ce contrôleur dans votre product.controller.ts
} from '../controllers/product.controller';
import { protect, restrictTo } from '../middleware/auth.middleware';
import { Role } from '@prisma/client';
import upload from '../middleware/upload.middleware';

const router = Router();

// Wrapper utilitaire pour éviter le répétitif req: any / async-await dans le routeur
const asyncHandler = (fn: (req: Request, res: Response, next: NextFunction) => Promise<any>): RequestHandler => {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
};

// --- Routes Publiques ---

// GET /api/products : Récupérer tous les produits
router.get('/', asyncHandler(getProducts));

// GET /api/products/:id : Récupérer un produit par son ID
router.get('/:id', asyncHandler(getProductById));


// --- Routes Protégées (Utilisateurs authentifiés) ---

// POST /api/products : Créer un produit avec images (max 5) et vidéo (max 1)
router.post(
  '/',
  protect as unknown as RequestHandler,
  upload.fields([
    { name: 'images', maxCount: 5 },
    { name: 'video', maxCount: 1 }
  ]),
  asyncHandler(createProduct)
);

// POST /api/products/:id/favorite (et /favorites) : Ajouter ou retirer un produit des favoris
// Ces deux lignes corrigent directement l'erreur 404 du Frontend
router.post(
  '/:id/favorite',
  protect as unknown as RequestHandler,
  asyncHandler(toggleFavorite)
);

router.post(
  '/:id/favorites',
  protect as unknown as RequestHandler,
  asyncHandler(toggleFavorite)
);

// PATCH /api/products/:id/sold : Marquer un produit comme vendu
router.patch(
  '/:id/sold',
  protect as unknown as RequestHandler,
  asyncHandler(markAsSold)
);


// --- Routes Restreintes (Administration) ---

// DELETE /api/products/:id : Supprimer un produit (ADMIN / SUPER_ADMIN uniquement)
router.delete(
  '/:id',
  protect as unknown as RequestHandler,
  restrictTo(Role.ADMIN, Role.SUPER_ADMIN) as unknown as RequestHandler,
  asyncHandler(deleteProduct)
);

export default router;