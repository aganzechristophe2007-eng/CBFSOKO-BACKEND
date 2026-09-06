import { Router } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const router = Router();
// Route prioritaire pour éviter tout conflit de paramètre dynamique
router.get('/logistics-user', async (req, res, next) => {
  try {
    const logisticsAdmin = await prisma.user.findFirst({
      where: { role: 'ADMIN' },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
      }
    });

    if (!logisticsAdmin) {
      return res.status(404).json({ success: false, message: "Aucun administrateur logistique trouvé." });
    }

    return res.json({ success: true, data: logisticsAdmin });
  } catch (error) {
    next(error);
  }
});

// 1. Récupérer TOUS les utilisateurs depuis la base de données (Prisma)
router.get('/users', async (req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
      },
      orderBy: {
        id: 'asc'
      }
    });
    res.json(users);
  } catch (error) {
    next(error);
  }
});

// 2. Récupérer l'administrateur des finances
router.get('/finances-user', async (req, res, next) => {
  try {
    const financeAdmin = await prisma.user.findFirst({
      where: { role: 'ADMIN_FINANCE' },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
      }
    });

    if (!financeAdmin) {
      return res.status(404).json({ success: false, message: "Aucun administrateur financier trouvé." });
    }

    res.json({ success: true, data: financeAdmin });
  } catch (error) {
    next(error);
  }
});

// 3. Récupérer l'administrateur logistique (rôle ADMIN en base de données)
router.get('/logistics-user', async (req, res, next) => {
  try {
    const logisticsAdmin = await prisma.user.findFirst({
      where: { role: 'ADMIN' },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
      }
    });

    if (!logisticsAdmin) {
      return res.status(404).json({ success: false, message: "Aucun administrateur logistique trouvé." });
    }

    res.json({ success: true, data: logisticsAdmin });
  } catch (error) {
    next(error);
  }
});

// 4. Supprimer un utilisateur de la base de données (Prisma)
router.delete('/users/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    
    // Sécurité : Empêcher la suppression du Super Admin principal
    const userToDelete = await prisma.user.findUnique({ where: { id } });
    if (userToDelete?.email?.toLowerCase() === 'aganzechristophe2007@gmail.com') {
      return res.status(403).json({ message: "Action interdite sur le Super Administrateur." });
    }

    // Suppression définitive dans Prisma
    await prisma.user.delete({
      where: { id: id },
    });

    res.status(200).json({ message: "Utilisateur supprimé avec succès de la base de données." });
  } catch (error) {
    next(error);
  }
});

export default router;