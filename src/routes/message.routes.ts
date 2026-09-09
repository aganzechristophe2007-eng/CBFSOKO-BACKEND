import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { protect, AuthRequest } from '../middleware/auth.middleware';

const router = Router();

// ==========================================
// SECTION : GESTION DES DEMANDES DE CONTACT
// ==========================================

router.post('/request', protect, async (req: AuthRequest, res: Response) => {
  try {
    const currentUserId = req.user?.id;
    const { receiverId } = req.body;

    if (!currentUserId) {
      return res.status(401).json({ success: false, message: "Non authentifié" });
    }

    if (currentUserId === receiverId) {
      return res.status(400).json({ success: false, message: "Vous ne pouvez pas vous ajouter vous-même." });
    }

    const existingRequest = await prisma.contactRequest.findFirst({
      where: {
        OR: [
          { senderId: currentUserId, receiverId: receiverId },
          { senderId: receiverId, receiverId: currentUserId }
        ]
      }
    });

    if (existingRequest) {
      if (existingRequest.status === 'ACCEPTED') {
        return res.status(400).json({ success: false, message: "Vous êtes déjà en contact avec cet utilisateur." });
      }
      if (existingRequest.status === 'PENDING') {
        return res.status(400).json({ success: false, message: "Une demande de contact est déjà en attente." });
      }
      if (existingRequest.status === 'REJECTED') {
        const updated = await prisma.contactRequest.update({
          where: { id: existingRequest.id },
          data: { senderId: currentUserId, receiverId: receiverId, status: 'PENDING' }
        });
        
        await createNotificationForReceiver(currentUserId, receiverId);
        return res.json({ success: true, message: "Demande de contact renvoyée avec succès !", data: updated });
      }
    }

    const newRequest = await prisma.contactRequest.create({
      data: {
        senderId: currentUserId,
        receiverId,
        status: 'PENDING'
      }
    });

    await createNotificationForReceiver(currentUserId, receiverId);

    return res.status(201).json({ success: true, message: "Demande de contact envoyée avec succès !", data: newRequest });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.patch('/request/:requestId', protect, async (req: AuthRequest, res: Response) => {
  try {
    const currentUserId = req.user?.id;
    const { requestId } = req.params;
    const { status } = req.body;

    if (!['ACCEPTED', 'REJECTED'].includes(status)) {
      return res.status(400).json({ success: false, message: "Statut invalide." });
    }

    const contactRequest = await prisma.contactRequest.findUnique({
      where: { id: requestId }
    });

    if (!contactRequest) {
      return res.status(404).json({ success: false, message: "Demande introuvable." });
    }

    if (contactRequest.receiverId !== currentUserId) {
      return res.status(403).json({ success: false, message: "Action non autorisée." });
    }

    const updatedRequest = await prisma.contactRequest.update({
      where: { id: requestId },
      data: { status }
    });

    const receiverUser = await prisma.user.findUnique({ where: { id: currentUserId } });
    await prisma.notification.create({
      data: {
        userId: contactRequest.senderId,
        senderId: currentUserId,
        title: "Mise à jour de contact",
        message: status === 'ACCEPTED' 
          ? `${receiverUser?.name || 'L\'utilisateur'} a accepté votre demande de contact.` 
          : `${receiverUser?.name || 'L\'utilisateur'} a refusé votre demande de contact.`
      }
    });

    return res.json({ success: true, message: `Demande ${status.toLowerCase()} avec succès.`, data: updatedRequest });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.patch('/request/by-sender/:senderId', protect, async (req: AuthRequest, res: Response) => {
  try {
    const currentUserId = req.user?.id;
    const { senderId } = req.params;
    const { status } = req.body;

    if (!currentUserId) {
      return res.status(401).json({ success: false, message: "Non authentifié" });
    }

    if (!['ACCEPTED', 'REJECTED'].includes(status)) {
      return res.status(400).json({ success: false, message: "Statut invalide." });
    }

    const contactRequest = await prisma.contactRequest.findFirst({
      where: {
        senderId: senderId,
        receiverId: currentUserId,
        status: 'PENDING'
      }
    });

    if (!contactRequest) {
      return res.status(404).json({ success: false, message: "Demande de contact introuvable." });
    }

    const updatedRequest = await prisma.contactRequest.update({
      where: { id: contactRequest.id },
      data: { status }
    });

    const receiverUser = await prisma.user.findUnique({ where: { id: currentUserId } });
    await prisma.notification.create({
      data: {
        userId: senderId,
        senderId: currentUserId,
        title: "Mise à jour de contact",
        message: status === 'ACCEPTED'
          ? `${receiverUser?.name || 'L\'utilisateur'} a accepté votre demande de contact.`
          : `${receiverUser?.name || 'L\'utilisateur'} a refusé votre demande de contact.`
      }
    });

    return res.json({ success: true, message: `Demande ${status.toLowerCase()} avec succès.`, data: updatedRequest });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// ==========================================
// SECTION : SERVICE CLIENT / SUPPORT AUTOMATISÉ (ADMIN)
// ==========================================

router.post('/support-chat', protect, async (req: AuthRequest, res: Response) => {
  try {
    const currentUserId = req.user?.id;
    if (!currentUserId) {
      return res.status(401).json({ success: false, message: "Non authentifié" });
    }

    const adminUser = await prisma.user.findFirst({
      where: {
        role: {
          in: ['ADMIN', 'SUPER_ADMIN', 'ADMIN_FINANCE']
        }
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        avatar: true,
        updatedAt: true
      }
    });

    if (!adminUser) {
      return res.status(404).json({ 
        success: false, 
        message: "Aucun administrateur n'est disponible pour le moment." 
      });
    }

    if (adminUser.id === currentUserId) {
      return res.status(400).json({ 
        success: false, 
        message: "Vous êtes vous-même administrateur." 
      });
    }

    let contactRelation = await prisma.contactRequest.findFirst({
      where: {
        OR: [
          { senderId: currentUserId, receiverId: adminUser.id },
          { senderId: adminUser.id, receiverId: currentUserId }
        ]
      }
    });

    if (!contactRelation) {
      await prisma.contactRequest.create({
        data: {
          senderId: currentUserId,
          receiverId: adminUser.id,
          status: 'ACCEPTED'
        }
      });
    } else if (contactRelation.status !== 'ACCEPTED') {
      await prisma.contactRequest.update({
        where: { id: contactRelation.id },
        data: { status: 'ACCEPTED' }
      });
    }

    return res.json({
      success: true,
      message: "Chat support ouvert avec succès.",
      data: {
        ...adminUser,
        contactStatus: 'ACCEPTED'
      }
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// ==========================================
// SECTION : GESTION DES MESSAGES
// ==========================================

// 1. Routes GET statiques en premier (évite les conflits avec :otherUserId)
router.get('/unread-count', protect, async (req: AuthRequest, res: Response) => {
  try {
    const currentUserId = req.user?.id;
    if (!currentUserId) {
      return res.status(401).json({ success: false, message: "Non authentifié" });
    }

    const count = await prisma.message.count({
      where: {
        receiverId: currentUserId,
        isRead: false
      }
    });

    return res.json({ success: true, count });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/contacts/accepted', protect, async (req: AuthRequest, res: Response) => {
  try {
    const currentUserId = req.user?.id;
    if (!currentUserId) return res.status(401).json({ success: false, message: "Non authentifié" });

    const requests = await prisma.contactRequest.findMany({
      where: {
        status: 'ACCEPTED',
        OR: [
          { senderId: currentUserId },
          { receiverId: currentUserId }
        ]
      },
      include: {
        sender: { select: { id: true, name: true, email: true, avatar: true, role: true, updatedAt: true } },
        receiver: { select: { id: true, name: true, email: true, avatar: true, role: true, updatedAt: true } }
      }
    });

    const contacts = requests.map(req => 
      req.senderId === currentUserId ? req.receiver : req.sender
    );

    return res.json({ success: true, data: contacts });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/users/available', protect, async (req: AuthRequest, res: Response) => {
  try {
    const currentUserId = req.user?.id;
    if (!currentUserId) {
      return res.status(401).json({ success: false, message: "Utilisateur non authentifié." });
    }

    const users = await prisma.user.findMany({
      where: {
        id: { not: currentUserId },
        role: {
          notIn: ['ADMIN', 'SUPER_ADMIN', 'ADMIN_FINANCE']
        }
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        avatar: true
      }
    });

    const relations = await prisma.contactRequest.findMany({
      where: {
        OR: [
          { senderId: currentUserId },
          { receiverId: currentUserId }
        ]
      }
    });

    const usersWithStatus = users.map(user => {
      const relation = relations.find(
        r => r.senderId === user.id || r.receiverId === user.id
      );

      return {
        ...user,
        contactStatus: relation ? relation.status : null
      };
    });

    return res.json({ success: true, data: usersWithStatus });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// Route GET globale des messages
router.get('/', protect, async (req: AuthRequest, res: Response) => {
  try {
    const currentUserId = req.user?.id;
    if (!currentUserId) {
      return res.status(401).json({ success: false, message: "Utilisateur non authentifié." });
    }

    const messages = await prisma.message.findMany({
      where: {
        OR: [
          { senderId: currentUserId },
          { receiverId: currentUserId }
        ]
      },
      orderBy: { createdAt: 'asc' },
      include: {
        sender: { select: { id: true, name: true, avatar: true } },
        receiver: { select: { id: true, name: true, avatar: true } }
      }
    });

    return res.json({ success: true, data: messages });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// Route POST pour marquer explicitement tous les messages reçus comme lus
router.post('/mark-read', protect, async (req: AuthRequest, res: Response) => {
  try {
    const currentUserId = req.user?.id;
    if (!currentUserId) {
      return res.status(401).json({ success: false, message: "Non authentifié" });
    }

    const { senderId } = req.body; 

    await prisma.message.updateMany({
      where: {
        receiverId: currentUserId,
        ...(senderId ? { senderId } : {}),
        isRead: false
      },
      data: {
        isRead: true
      }
    });

    return res.json({ success: true, message: "Messages marqués comme lus." });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/', protect, async (req: AuthRequest, res: Response) => {
  try {
    const { receiverId, content } = req.body;
    const senderId = req.user?.id;
    const userRole = req.user?.role;

    if (!senderId) {
      return res.status(401).json({ success: false, message: "Utilisateur non authentifié." });
    }

    if (!receiverId || !content) {
      return res.status(400).json({ success: false, message: "Destinataire et contenu requis." });
    }

    const isAdminOrFinance = ['ADMIN', 'SUPER_ADMIN', 'ADMIN_FINANCE'].includes(userRole || '');

    if (!isAdminOrFinance) {
      const isConnected = await prisma.contactRequest.findFirst({
        where: {
          status: 'ACCEPTED',
          OR: [
            { senderId: senderId, receiverId: receiverId },
            { senderId: receiverId, receiverId: senderId }
          ]
        }
      });

      if (!isConnected) {
        return res.status(403).json({ 
          success: false, 
          message: "Vous devez d'abord envoyer une demande de contact et attendre qu'elle soit acceptée." 
        });
      }
    }

    const newMessage = await prisma.message.create({
      data: {
        senderId,
        receiverId,
        content,
        isRead: false
      },
      include: {
        sender: { select: { id: true, name: true, avatar: true } },
        receiver: { select: { id: true, name: true, avatar: true } }
      }
    });

    return res.status(201).json({ success: true, data: newMessage });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// 2. Route dynamique avec paramètre en dernier
router.get('/:otherUserId', protect, async (req: AuthRequest, res: Response) => {
  try {
    const currentUserId = req.user?.id;
    const { otherUserId } = req.params;

    if (!currentUserId) {
      return res.status(401).json({ success: false, message: "Utilisateur non authentifié." });
    }

    await prisma.message.updateMany({
      where: {
        senderId: otherUserId,
        receiverId: currentUserId,
        isRead: false
      },
      data: { isRead: true }
    });

    const messages = await prisma.message.findMany({
      where: {
        OR: [
          { senderId: currentUserId, receiverId: otherUserId },
          { senderId: otherUserId, receiverId: currentUserId }
        ]
      },
      orderBy: { createdAt: 'asc' },
      include: {
        sender: { select: { id: true, name: true, avatar: true } },
        receiver: { select: { id: true, name: true, avatar: true } }
      }
    });

    return res.json({ success: true, data: messages });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

async function createNotificationForReceiver(senderId: string, receiverId: string) {
  const sender = await prisma.user.findUnique({ where: { id: senderId } });
  await prisma.notification.create({
    data: {
      userId: receiverId,
      senderId: senderId,
      title: "Nouvelle demande de contact",
      message: `${sender?.name || 'Un utilisateur'} souhaite vous ajouter à ses contacts.`
    }
  });
}

export default router;