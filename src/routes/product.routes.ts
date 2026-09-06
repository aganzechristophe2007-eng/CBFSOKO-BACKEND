import { Router } from 'express';
import { getProducts, createProduct, markAsSold, deleteProduct } from '../controllers/product.controller';
import { protect, restrictTo } from '../middleware/auth.middleware';
import { Role } from '@prisma/client';
import upload from '../middleware/upload.middleware';

const router = Router();

router.get('/', getProducts);

// Utilise 'images' et upload.array pour correspondre à ton modèle Prisma (String[])
router.post('/', protect, upload.array('images', 5), createProduct); 

router.patch('/:id/sold', protect, markAsSold);
router.delete('/:id', protect, restrictTo(Role.ADMIN, Role.SUPER_ADMIN), deleteProduct);

export default router;