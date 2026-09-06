import { Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import { AppError } from '../utils/AppError';
import { AuthRequest } from '../middleware/auth.middleware';

const prisma = new PrismaClient();

// Récupérer le portefeuille de l'utilisateur connecté (ou d'un utilisateur spécifique pour l'admin)
export const getMyWallet = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return next(new AppError('Utilisateur non authentifié.', 401));
    }

    let wallet = await prisma.wallet.findUnique({
      where: { userId },
      include: {
        transactions: {
          orderBy: { createdAt: 'desc' },
          take: 10, // Les 10 dernières transactions
        },
      },
    });

    // Si l'utilisateur n'a pas encore de portefeuille, on lui en crée un automatiquement
    if (!wallet) {
      wallet = await prisma.wallet.create({
        data: {
          userId,
          balanceUSD: 0,
          balanceCDF: 0,
        },
        include: {
          transactions: true,
        },
      });
    }

    res.status(200).json({
      success: true,
      data: wallet,
    });
  } catch (error: any) {
    next(error);
  }
};

// Initier un dépôt (rechargement du portefeuille via Mobile Money / Cash)
export const depositToWallet = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.userId;
    const { amountUSD, amountCDF, provider, reference } = req.body;

    if (!userId) {
      return next(new AppError('Utilisateur non authentifié.', 401));
    }

    // Récupérer ou créer le wallet
    let wallet = await prisma.wallet.findUnique({ where: { userId } });
    if (!wallet) {
      wallet = await prisma.wallet.create({ data: { userId } });
    }

    // Enregistrer la transaction en attente ou réussie selon le flux opérateur
    const transaction = await prisma.transaction.create({
      data: {
        walletId: wallet.id,
        amountUSD: amountUSD ? parseFloat(amountUSD) : 0,
        amountCDF: amountCDF ? parseFloat(amountCDF) : 0,
        type: 'DEPOSIT',
        status: 'SUCCESS', // Simulation directe ou 'PENDING' si couplé à une API externe
        provider: provider || 'CASH',
        reference: reference || `DEP-${Date.now()}`,
      },
    });

    // Mettre à jour le solde du portefeuille
    const updatedWallet = await prisma.wallet.update({
      where: { id: wallet.id },
      data: {
        balanceUSD: { increment: amountUSD ? parseFloat(amountUSD) : 0 },
        balanceCDF: { increment: amountCDF ? parseFloat(amountCDF) : 0 },
      },
      include: { transactions: true },
    });

    res.status(200).json({
      success: true,
      message: 'Portefeuille rechargé avec succès.',
      data: updatedWallet,
    });
  } catch (error: any) {
    next(error);
  }
};