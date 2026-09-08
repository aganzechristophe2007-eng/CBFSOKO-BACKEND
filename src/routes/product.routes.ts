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

router.get('/', async (req: any, res: Response, next: NextFunction) => {
  return getProducts(req, res, next);
});

router.get('/:id', async (req: any, res: Response, next: NextFunction) => {
  return getProductById(req, res, next);
});

// Ajout de "as any" sur protect
router.post('/', protect as any, upload.array('images', 5), async (req: any, res: Response, next: NextFunction) => {
  return createProduct(req, res, next);
}); 

// Ajout de "as any" sur protect
router.patch('/:id/sold', protect as any, async (req: any, res: Response, next: NextFunction) => {
  return markAsSold(req, res, next);
});

// Ajout de "as any" sur protect et restrictTo
router.delete('/:id', protect as any, restrictTo(Role.ADMIN, Role.SUPER_ADMIN) as any, async (req: any, res: Response, next: NextFunction) => {
  return deleteProduct(req, res, next);
});

export default router;