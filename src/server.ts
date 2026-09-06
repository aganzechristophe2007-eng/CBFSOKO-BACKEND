import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import path from 'path';
import { errorMiddleware } from './middleware/error.middleware';

// Utilisation d'un namespace import pour forcer la récupération du routeur sous-jacent
import * as authRoutesModule from './routes/auth.routes';
import * as productRoutesModule from './routes/product.routes';
import * as adminRoutesModule from './routes/admin.routes';
import * as categoryRoutesModule from './routes/category.routes';
import * as orderRoutesModule from './routes/orderRoutes';
import * as walletRoutesModule from './routes/wallet.routes';
import * as messageRoutesModule from './routes/message.routes';
import * as notificationRoutesModule from './routes/notification.routes';
const notificationRoutes = (notificationRoutesModule as any).default || notificationRoutesModule;
const authRoutes = (authRoutesModule as any).default || authRoutesModule;
const productRoutes = (productRoutesModule as any).default || productRoutesModule;
const adminRoutes = (adminRoutesModule as any).default || adminRoutesModule;
const categoryRoutes = (categoryRoutesModule as any).default || categoryRoutesModule;
const orderRoutes = (orderRoutesModule as any).default || orderRoutesModule;
const walletRoutes = (walletRoutesModule as any).default || walletRoutesModule;
const messageRoutes = (messageRoutesModule as any).default || messageRoutesModule;

const app: Application = express();

app.use(cors({
  origin: '*',
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rendre le dossier 'uploads' accessible publiquement
// IMPORTANT : ce chemin doit correspondre exactement à `uploadDir` défini dans auth.routes.ts
// (path.join(process.cwd(), 'public', 'uploads')), sinon les avatars uploadés retournent une 404.
app.use('/uploads', express.static(path.join(process.cwd(), 'public', 'uploads')));

app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/messages', messageRoutes);

app.get('/api/health', (req: Request, res: Response) => {
  res.status(200).json({ status: 'OK', project: 'CBFSOKO API', version: '1.0.0' });
});

app.get('/', (req: Request, res: Response) => {
  res.status(200).json({ 
    success: true, 
    message: 'API CBFSOKO en ligne 🚀' 
  });
});

app.all('*', (req: Request, res: Response, next: NextFunction) => {
  res.status(404).json({
    success: false,
    message: `Impossible de trouver ${req.originalUrl} sur ce serveur !`
  });
});

app.use(errorMiddleware);

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Serveur CBFSOKO démarré et en ligne sur le port ${PORT}`);
});

export default app;