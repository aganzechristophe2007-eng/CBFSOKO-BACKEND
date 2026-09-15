import { Router } from 'express';
import { protect } from '../middleware/auth.middleware';
import {
  addFavorite,
  removeFavorite,
  getMyFavorites,
  toggleFavorite,
} from '../controllers/Favorite.controller';

const router = Router();

// Récupération de la liste des favoris
router.get('/favorites/me', protect, getMyFavorites);

// Action Toggle (Ajouter / Retirer au clic)
router.post('/products/:id/favorite', protect, toggleFavorite);
router.post('/products/:id/favorites', protect, toggleFavorite);

// Support des appels explicites POST et DELETE
router.put('/products/:id/favorite', protect, addFavorite);
router.delete('/products/:id/favorite', protect, removeFavorite);

export default router;