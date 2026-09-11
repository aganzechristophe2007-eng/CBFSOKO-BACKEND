import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import { prisma } from '../lib/prisma';

export let io: Server;

// userId -> Set de socketId (gère plusieurs onglets / appareils connectés en même temps)
const onlineUsers = new Map<string, Set<string>>();

// Utilitaire exporté pour émettre depuis les routes REST (ex: envoi média, résumé d'appel)
export function emitToUser(userId: string, event: string, payload: any) {
  if (io) io.to(userId).emit(event, payload);
}

export function getOnlineUserIds(): string[] {
  return Array.from(onlineUsers.keys());
}

export const initSocket = (server: HttpServer) => {
  io = new Server(server, {
    cors: {
      origin: '*',
      credentials: true,
    }
  });

  io.on('connection', (socket: Socket) => {
    let registeredUserId: string | null = null;

    // === Présence en ligne réelle ===
    socket.on('register', (userId: string) => {
      if (!userId) return;
      registeredUserId = userId;
      socket.join(userId);

      if (!onlineUsers.has(userId)) {
        onlineUsers.set(userId, new Set());
      }
      onlineUsers.get(userId)!.add(socket.id);

      io.emit('user-online', { userId });
      socket.emit('online-users', { userIds: getOnlineUserIds() });
    });

    socket.on('get-online-users', () => {
      socket.emit('online-users', { userIds: getOnlineUserIds() });
    });

    // === Envoi de message texte en temps réel ===
    socket.on('send-message', async (data: { receiverId: string; content: string; tempId?: string }) => {
      try {
        const senderId = registeredUserId;
        const { receiverId, content, tempId } = data || {};

        if (!senderId || !receiverId || !content?.trim()) return;

        const sender = await prisma.user.findUnique({ where: { id: senderId } });
        const isAdminOrFinance = ['ADMIN', 'SUPER_ADMIN', 'ADMIN_FINANCE'].includes(sender?.role || '');

        if (!isAdminOrFinance) {
          const isConnected = await prisma.contactRequest.findFirst({
            where: {
              status: 'ACCEPTED',
              OR: [
                { senderId, receiverId },
                { senderId: receiverId, receiverId: senderId }
              ]
            }
          });
          if (!isConnected) {
            socket.emit('message-error', { tempId, message: "Vous devez d'abord être en contact pour envoyer un message." });
            return;
          }
        }

        const newMessage = await prisma.message.create({
          data: { senderId, receiverId, content, isRead: false },
          include: {
            sender: { select: { id: true, name: true, avatar: true } },
            receiver: { select: { id: true, name: true, avatar: true } }
          }
        });

        // Confirmation instantanée à l'expéditeur (remplace le message optimiste par le vrai)
        io.to(senderId).emit('new-message', { ...newMessage, tempId });
        // Livraison instantanée au destinataire s'il est connecté
        io.to(receiverId).emit('new-message', newMessage);
      } catch {
        socket.emit('message-error', { tempId: data?.tempId, message: "Erreur d'envoi du message." });
      }
    });

    // === Indicateur "en train d'écrire" ===
    socket.on('typing', (data: { receiverId: string }) => {
      if (!registeredUserId || !data?.receiverId) return;
      io.to(data.receiverId).emit('typing', { senderId: registeredUserId });
    });

    socket.on('stop-typing', (data: { receiverId: string }) => {
      if (!registeredUserId || !data?.receiverId) return;
      io.to(data.receiverId).emit('stop-typing', { senderId: registeredUserId });
    });

    // === Accusé de lecture ("vu") ===
    socket.on('message-seen', async (data: { otherUserId: string }) => {
      try {
        if (!registeredUserId || !data?.otherUserId) return;

        await prisma.message.updateMany({
          where: {
            senderId: data.otherUserId,
            receiverId: registeredUserId,
            isRead: false
          },
          data: { isRead: true }
        });

        io.to(data.otherUserId).emit('messages-seen', { by: registeredUserId });
      } catch {
        // silencieux
      }
    });

    // --- SIGNALISATION WEBRTC (Appels) — reprise à l'identique de server.ts ---
    socket.on('call-user', (data: { to: string; offer: any; from: string; isVideo: boolean }) => {
      io.to(data.to).emit('incoming-call', { from: data.from, offer: data.offer, isVideo: data.isVideo });
    });

    socket.on('make-answer', (data: { to: string; answer: any }) => {
      io.to(data.to).emit('call-answered', { answer: data.answer });
    });

    socket.on('ice-candidate', (data: { to: string; candidate: any }) => {
      io.to(data.to).emit('ice-candidate', { candidate: data.candidate });
    });

    socket.on('end-call', (data: { to: string }) => {
      io.to(data.to).emit('call-ended');
    });

    // === Déconnexion ===
    socket.on('disconnect', () => {
      if (registeredUserId && onlineUsers.has(registeredUserId)) {
        const sockets = onlineUsers.get(registeredUserId)!;
        sockets.delete(socket.id);
        if (sockets.size === 0) {
          onlineUsers.delete(registeredUserId);
          io.emit('user-offline', { userId: registeredUserId });
        }
      }
    });
  });
};