import { Router } from 'express';
import { getMyWallet, depositToWallet, withdrawFromWallet } from '../controllers/wallet.controller';
import { protect } from '../middleware/auth.middleware';

const router = Router();

// Toutes les routes du portefeuille nécessitent d'être authentifié
router.use(protect);

// Consulter son propre portefeuille
router.get('/', getMyWallet);

// Recharger son portefeuille (dépôt)
router.post('/deposit', depositToWallet);

// Effectuer un retrait depuis le portefeuille
router.post('/withdraw', withdrawFromWallet);

export default router;