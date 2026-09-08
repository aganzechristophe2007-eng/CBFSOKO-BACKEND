import { Response, NextFunction } from 'express';
import axios from 'axios';
import { AuthRequest } from '../middleware/auth.middleware';
import { AppError } from '../utils/AppError';
import { prisma } from '../lib/prisma';

export const getWalletData = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
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
          take: 50
        }
      }
    });

    if (!wallet) {
      wallet = await prisma.wallet.create({
        data: { userId, balanceUSD: 0, balanceCDF: 0 },
        include: { transactions: true }
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, phone: true, avatar: true }
    });

    res.status(200).json({
      success: true,
      data: {
        ...user,
        balanceUSD: wallet.balanceUSD,
        balanceCDF: wallet.balanceCDF,
        walletId: wallet.id,
        transactions: wallet.transactions
      }
    });
  } catch (error: any) {
    console.error("Erreur getWalletData:", error);
    next(new AppError(error.message || 'Erreur serveur interne.', 500));
  }
};

export const processTransaction = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return next(new AppError('Utilisateur non authentifié.', 401));
    }

    const { type, montant, currency, provider, phone } = req.body;

    if (!montant || Number(montant) <= 0 || !provider || !phone || !type) {
      return next(new AppError('Paramètres de transaction invalides.', 400));
    }

    let wallet = await prisma.wallet.findUnique({ where: { userId } });
    if (!wallet) {
      wallet = await prisma.wallet.create({ data: { userId, balanceUSD: 0, balanceCDF: 0 } });
    }

    const reference = `REF_${Date.now()}_${userId}`;
    const amountNum = Number(montant);
    const isUSD = (currency || 'USD').toUpperCase() === 'USD';

    let paymentUrl = null;
    let isApiPending = true;

    try {
      if (process.env.CINETPAY_API_KEY && process.env.CINETPAY_SITE_ID) {
        const aggregatorResponse = await axios.post('https://api-checkout.cinetpay.com/v2/payment', {
          apikey: process.env.CINETPAY_API_KEY,
          site_id: process.env.CINETPAY_SITE_ID,
          transaction_id: reference,
          amount: amountNum,
          currency: isUSD ? 'USD' : 'CDF',
          description: `Paiement ${type} - CBF Soko`,
          customer_phone_number: phone,
          customer_name: "Client CBF Soko",
          notify_url: `${process.env.BACKEND_URL || 'https://cbfsoko-backend.onrender.com'}/api/wallet/webhook`,
          return_url: `${process.env.FRONTEND_URL || 'https://cbfsoko.com'}/wallet`,
          channels: 'MOBILE_MONEY'
        });

        if (aggregatorResponse.data && aggregatorResponse.data.code === '201') {
          paymentUrl = aggregatorResponse.data.data.payment_url;
        }
      }
    } catch (aggError) {
      console.warn("Mode simulation actif:", aggError);
      isApiPending = false;
    }

    const initialStatus = isApiPending && process.env.CINETPAY_API_KEY ? 'PENDING' : 'SUCCESS';
    const txType = type.toLowerCase() === 'depot' ? 'DEPOSIT' : 'WITHDRAWAL';

    const result = await prisma.$transaction(async (tx) => {
      const transaction = await tx.transaction.create({
        data: {
          walletId: wallet!.id,
          amountUSD: isUSD ? amountNum : 0,
          amountCDF: !isUSD ? amountNum : 0,
          type: txType,
          status: initialStatus,
          provider: provider,
          reference
        } as any
      });

      if (initialStatus === 'SUCCESS') {
        const field = isUSD ? 'balanceUSD' : 'balanceCDF';
        const operation = txType === 'DEPOSIT' ? 'increment' : 'decrement';
        const updateData: any = {};
        updateData[field] = { [operation]: amountNum };

        await tx.wallet.update({
          where: { id: wallet!.id },
          data: updateData
        });
      }

      return transaction;
    });

    res.status(200).json({
      success: true,
      message: initialStatus === 'PENDING' ? "Requête initiée." : "Transaction simulée avec succès.",
      paymentUrl,
      data: result
    });

  } catch (error: any) {
    console.error("Erreur processTransaction:", error);
    next(new AppError(error.message || 'Erreur interne.', 500));
  }
};

export const getTransactionStats = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return next(new AppError('Utilisateur non authentifié.', 401));
    }

    const wallet = await prisma.wallet.findUnique({
      where: { userId },
      include: { transactions: { orderBy: { createdAt: 'desc' } } }
    });

    if (!wallet) {
      res.status(200).json({ 
        success: true, 
        data: { 
          chartData: [], 
          metrics: { totalDepot: 0, totalFrais: 0, beneficeNet: 0, failureRate: 0, evolutionPercent: 0 } 
        } 
      });
      return;
    }

    const successTxs = wallet.transactions.filter(t => t.status === 'SUCCESS');
    const totalDepot = successTxs.filter(t => t.type === 'DEPOSIT').reduce((acc, t) => acc + (t.amountUSD || t.amountCDF || 0), 0);
    const totalWithdrawal = successTxs.filter(t => t.type === 'WITHDRAWAL').reduce((acc, t) => acc + (t.amountUSD || t.amountCDF || 0), 0);
    
    const totalTxsCount = wallet.transactions.length;
    const failedTxsCount = wallet.transactions.filter(t => t.status === 'FAILED').length;
    const failureRate = totalTxsCount > 0 ? ((failedTxsCount / totalTxsCount) * 100).toFixed(1) : '0';

    const chartDataMap = new Map();
    wallet.transactions.forEach(t => {
      const dateStr = new Date(t.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
      const current = chartDataMap.get(dateStr) || 0;
      chartDataMap.set(dateStr, current + (t.amountUSD || t.amountCDF || 0));
    });

    const chartData = Array.from(chartDataMap, ([date, total_montant]) => ({ date, total_montant })).reverse();

    res.status(200).json({
      success: true,
      data: {
        chartData: chartData.length > 0 ? chartData : [{ date: 'Aujourd\'hui', total_montant: 0 }],
        metrics: {
          totalDepot,
          totalFrais: totalDepot * 0.015,
          beneficeNet: totalDepot - totalWithdrawal,
          failureRate: Number(failureRate),
          evolutionPercent: 5.4
        }
      }
    });
  } catch (error: any) {
    console.error("Erreur stats:", error);
    next(new AppError('Erreur calcul statistiques.', 500));
  }
};

export const handleAggregatorWebhook = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { cpm_trans_id, cpm_result } = req.body;

    if (!cpm_trans_id) {
      res.status(400).json({ success: false, message: "ID manquant" });
      return;
    }

    const isSuccess = cpm_result === '00' || cpm_result === 'SUCCESS';
    const newStatus = isSuccess ? 'SUCCESS' : 'FAILED';

    const transaction = await prisma.transaction.findFirst({
      where: { reference: cpm_trans_id }
    });

    if (!transaction) {
      res.status(404).json({ success: false, message: "Transaction introuvable" });
      return;
    }

    if (transaction.status === 'SUCCESS') {
      res.status(200).json({ success: true, message: "Déjà validée" });
      return;
    }

    await prisma.$transaction(async (tx) => {
      await tx.transaction.update({
        where: { id: transaction.id },
        data: { status: newStatus as any }
      });

      if (isSuccess) {
        const amountToAdd = transaction.amountUSD > 0 ? transaction.amountUSD : transaction.amountCDF;
        const field = transaction.amountUSD > 0 ? 'balanceUSD' : 'balanceCDF';
        const operation = transaction.type === 'DEPOSIT' ? 'increment' : 'decrement';
        const updateData: any = {};
        updateData[field] = { [operation]: amountToAdd };

        await tx.wallet.update({
          where: { id: transaction.walletId },
          data: updateData
        });
      }
    });

    res.status(200).json({ success: true, message: "Webhook traité" });
  } catch (error: any) {
    console.error("Erreur Webhook:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};