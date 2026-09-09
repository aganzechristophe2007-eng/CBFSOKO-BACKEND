import express, { Application, Request, Response, NextFunction } from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { errorMiddleware } from './middleware/error.middleware';
import passport from 'passport';

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
const server = http.createServer(app);

// S'assurer que le dossier public/uploads existe physiquement sur le serveur
const uploadsDir = path.join(process.cwd(), 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configuration de Socket.io pour la messagerie en temps réel et les appels audio/vidéo
const io = new Server(server, {
  cors: {
    origin: '*',
    credentials: true,
  }
});

app.use(cors({
  origin: '*',
  credentials: true,
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Initialisation indispensable de Passport pour Google/Facebook OAuth
app.use(passport.initialize());

// Rendre le dossier 'uploads' accessible publiquement de deux manières pour éviter les erreurs 404
app.use('/uploads', express.static(uploadsDir));
app.use('/public/uploads', express.static(uploadsDir));

app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/messages', messageRoutes);

// Gestion des WebSockets (Signalisation WebRTC et temps réel)
io.on('connection', (socket) => {
  console.log(`Utilisateur connecté via Socket.io : ${socket.id}`);

  // Enregistrement de l'utilisateur dans sa propre room basée sur son ID
  socket.on('register', (userId: string) => {
    if (userId) {
      socket.join(userId);
      console.log(`Socket ${socket.id} enregistré pour l'utilisateur ID: ${userId}`);
    }
  });

  // --- SIGNALISATION WEBRTC (Appels Audio / Vidéo) ---
  socket.on('call-user', (data: { to: string; offer: any; from: string; isVideo: boolean }) => {
    io.to(data.to).emit('incoming-call', {
      from: data.from,
      offer: data.offer,
      isVideo: data.isVideo
    });
  });

  socket.on('make-answer', (data: { to: string; answer: any }) => {
    io.to(data.to).emit('call-answered', {
      answer: data.answer
    });
  });

  socket.on('ice-candidate', (data: { to: string; candidate: any }) => {
    io.to(data.to).emit('ice-candidate', {
      candidate: data.candidate
    });
  });

  socket.on('end-call', (data: { to: string }) => {
    io.to(data.to).emit('call-ended');
  });

  socket.on('disconnect', () => {
    console.log(`Utilisateur déconnecté : ${socket.id}`);
  });
});

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

server.listen(PORT, () => {
  console.log(`Serveur CBFSOKO démarré et en ligne sur le port ${PORT}`);
});

export default app;