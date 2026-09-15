import { Router } from 'express';
import { protect } from '../middleware/auth.middleware';
import { getCart, addToCart, updateCartItem, removeCartItem } from '../controllers/Cart.controller';

const router = Router();

// Le panier est une donnée strictement personnelle : toutes les routes
// exigent un token valide (voir vérification supplémentaire d'ownership
// dans le contrôleur pour update/delete).
router.use(protect);

router.get('/', getCart);
router.post('/', addToCart);
router.patch('/:id', updateCartItem);
router.delete('/:id', removeCartItem);

export default router;