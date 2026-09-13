import { Router, RequestHandler } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { getMyFollows, followSeller, unfollowSeller } from '../controllers/follow.controller';

const router = Router();

// Toutes les routes de ce fichier nécessitent d'être connecté
router.use(authMiddleware as unknown as RequestHandler);

router.get('/follows/me', getMyFollows as unknown as RequestHandler);
router.post('/sellers/:id/follow', followSeller as unknown as RequestHandler);
router.delete('/sellers/:id/follow', unfollowSeller as unknown as RequestHandler);

export default router;