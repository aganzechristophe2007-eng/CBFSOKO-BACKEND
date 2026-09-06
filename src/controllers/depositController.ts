import { Request, Response } from 'express';
import { PrismaClient, PaymentProvider } from '@prisma/client';
import { AuthRequest } from '../middleware/auth.middleware';

const prisma = new PrismaClient();

// 1. Initier un dépôt (Airtel, M-Pesa ou Orange Money)
export const initiateAirtelDeposit = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { amountUSD, amountCDF, phoneNumber, provider } = req.body; // provider optionnel, par défaut AIRTEL_MONEY

    if (!phoneNumber || (!amountUSD && !amountCDF)) {
      return res.status(400).json({ success: false, message: "Numéro de téléphone et montant requis." });
    }

    const selectedProvider: PaymentProvider = provider || 'AIRTEL_MONEY';
    const reference = `${selectedProvider}_DEP_${Date.now()}`;

    // Enregistrer la transaction en état PENDING
    const deposit = await prisma.deposit.create({
      data: {
        userId: userId!,
        amountUSD: amountUSD || 0,
        amountCDF: amountCDF || 0,
        provider: selectedProvider,
        phoneNumber,
        reference,
        status: 'PENDING'
      }
    });

    /* 
      TODO (Intégration Réelle API / Agrégateur) :
      Ici, tu fais un `fetch()` vers l'API de l'agrégateur de paiement (CinetPay, Maxicash, etc.).
      L'API va envoyer une requête USSD push sur le téléphone du client.
    */

    return res.status(200).json({
      success: true,
      message: `Requête de paiement ${selectedProvider} initiée. Veuillez valider sur votre téléphone.`,
      data: { reference, depositId: deposit.id }
    });

  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// 2. Webhook / Callback de confirmation (Corrigé avec Request, Response)
export const handleAirtelWebhook = async (req: Request, res: Response) => {
  try {
    // Les données envoyées par l'API de paiement après validation du code PIN
    const { reference, status } = req.body; // status = 'SUCCESS' ou 'FAILED'

    if (!reference) {
      return res.status(400).json({ success: false, message: "Référence de transaction manquante." });
    }

    const deposit = await prisma.deposit.findUnique({
      where: { reference }
    });

    if (!deposit || deposit.status === 'SUCCESS') {
      return res.status(400).json({ success: false, message: "Dépôt introuvable ou déjà traité." });
    }

    if (status !== 'SUCCESS') {
      await prisma.deposit.update({
        where: { reference },
        data: { status: 'FAILED' }
      });
      return res.status(200).json({ success: true, message: "Transaction marquée comme échouée." });
    }

    // Transaction atomique : Validation du dépôt et mise à jour du Wallet de l'utilisateur
    await prisma.$transaction(async (tx) => {
      // Mettre à jour le dépôt
      await tx.deposit.update({
        where: { reference },
        data: { status: 'SUCCESS' }
      });

      // Créditer le Wallet de l'utilisateur
      await tx.wallet.upsert({
        where: { userId: deposit.userId },
        update: {
          balanceUSD: { increment: deposit.amountUSD },
          balanceCDF: { increment: deposit.amountCDF },
        },
        create: {
          userId: deposit.userId,
          balanceUSD: deposit.amountUSD,
          balanceCDF: deposit.amountCDF,
        }
      });
    });

    return res.status(200).json({ success: true, message: "Dépôt confirmé et portefeuille crédité avec succès." });

  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
}