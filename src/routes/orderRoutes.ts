import { Router } from 'express';
import { getOrders, updateOrderStatus } from '../controllers/orderController';
import { protect, restrictTo } from '../middleware/auth.middleware';
import { Role } from '@prisma/client';

const router = Router();

// Benjamin (SELLER) et Félicien (ADMIN_FINANCE) peuvent voir les commandes
router.get('/', protect, getOrders);

// Seul Benjamin ou un rôle autorisé peut modifier le statut logistique
router.patch('/:orderId/status', protect, updateOrderStatus);

export default router;