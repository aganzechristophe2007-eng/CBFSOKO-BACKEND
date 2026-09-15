import { Router, Request, Response, NextFunction, RequestHandler } from 'express';
import { 
  getProducts, 
  getProductById, 
  createProduct, 
  markAsSold, 
  deleteProduct,
  toggleFavorite
} from '../controllers/product.controller';
import { protect, restrictTo } from '../middleware/auth.middleware';
import { Role } from '@prisma/client';
import upload from '../middleware/upload.middleware';

const router = Router();

const asyncHandler = (fn: (req: Request, res: Response, next: NextFunction) => Promise<any>): RequestHandler => {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
};

// --- Routes Publiques ---
router.get('/', asyncHandler(getProducts));
router.get('/:id', asyncHandler(getProductById));

// --- Routes Protégées ---
router.post(
  '/',
  protect as unknown as RequestHandler,
  upload.fields([
    { name: 'images', maxCount: 5 },
    { name: 'video', maxCount: 1 }
  ]),
  asyncHandler(createProduct)
);

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

router.patch(
  '/:id/sold',
  protect as unknown as RequestHandler,
  asyncHandler(markAsSold)
);

// --- Routes Restreintes (Administration) ---
router.delete(
  '/:id',
  protect as unknown as RequestHandler,
  restrictTo(Role.ADMIN, Role.SUPER_ADMIN) as unknown as RequestHandler,
  asyncHandler(deleteProduct)
);

export default router;