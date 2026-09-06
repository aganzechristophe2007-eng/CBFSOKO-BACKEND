import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';

const router = Router();

// Récupérer la liste de toutes les catégories
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const categories = await prisma.category.findMany({
      orderBy: {
        name: 'asc',
      },
    });

    res.status(200).json(categories);
  } catch (error) {
    next(error);
  }
});

export default router;