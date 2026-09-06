import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthRequest } from '../middleware/auth.middleware';

const prisma = new PrismaClient();

// Récupérer les commandes assignées à Benjamin (ou toutes si ADMIN_FINANCE)
export const getOrders = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const userRole = req.user?.role;

    let orders;
    if (userRole === 'ADMIN_FINANCE') {
      // L'admin finance voit tout pour superviser
      orders = await prisma.order.findMany({
        include: { buyer: true, agent: true, orderItems: true, delivery: true, payment: true },
        orderBy: { createdAt: 'desc' }
      });
    } else {
      // Benjamin (SELLER/AGENT) ne voit que ses commandes assignées
      orders = await prisma.order.findMany({
        where: { agentId: userId },
        include: { buyer: true, orderItems: true, delivery: true, payment: true },
        orderBy: { createdAt: 'desc' }
      });
    }

    return res.status(200).json({ success: true, data: orders });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Mettre à jour le statut d'une commande (ex: Benjamin valide la livraison/intermédiation)
export const updateOrderStatus = async (req: AuthRequest, res: Response) => {
  try {
    const { orderId } = req.params;
    const { status } = req.body; // PENDING, PROCESSING, DELIVERED, COMPLETED, CANCELLED

    const updatedOrder = await prisma.order.update({
      where: { id: orderId },
      data: { status },
    });

    return res.status(200).json({ 
      success: true, 
      message: 'Statut de la commande mis à jour avec succès', 
      data: updatedOrder 
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Valider le paiement final et libérer l'escrow (Réservé à Félicien - ADMIN_FINANCE)
export const validatePaymentAndCompleteOrder = async (req: AuthRequest, res: Response) => {
  try {
    const { orderId } = req.params;
    const userRole = req.user?.role;

    if (userRole !== 'ADMIN_FINANCE') {
      return res.status(403).json({ success: false, message: "Action réservée à l'administrateur financier." });
    }

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { payment: true, agent: true }
    });

    if (!order) {
      return res.status(404).json({ success: false, message: "Commande introuvable." });
    }

    if (order.status === 'CONFIRMED') {
      return res.status(400).json({ success: false, message: "Cette commande est déjà clôturée." });
    }

    // Transaction atomique : tout réussit ou tout s'annule
    const result = await prisma.$transaction(async (tx) => {
      // 1. Clôturer la commande
      const updatedOrder = await tx.order.update({
        where: { id: orderId },
        data: { status: 'CONFIRMED' },
      });

      // 2. Valider le paiement associé
      if (order.payment) {
        await tx.payment.update({
          where: { id: order.payment.id },
          data: { status: 'SUCCESS' },
        });
      }

      // 3. Créditer directement le portefeuille (Wallet) de l'intermédiaire (Benjamin)
      if (order.agentId) {
        await tx.wallet.upsert({
          where: { userId: order.agentId },
          update: {
            balanceUSD: { increment: order.totalUSD },
            balanceCDF: { increment: order.totalCDF },
          },
          create: {
            userId: order.agentId,
            balanceUSD: order.totalUSD,
            balanceCDF: order.totalCDF,
          }
        });
      }

      return updatedOrder;
    });

    return res.status(200).json({
      success: true,
      message: "Paiement validé, fonds libérés de l'escrow vers le portefeuille et commande clôturée.",
      data: result
    });

  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};