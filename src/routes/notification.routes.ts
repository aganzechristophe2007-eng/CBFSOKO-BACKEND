import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { protect, AuthRequest } from '../middleware/auth.middleware';

const router = Router();

// ==========================================
// SECTION : GESTION DES NOTIFICATIONS
// ==========================================

// GET : Récupérer toutes les notifications de l'utilisateur connecté
router.get('/', protect, async (req: AuthRequest, res: Response) => {
  try {
    const currentUserId = req.user?.id;
    if (!currentUserId) {
      return res.status(401).json({ success: false, message: "Non authentifié" });
    }

    const notifications = await prisma.notification.findMany({
      where: { userId: currentUserId },
      orderBy: { createdAt: 'desc' },
      include: {
        sender: { select: { id: true, name: true, email: true, avatar: true } }
      }
    });

    return res.json({ success: true, data: notifications });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// POST : Accepter une demande de contact depuis une notification
router.post('/:id/accept', protect, async (req: AuthRequest, res: Response) => {
  try {
    const currentUserId = req.user?.id;
    const { id } = req.params;
    const { senderId } = req.body;

    if (!currentUserId) {
      return res.status(401).json({ success: false, message: "Non authentifié" });
    }

    const notification = await prisma.notification.findUnique({ where: { id } });
    if (!notification || notification.userId !== currentUserId) {
      return res.status(404).json({ success: false, message: "Notification introuvable ou non autorisée." });
    }

    // Mettre à jour le statut de la notification
    const updatedNotif = await prisma.notification.update({
      where: { id },
      data: { status: 'accepted', isRead: true }
    });

    // Si c'est une demande de contact, créer le lien d'amitié / contact si nécessaire
    if (senderId) {
      // Exemple : Ajout mutuel dans une table de relations ou de contacts si ton schéma le prévoit
      // await prisma.contact.createMany(...)
    }

    return res.json({ success: true, data: updatedNotif });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// POST : Refuser une demande de contact depuis une notification
router.post('/:id/reject', protect, async (req: AuthRequest, res: Response) => {
  try {
    const currentUserId = req.user?.id;
    const { id } = req.params;

    if (!currentUserId) {
      return res.status(401).json({ success: false, message: "Non authentifié" });
    }

    const notification = await prisma.notification.findUnique({ where: { id } });
    if (!notification || notification.userId !== currentUserId) {
      return res.status(404).json({ success: false, message: "Notification introuvable ou non autorisée." });
    }

    const updatedNotif = await prisma.notification.update({
      where: { id },
      data: { status: 'rejected', isRead: true }
    });

    return res.json({ success: true, data: updatedNotif });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// PATCH : Marquer une notification spécifique comme lue
router.patch('/:id/read', protect, async (req: AuthRequest, res: Response) => {
  try {
    const currentUserId = req.user?.id;
    const { id } = req.params;

    if (!currentUserId) {
      return res.status(401).json({ success: false, message: "Non authentifié" });
    }

    const notification = await prisma.notification.findUnique({ where: { id } });

    if (!notification) {
      return res.status(404).json({ success: false, message: "Notification introuvable." });
    }

    if (notification.userId !== currentUserId) {
      return res.status(403).json({ success: false, message: "Action non autorisée." });
    }

    const updated = await prisma.notification.update({
      where: { id },
      data: { isRead: true }
    });

    return res.json({ success: true, data: updated });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// PATCH : Marquer toutes les notifications comme lues
router.patch('/mark-all-read', protect, async (req: AuthRequest, res: Response) => {
  try {
    const currentUserId = req.user?.id;
    if (!currentUserId) {
      return res.status(401).json({ success: false, message: "Non authentifié" });
    }

    await prisma.notification.updateMany({
      where: { userId: currentUserId, isRead: false },
      data: { isRead: true }
    });

    return res.json({ success: true, message: "Toutes les notifications ont été marquées comme lues." });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// DELETE : Supprimer une notification
router.delete('/:id', protect, async (req: AuthRequest, res: Response) => {
  try {
    const currentUserId = req.user?.id;
    const { id } = req.params;

    if (!currentUserId) {
      return res.status(401).json({ success: false, message: "Non authentifié" });
    }

    const notification = await prisma.notification.findUnique({ where: { id } });

    if (!notification) {
      return res.status(404).json({ success: false, message: "Notification introuvable." });
    }

    if (notification.userId !== currentUserId) {
      return res.status(403).json({ success: false, message: "Action non autorisée." });
    }

    await prisma.notification.delete({
      where: { id }
    });

    return res.json({ success: true, message: "Notification supprimée avec succès." });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

export default router;