import { Router } from 'express';
import { protect } from '../middleware/auth.middleware';
import { addFavorite, removeFavorite, getMyFavorites } from '../controllers/Favorite.controller';

const router = Router();

// Même schéma de montage que follow.routes.ts : ce routeur est branché
// sur app.use('/api', favoriteRoutes) dans server.ts, d'où les chemins
// complets ci-dessous.
router.get('/favorites/me', protect, getMyFavorites);
router.post('/products/:id/favorite', protect, addFavorite);
router.delete('/products/:id/favorite', protect, removeFavorite);

export default router;