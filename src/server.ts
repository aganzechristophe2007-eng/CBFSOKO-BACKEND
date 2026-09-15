import express, { Application, Request, Response } from 'express';
import http from 'http';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import passport from 'passport';
import { Role } from '@prisma/client';

// Services & Middlewares
import { initSocket } from './services/socket.service';
import { errorMiddleware } from './middleware/error.middleware';
import { protect, restrictTo } from './middleware/auth.middleware';

// --- Imports directs et explicites des routeurs ---
import authRoutes from './routes/auth.routes';
import productRoutes from './routes/product.routes';
import adminRoutes from './routes/admin.routes';
import categoryRoutes from './routes/category.routes';
import orderRoutes from './routes/orderRoutes';
import walletRoutes from './routes/wallet.routes';
import messageRoutes from './routes/message.routes';
import notificationRoutes from './routes/notification.routes';
import followRoutes from './routes/follow.routes';
import cartRoutes from './routes/Cart.routes';

const app: Application = express();
const server = http.createServer(app);

// === 1. Configuration CORS Sécurisée ===
const allowedOrigins = [
  process.env.FRONTEND_URL || 'https://cbfsoko-bukavu.vercel.app',
  'http://localhost:3000',
  'http://localhost:5173',
];

app.use(
  cors({
    origin: (origin, callback) => {
      // Autoriser les requêtes sans origine (applications mobiles, curl) ou dans la liste d'autorisations
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(null, true); // Ajuster en callback(new Error('Non autorisé par CORS')) si strict
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// === 2. Middlewares de Parsing & Authentification ===
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(passport.initialize());

// === 3. Gestion des Fichiers Statiques ===
const uploadsDir = path.join(process.cwd(), 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Exposer les images avec restriction d'en-tête (désactive le sniffing de types MIME)
app.use(
  '/uploads',
  (req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    next();
  },
  express.static(uploadsDir)
);

// === 4. Initalisation du serveur Temps Réel (Socket.io) ===
initSocket(server);

// === 5. Montage des Routes d'API ===
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api', followRoutes);

// Vérouillage strict de l'Espace Administration
app.use(
  '/api/admin',
  protect as unknown as express.RequestHandler,
  restrictTo(Role.ADMIN, Role.SUPER_ADMIN, Role.ADMIN_FINANCE) as unknown as express.RequestHandler,
  adminRoutes
);

// === 6. Route de Santé & Diagnostics ===
app.get('/api/health', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'OK',
    project: 'CBFSOKO API',
    timestamp: new Date().toISOString(),
  });
});

app.get('/', (_req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    message: 'API CBFSOKO en ligne 🚀',
  });
});

// === 7. Gestion des routes non trouvées (404) & Erreurs ===
app.all('*', (req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    message: `La ressource '${req.originalUrl}' est introuvable sur ce serveur.`,
  });
});

app.use(errorMiddleware);

// === 8. Démarrage & Sécurisation des Crashes Serveur ===
const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`[CBFSOKO] Serveur démarré en mode ${process.env.NODE_ENV || 'development'} sur le port ${PORT}`);
});

// Prévenir l'arrêt brutal du serveur lors d'erreurs asynchrones non gérées
process.on('unhandledRejection', (reason: Error) => {
  console.error('[FATAL] Unhandled Rejection:', reason.message || reason);
});

process.on('uncaughtException', (error: Error) => {
  console.error('[FATAL] Uncaught Exception:', error.message);
  process.exit(1);
});

export default app;