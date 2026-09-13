import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { protect } from '../middleware/auth.middleware';

const prisma = new PrismaClient();
const router = Router();

// Frais de certification boutique en USD — à ajuster si besoin
const CERTIFICATION_FEE_USD = 10;

// --- Stockage des 3 photos de boutique ---
// NOTE : si la migration Cloudinary évoquée pour les avatars/messages est déjà
// en place, remplacez ce storage par votre middleware Cloudinary existant.
const uploadDir = path.join(process.cwd(), 'uploads', 'shops');
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname)}`;
    cb(null, unique);
  },
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

const formatShop = (shop: any) => ({
  status: shop.status.toLowerCase(),
  name: shop.name,
  location: [shop.address, shop.neighborhood, shop.city].filter(Boolean).join(', '),
  category: shop.category,
  phone: shop.phone,
  description: shop.description,
  photos: shop.photos,
  rejectionReason: shop.rejectionReason,
});

// 1. Statut de la candidature/boutique de l'utilisateur connecté
router.get('/me', protect, async (req: any, res, next) => {
  try {
    const userId = req.user.id;
    const shop = await prisma.shop.findFirst({ where: { ownerId: userId } });
    if (!shop) return res.json({ status: 'none' });
    return res.json(formatShop(shop));
  } catch (error) {
    next(error);
  }
});

// 2. Envoi/renvoi d'une candidature de certification boutique
router.post(
  '/apply',
  protect,
  upload.fields([
    { name: 'photo1', maxCount: 1 },
    { name: 'photo2', maxCount: 1 },
    { name: 'photo3', maxCount: 1 },
  ]),
  async (req: any, res, next) => {
    try {
      const userId = req.user.id;
      const { name, category, city, neighborhood, address, phone, description } = req.body;

      if (!name || !city || !address || !phone) {
        return res.status(400).json({ message: 'Champs obligatoires manquants (nom, ville, adresse, téléphone).' });
      }

      const files = (req.files || {}) as { [field: string]: Express.Multer.File[] };
      const photos = ['photo1', 'photo2', 'photo3']
        .map((key) => files[key]?.[0])
        .filter(Boolean)
        .map((f) => `uploads/shops/${f!.filename}`);

      if (photos.length < 3) {
        return res.status(400).json({ message: 'Les 3 photos de la boutique sont obligatoires.' });
      }

      const existing = await prisma.shop.findFirst({ where: { ownerId: userId } });
      if (existing && existing.status === 'PENDING') {
        return res.status(409).json({ message: 'Une candidature est déjà en cours d\'examen.' });
      }
      if (existing && existing.status === 'APPROVED') {
        return res.status(409).json({ message: 'Votre boutique est déjà certifiée.' });
      }

      const result = await prisma.$transaction(async (tx) => {
        const wallet = await tx.wallet.findUnique({ where: { userId } });
        if (!wallet || wallet.balanceUSD < CERTIFICATION_FEE_USD) {
          throw new Error('INSUFFICIENT_BALANCE');
        }

        const updatedWallet = await tx.wallet.update({
          where: { userId },
          data: { balanceUSD: { decrement: CERTIFICATION_FEE_USD } },
        });

        await tx.transaction.create({
          data: {
            walletId: wallet.id,
            amountUSD: CERTIFICATION_FEE_USD,
            type: 'CERTIFICATION',
            status: 'SUCCESS',
            reference: `CERT-${Date.now()}`,
          },
        });

        const slugBase = String(name).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
        const slug = `${slugBase}-${Date.now().toString(36)}`;

        const shop = existing
          ? await tx.shop.update({
              where: { id: existing.id },
              data: {
                name, category, city, neighborhood, address, phone, description,
                photos, status: 'PENDING', rejectionReason: null, isApproved: false,
              },
            })
          : await tx.shop.create({
              data: {
                name, slug, category, city, neighborhood, address, phone, description,
                photos, status: 'PENDING', ownerId: userId,
              },
            });

        // Notifie l'admin (Christophe) — à défaut d'email, une notification interne suffit
        // pour qu'il la voie dans son dashboard Admin dès l'onglet "Formulaires Boutique".
        return { shop, balance: updatedWallet.balanceUSD };
      });

      return res.status(201).json({ success: true, status: 'pending', balance: result.balance });
    } catch (error: any) {
      if (error.message === 'INSUFFICIENT_BALANCE') {
        return res.status(402).json({ message: 'Solde insuffisant pour couvrir les frais de certification.' });
      }
      next(error);
    }
  }
);

export default router;
