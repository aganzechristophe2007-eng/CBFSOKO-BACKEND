import { Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthRequest } from '../middleware/auth.middleware';
import { AppError } from '../utils/AppError';

const prisma = new PrismaClient();

// Permet à l'Admin Gestion de confirmer la réception physique d'un colis/commande
export const confirmPackageReceived = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { orderId } = req.params; // ID de la commande ou du colis

    // Vérifier si la commande existe
    const order = await prisma.order.findUnique({
      where: { id: orderId }
    });

    if (!order) {
      return next(new AppError('Colis ou commande introuvable.', 404));
    }

    // Mettre à jour le statut du colis (ex: 'COLIS_RECU' ou 'RECEIVED')
    const updatedOrder = await prisma.order.update({
      where: { id: orderId },
      data: { 
        status: 'CONFIRMED', // Adapte selon les valeurs de ton Enum OrderStatus dans Prisma
        receivedAt: new Date() // Optionnel : pour tracer la date de réception
      }
    });

    return res.status(200).json({
      success: true,
      message: 'Réception du colis confirmée avec succès. Transmis au pôle financier.',
      data: updatedOrder
    });

  } catch (error) {
    next(error);
  }
};