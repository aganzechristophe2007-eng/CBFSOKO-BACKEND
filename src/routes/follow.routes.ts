import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { protect } from '../middleware/auth.middleware';
// Importe ton middleware d'authentification selon ton architecture
// import { verifyToken, AuthRequest } from '../middlewares/auth'; 

const router = Router();
const prisma = new PrismaClient();

// 1. S'abonner ou se désabonner d'un utilisateur/vendeur
router.post('/users/:id/follow', protect, async (req: any, res: Response) => {
  try {
    const followerId = req.user?.id || req.user?._id;
    const followingId = req.params.id;

    if (!followerId) {
      return res.status(401).json({ error: "Utilisateur non authentifié." });
    }

    if (followerId === followingId) {
      return res.status(400).json({ error: "Vous ne pouvez pas vous suivre vous-même." });
    }

    // Vérifier si la relation existe déjà
    const existingFollow = await prisma.follow.findUnique({
      where: {
        followerId_followingId: { followerId, followingId }
      }
    });

    if (existingFollow) {
      // Désabonnement
      await prisma.follow.delete({
        where: { id: existingFollow.id }
      });
      return res.json({ success: true, message: "Désabonné avec succès", following: false });
    } else {
      // Abonnement
      await prisma.follow.create({
        data: { followerId, followingId }
      });
      return res.json({ success: true, message: "Abonné avec succès", following: true });
    }
  } catch (error) {
    console.error("Erreur follow/unfollow:", error);
    return res.status(500).json({ error: "Erreur serveur" });
  }
});

// 2. Récupérer le flux (feed) des produits des utilisateurs suivis
router.get('/feed/following', protect, async (req: any, res: Response) => {
  try {
    const userId = req.user?.id || req.user?._id;

    if (!userId) {
      return res.status(401).json({ error: "Utilisateur non authentifié." });
    }

    // Récupérer la liste des IDs suivis
    const follows = await prisma.follow.findMany({
      where: { followerId: userId },
      select: { followingId: true }
    });

    const followingIds = follows.map(f => f.followingId);

    if (followingIds.length === 0) {
      return res.json({ data: [], message: "Aucun abonnement pour le moment." });
    }

    // Récupérer les produits de ces vendeurs
    const products = await prisma.product.findMany({
      where: {
        OR: [
          { sellerId: { in: followingIds } },
          { userId: { in: followingIds } }
        ]
      },
      orderBy: { createdAt: 'desc' },
      include: { seller: true }
    });

    return res.json({ data: products });
  } catch (error) {
    console.error("Erreur feed abonnements:", error);
    return res.status(500).json({ error: "Erreur serveur" });
  }
});

export default router;