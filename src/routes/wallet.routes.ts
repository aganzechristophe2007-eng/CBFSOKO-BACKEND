import { Router, RequestHandler } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { 
  getWalletData, 
  processTransaction, 
  getTransactionStats, 
  handleAggregatorWebhook 
} from '../controllers/wallet.controller';

const router = Router();

// Webhook public (sans middleware)
router.post('/webhook', handleAggregatorWebhook as unknown as RequestHandler);

// Application propre du middleware d'authentification pour sécuriser le reste du routeur
router.use(authMiddleware as unknown as RequestHandler);

router.get('/me', getWalletData as unknown as RequestHandler);
router.get('/statistics', getTransactionStats as unknown as RequestHandler);
router.post('/transaction', processTransaction as unknown as RequestHandler);

export default router;