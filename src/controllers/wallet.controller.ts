import { Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import { AppError } from '../utils/AppError';
import { AuthRequest } from '../middleware/auth.middleware';

const prisma = new PrismaClient();

/**
 * Récupérer le portefeuille de l'utilisateur connecté
 * (Crée automatiquement un portefeuille à 0 si l'utilisateur n'en a pas encore)
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
          take: 10, // Les 10 dernières transactions
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
 * Initier un dépôt (rechargement du portefeuille via Mobile Money / Cash)
 */
export const depositToWallet = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.userId;
    const { amount, currency, amountUSD, amountCDF, provider, reference, phoneNumber } = req.body;

    if (!userId) {
      return next(new AppError('Utilisateur non authentifié.', 401));
    }

    // Gestion intelligente du format (prend en charge {amount, currency} ou {amountUSD/amountCDF})
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

    // Récupérer ou créer le wallet si inexistant
    let wallet = await prisma.wallet.findUnique({ where: { userId } });
    if (!wallet) {
      wallet = await prisma.wallet.create({
        data: { userId, balanceUSD: 0, balanceCDF: 0 }
      });
    }

    // Enregistrer la transaction de dépôt
    await prisma.transaction.create({
      data: {
        walletId: wallet.id,
        amountUSD: finalAmountUSD,
        amountCDF: finalAmountCDF,
        type: 'DEPOSIT',
        status: 'SUCCESS', // Directement validé en simulation
        provider: provider || 'MPESA',
        reference: reference || `DEP-${Date.now()}`,
      },
    });

    // Mettre à jour le solde du portefeuille
    const updatedWallet = await prisma.wallet.update({
      where: { id: wallet.id },
      data: {
        balanceUSD: { increment: finalAmountUSD },
        balanceCDF: { increment: finalAmountCDF },
      },
      include: { 
        transactions: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        } 
      },
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

/**
 * Initier un retrait depuis le portefeuille vers Mobile Money
 */
export const withdrawFromWallet = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.userId;
    const { amount, currency, amountUSD, amountCDF, provider, reference, phoneNumber } = req.body;

    if (!userId) {
      return next(new AppError('Utilisateur non authentifié.', 401));
    }

    // Gestion intelligente du format de données reçu du front-end
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

    // Récupérer le portefeuille de l'utilisateur
    const wallet = await prisma.wallet.findUnique({ where: { userId } });
    if (!wallet) {
      return next(new AppError('Portefeuille introuvable.', 404));
    }

    // Vérifier si l'utilisateur possède un solde suffisant
    if (finalAmountUSD > 0 && wallet.balanceUSD < finalAmountUSD) {
      return next(new AppError('Solde USD insuffisant pour effectuer ce retrait.', 400));
    }
    if (finalAmountCDF > 0 && wallet.balanceCDF < finalAmountCDF) {
      return next(new AppError('Solde CDF insuffisant pour effectuer ce retrait.', 400));
    }

    // Enregistrer la transaction de retrait (souvent en PENDING en attendant la validation de l'opérateur)
    await prisma.transaction.create({
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

    // Déduire les montants du solde du portefeuille
    const updatedWallet = await prisma.wallet.update({
      where: { id: wallet.id },
      data: {
        balanceUSD: { decrement: finalAmountUSD },
        balanceCDF: { decrement: finalAmountCDF },
      },
      include: { 
        transactions: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        } 
      },
    });

    res.status(200).json({
      success: true,
      message: 'Demande de retrait enregistrée avec succès.',
      data: updatedWallet,
    });
  } catch (error: any) {
    next(error);
  }
};