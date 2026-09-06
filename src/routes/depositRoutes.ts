import { Router } from 'express';
import { initiateAirtelDeposit, handleAirtelWebhook } from '../controllers/depositController';
import { protect } from '../middleware/auth.middleware';

const router = Router();

// Route appelée par ton frontend pour le dépôt
router.post('/deposit', protect, initiateAirtelDeposit);

// Route spécifique Airtel
router.post('/airtel/initiate', protect, initiateAirtelDeposit);
router.post('/airtel/webhook', handleAirtelWebhook);

export default router;