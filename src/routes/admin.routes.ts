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

// 5. Liste des candidatures boutique (optionnel : ?status=PENDING|APPROVED|REJECTED)
router.get('/boutiques', async (req, res, next) => {
  try {
    const { status } = req.query;
    const shops = await prisma.shop.findMany({
      where: status ? { status: String(status).toUpperCase() as any } : undefined,
      include: { owner: { select: { name: true, email: true } } },
      orderBy: { createdAt: 'desc' },
    });

    const data = shops.map((s) => ({
      id: s.id,
      name: s.name,
      category: s.category,
      city: s.city,
      neighborhood: s.neighborhood,
      address: s.address,
      phone: s.phone,
      description: s.description,
      photos: s.photos,
      status: s.status.toLowerCase(),
      rejectionReason: s.rejectionReason,
      applicantName: s.owner?.name,
      applicantEmail: s.owner?.email,
      createdAt: s.createdAt,
    }));

    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

// 6. Valider une candidature boutique
router.patch('/boutiques/:id/validate', async (req, res, next) => {
  try {
    const { id } = req.params;
    const shop = await prisma.shop.update({
      where: { id },
      data: { status: 'APPROVED', isApproved: true, rejectionReason: null },
    });

    await prisma.notification.create({
      data: {
        userId: shop.ownerId,
        title: 'Boutique certifiée ✅',
        message: `Félicitations ! Votre boutique "${shop.name}" a été validée par l'administration CBF.`,
      },
    });

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// 7. Refuser une candidature boutique
router.patch('/boutiques/:id/reject', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const shop = await prisma.shop.update({
      where: { id },
      data: { status: 'REJECTED', isApproved: false, rejectionReason: reason || 'Non conforme aux critères CBF.' },
    });

    await prisma.notification.create({
      data: {
        userId: shop.ownerId,
        title: 'Candidature boutique refusée',
        message: `Votre candidature pour "${shop.name}" a été refusée. Motif : ${reason || 'non précisé'}.`,
      },
    });

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// 8. Vue d'ensemble des portefeuilles de TOUS les utilisateurs (Admin Finances)
router.get('/wallets', async (req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        phone: true,
        createdAt: true,
        wallet: { select: { id: true, balanceUSD: true, balanceCDF: true, updatedAt: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const data = users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      phone: u.phone,
      balanceUSD: u.wallet?.balanceUSD || 0,
      balanceCDF: u.wallet?.balanceCDF || 0,
      walletId: u.wallet?.id || null,
      updatedAt: u.wallet?.updatedAt || null,
    }));

    const totals = data.reduce(
      (acc, u) => {
        acc.totalBalanceUSD += u.balanceUSD;
        acc.totalBalanceCDF += u.balanceCDF;
        return acc;
      },
      { totalBalanceUSD: 0, totalBalanceCDF: 0 }
    );

    res.json({ success: true, data, totals });
  } catch (error) {
    next(error);
  }
});

// 9. Toutes les transactions de tous les utilisateurs (Admin Finances)
router.get('/transactions', async (req, res, next) => {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 200;
    const skip = (page - 1) * limit;

    const transactions = await prisma.transaction.findMany({
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        wallet: {
          include: { user: { select: { id: true, name: true, email: true, role: true } } },
        },
      },
    });

    const data = transactions.map((t) => ({
      id: t.id,
      type: t.type,
      status: t.status,
      provider: t.provider,
      reference: t.reference,
      amountUSD: t.amountUSD,
      amountCDF: t.amountCDF,
      createdAt: t.createdAt,
      user: t.wallet?.user
        ? {
            id: t.wallet.user.id,
            name: t.wallet.user.name,
            email: t.wallet.user.email,
            role: t.wallet.user.role,
          }
        : null,
    }));

    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

// 10. Statistiques financières globales : circulation de l'argent + gains de la plateforme (graphique)
router.get('/finance-stats', async (req, res, next) => {
  try {
    const range = String(req.query.range || '30d');
    const days = range === '7d' ? 7 : range === '90d' ? 90 : 30;
    const since = new Date();
    since.setDate(since.getDate() - days);

    const [wallets, transactions] = await Promise.all([
      prisma.wallet.findMany({ select: { balanceUSD: true, balanceCDF: true } }),
      prisma.transaction.findMany({
        where: { createdAt: { gte: since } },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    const totalCirculatingUSD = wallets.reduce((sum, w) => sum + w.balanceUSD, 0);
    const totalCirculatingCDF = wallets.reduce((sum, w) => sum + w.balanceCDF, 0);

    const successTxs = transactions.filter((t) => t.status === 'SUCCESS');
    const totalDeposits = successTxs
      .filter((t) => t.type === 'DEPOSIT')
      .reduce((sum, t) => sum + (t.amountUSD || t.amountCDF || 0), 0);
    const totalWithdrawals = successTxs
      .filter((t) => t.type === 'WITHDRAWAL')
      .reduce((sum, t) => sum + (t.amountUSD || t.amountCDF || 0), 0);

    // Frais / gains de la plateforme : même taux (1.5%) que le calcul individuel du wallet utilisateur
    const platformEarnings = totalDeposits * 0.015;

    const totalTxsCount = transactions.length;
    const failedTxsCount = transactions.filter((t) => t.status === 'FAILED').length;
    const failureRate = totalTxsCount > 0 ? ((failedTxsCount / totalTxsCount) * 100).toFixed(1) : '0';

    const chartDataMap = new Map<string, { depots: number; retraits: number }>();
    transactions.forEach((t) => {
      const dateStr = new Date(t.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
      const current = chartDataMap.get(dateStr) || { depots: 0, retraits: 0 };
      const amount = t.amountUSD || t.amountCDF || 0;
      if (t.type === 'DEPOSIT') current.depots += amount;
      if (t.type === 'WITHDRAWAL') current.retraits += amount;
      chartDataMap.set(dateStr, current);
    });

    const chartData = Array.from(chartDataMap, ([date, v]) => ({ date, ...v }));

    res.json({
      success: true,
      data: {
        totalCirculatingUSD,
        totalCirculatingCDF,
        totalDeposits,
        totalWithdrawals,
        platformEarnings,
        failureRate: Number(failureRate),
        totalUsers: wallets.length,
        chartData: chartData.length > 0 ? chartData : [{ date: "Aujourd'hui", depots: 0, retraits: 0 }],
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;