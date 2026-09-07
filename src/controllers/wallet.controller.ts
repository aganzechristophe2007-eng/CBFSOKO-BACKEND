import { Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import { AppError } from '../utils/AppError';
import { AuthRequest } from '../middleware/auth.middleware';

const prisma = new PrismaClient();

/**
 * Récupérer le portefeuille de l'utilisateur connecté
 */
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
          take: 10,
        },
      },
    });

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

/**
 * Initier un dépôt (Le solde N'EST PAS mis à jour directement, statut PENDING en attente du réseau)
 */
export const depositToWallet = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.userId;
    const { amount, currency, amountUSD, amountCDF, provider, reference, phoneNumber } = req.body;

    if (!userId) {
      return next(new AppError('Utilisateur non authentifié.', 401));
    }

    let finalAmountUSD = 0;
    let finalAmountCDF = 0;

    if (amount !== undefined && currency) {
      const parsedAmount = parseFloat(amount) || 0;
      if (currency.toUpperCase() === 'USD') {
        finalAmountUSD = parsedAmount;
      } else if (currency.toUpperCase() === 'CDF') {
        finalAmountCDF = parsedAmount;
      }
    } else {
      finalAmountUSD = amountUSD ? parseFloat(amountUSD) : 0;
      finalAmountCDF = amountCDF ? parseFloat(amountCDF) : 0;
    }

    if (finalAmountUSD <= 0 && finalAmountCDF <= 0) {
      return next(new AppError('Le montant du dépôt doit être supérieur à zéro.', 400));
    }

    let wallet = await prisma.wallet.findUnique({ where: { userId } });
    if (!wallet) {
      wallet = await prisma.wallet.create({
        data: { userId, balanceUSD: 0, balanceCDF: 0 }
      });
    }

    // Création de la transaction en PENDING : en attente de la confirmation réelle du réseau mobile/paiement
    const transaction = await prisma.transaction.create({
      data: {
        walletId: wallet.id,
        amountUSD: finalAmountUSD,
        amountCDF: finalAmountCDF,
        type: 'DEPOSIT',
        status: 'PENDING', // Attend la confirmation réseau / opérateur
        provider: provider || 'MPESA',
        reference: reference || `DEP-${Date.now()}`,
      },
    });

    res.status(200).json({
      success: true,
      message: 'Demande de dépôt initiée. En attente de la confirmation du réseau.',
      data: {
        transaction,
        wallet
      },
    });
  } catch (error: any) {
    next(error);
  }
};

/**
 * Initier un retrait (Vérifie le solde actuel et place la transaction en PENDING)
 */
export const withdrawFromWallet = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.userId;
    const { amount, currency, amountUSD, amountCDF, provider, reference, phoneNumber } = req.body;

    if (!userId) {
      return next(new AppError('Utilisateur non authentifié.', 401));
    }

    let finalAmountUSD = 0;
    let finalAmountCDF = 0;

    if (amount !== undefined && currency) {
      const parsedAmount = parseFloat(amount) || 0;
      if (currency.toUpperCase() === 'USD') {
        finalAmountUSD = parsedAmount;
      } else if (currency.toUpperCase() === 'CDF') {
        finalAmountCDF = parsedAmount;
      }
    } else {
      finalAmountUSD = amountUSD ? parseFloat(amountUSD) : 0;
      finalAmountCDF = amountCDF ? parseFloat(amountCDF) : 0;
    }

    if (finalAmountUSD <= 0 && finalAmountCDF <= 0) {
      return next(new AppError('Le montant du retrait doit être supérieur à zéro.', 400));
    }

    const wallet = await prisma.wallet.findUnique({ where: { userId } });
    if (!wallet) {
      return next(new AppError('Portefeuille introuvable.', 404));
    }

    if (finalAmountUSD > 0 && wallet.balanceUSD < finalAmountUSD) {
      return next(new AppError('Solde USD insuffisant pour effectuer ce retrait.', 400));
    }
    if (finalAmountCDF > 0 && wallet.balanceCDF < finalAmountCDF) {
      return next(new AppError('Solde CDF insuffisant pour effectuer ce retrait.', 400));
    }

    // Enregistrement de la demande de retrait en PENDING pour l'AdminFinanceDashboard
    // Le solde peut être bloqué ou déduit uniquement après confirmation (selon votre logique métier, ici on trace juste la demande)
    const transaction = await prisma.transaction.create({
      data: {
        walletId: wallet.id,
        amountUSD: finalAmountUSD,
        amountCDF: finalAmountCDF,
        type: 'WITHDRAWAL',
        status: 'PENDING',
        provider: provider || 'MPESA',
        reference: reference || `WDR-${Date.now()}`,
      },
    });

    res.status(200).json({
      success: true,
      message: 'Demande de retrait enregistrée. En attente de validation opérateur/admin.',
      data: {
        transaction,
        wallet
      },
    });
  } catch (error: any) {
    next(error);
  }
};