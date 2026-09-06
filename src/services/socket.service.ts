import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';

export let io: Server;

export const initSocket = (server: HttpServer) => {
  io = new Server(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST']
    }
  });

  io.on('connection', (socket: Socket) => {
    console.log(`Client connecté : ${socket.id}`);

    socket.on('join_room', (userId: string) => {
      socket.join(userId);
    });

    socket.on('send_message', (data) => {
      io.to(data.receiverId).emit('receive_message', data);
    });

    socket.on('disconnect', () => {
      console.log(`Client déconnecté : ${socket.id}`);
    });
  });
};
