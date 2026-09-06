import { Router } from 'express';
import { getMyWallet, depositToWallet } from '../controllers/wallet.controller';
import { protect, restrictTo } from '../middleware/auth.middleware';
import { Role } from '@prisma/client';

const router = Router();

// Toutes les routes du portefeuille nécessitent d'être authentifié
router.use(protect);

// Consulter son propre portefeuille
router.get('/', getMyWallet);

// Recharger son portefeuille (ou effectuer un dépôt)
router.post('/deposit', depositToWallet);

export default router;