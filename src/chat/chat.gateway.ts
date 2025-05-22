// import {
//   SubscribeMessage,
//   WebSocketGateway,
//   WebSocketServer,
// } from '@nestjs/websockets';
// import { Server, Socket } from 'socket.io';
// import { JwtService } from '@nestjs/jwt';
// import { Inject, Logger, UnauthorizedException } from '@nestjs/common';
// import { PrismaService } from 'src/prisma/prisma.service';

// @WebSocketGateway({
//   cors: { origin: '*' }, // Restrict to frontend URL in production
//   namespace: '/chat',
// })
// export class ChatGateway {
//   @WebSocketServer()
//   server: Server;
//   private readonly logger = new Logger(ChatGateway.name);
//   private connectedUsers: Map<string, string> = new Map(); // userId -> socketId

//   constructor(
//     @Inject(JwtService) private readonly jwtService: JwtService,
//     private readonly prisma: PrismaService,
//   ) {}

//   async handleConnection(client: Socket) {
//     try {
//       const rawToken =
//         client.handshake.headers.token || client.handshake.auth.token;
//       const token: string | undefined =
//         typeof rawToken === 'string'
//           ? rawToken
//           : Array.isArray(rawToken)
//             ? rawToken[0]
//             : undefined;
//       if (!token) {
//         throw new UnauthorizedException('No token provided');
//       }
//       const payload = this.jwtService.verify(token);
//       client.data.user = payload;
//       this.connectedUsers.set(payload.id, client.id);
//       console.log(this.connectedUsers);

//       this.logger.log(`Client connected: ${client.id}, User: ${payload.id}`);
//       client.emit('connected', {
//         userId: payload.id,
//         onlineUsers: Array.from(this.connectedUsers.keys()),
//       });
//       this.server.emit('userStatus', { userId: payload.id, status: 'online' });
//     } catch (error) {
//       console.error('Authentication error:', error.message);
//       client.emit('error', { message: 'Unauthorized' });
//       client.disconnect();
//     }
//   }

//   handleDisconnect(client: Socket) {
//     if (client.data.user) {
//       this.connectedUsers.delete(client.data.user.id);
//       this.server.emit('userStatus', {
//         userId: client.data.user.id,
//         status: 'offline',
//       });
//       this.logger.log(`Client disconnected: ${client.id}`);
//     }
//   }

//   @SubscribeMessage('startChat')
//   async handleStartChat(
//     client: Socket,
//     payload: { recipientId: string },
//   ): Promise<void> {
//     const senderId = client.data.user.id;
//     const recipientId = payload.recipientId?.trim();
//     if (!recipientId || typeof recipientId !== 'string') {
//       client.emit('error', { message: 'Invalid recipient ID' });
//       this.logger.error('Invalid recipientId:', payload);
//       return;
//     }

//     // Find or create ChatGroup
//     const userIds = [senderId, recipientId].sort(); // Ensure consistent order
//     let chatGroup = await this.prisma.chatGroup.findUnique({
//       where: { user1Id_user2Id: { user1Id: userIds[0], user2Id: userIds[1] } },
//     });

//     if (!chatGroup) {
//       chatGroup = await this.prisma.chatGroup.create({
//         data: { user1Id: userIds[0], user2Id: userIds[1] },
//       });
//     }

//     const recipientSocketId = this.connectedUsers.get(recipientId);
//     if (!recipientSocketId) {
//       client.emit('error', { message: 'Recipient is not online' });
//       return;
//     }

//     client.emit('chatStarted', {
//       with: recipientId,
//       chatGroupId: chatGroup.id,
//     });
//     this.server
//       .to(recipientSocketId)
//       .emit('chatStarted', { with: senderId, chatGroupId: chatGroup.id });
//     this.logger.log(
//       `Chat started between ${senderId} and ${recipientId} in group ${chatGroup.id}`,
//     );
//   }

//   @SubscribeMessage('sendMessage')
//   async handleSendMessage(
//     client: Socket,
//     payload: { recipientId: string; content: string },
//   ): Promise<void> {
//     const senderId = client.data.user.id;
//     const recipientId = payload.recipientId?.trim();
//     if (!recipientId || typeof recipientId !== 'string') {
//       client.emit('error', { message: 'Invalid recipient ID' });
//       this.logger.error('Invalid recipientId:', payload);
//       return;
//     }
//     if (!payload.content || payload.content.trim().length === 0) {
//       client.emit('error', { message: 'Message content cannot be empty' });
//       return;
//     }

//     // Find or create ChatGroup
//     const userIds = [senderId, recipientId].sort();
//     let chatGroup = await this.prisma.chatGroup.findUnique({
//       where: { user1Id_user2Id: { user1Id: userIds[0], user2Id: userIds[1] } },
//     });

//     if (!chatGroup) {
//       chatGroup = await this.prisma.chatGroup.create({
//         data: { user1Id: userIds[0], user2Id: userIds[1] },
//       });
//     }

//     // Save message to database
//     const message = await this.prisma.message.create({
//       data: {
//         chatGroupId: chatGroup.id,
//         senderId,
//         content: payload.content,
//         emoji: '',
//       },
//     });

//     // Determine recipient (the other user in the chat group)
//     const otherUserId =
//       chatGroup.user1Id === senderId ? chatGroup.user2Id : chatGroup.user1Id;
//     const recipientSocketId = this.connectedUsers.get(otherUserId);

//     // Send message to recipient if online
//     if (recipientSocketId) {
//       this.server.to(recipientSocketId).emit('message', {
//         id: message.id,
//         chatGroupId: message.chatGroupId,
//         senderId,
//         content: message.content,
//         createdAt: message.createdAt,
//       });
//     }

//     // Send message back to sender for confirmation
//     client.emit('message', {
//       id: message.id,
//       chatGroupId: message.chatGroupId,
//       senderId,
//       content: message.content,
//       createdAt: message.createdAt,
//     });

//     this.logger.log(`Message sent from ${senderId} to group ${chatGroup.id}`);
//   }
// }

import {
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { Inject, Logger, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@WebSocketGateway({
  cors: { origin: '*' }, // Restrict to frontend URL in production
  namespace: '/chat',
})
export class ChatGateway {
  @WebSocketServer()
  server: Server;
  private readonly logger = new Logger(ChatGateway.name);
  private connectedUsers: Map<string, string> = new Map(); // userId -> socketId

  constructor(
    @Inject(JwtService) private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const rawToken =
        client.handshake.headers.token || client.handshake.auth.token;
      const token: string | undefined =
        typeof rawToken === 'string'
          ? rawToken
          : Array.isArray(rawToken)
            ? rawToken[0]
            : undefined;
      if (!token) {
        throw new UnauthorizedException('No token provided');
      }
      const payload = this.jwtService.verify(token);
      client.data.user = payload;
      this.connectedUsers.set(payload.id, client.id);
      this.logger.log(`Client connected: ${client.id}, User: ${payload.id}`);
      client.emit('connected', {
        userId: payload.id,
        onlineUsers: Array.from(this.connectedUsers.keys()),
      });
      this.server.emit('userStatus', { userId: payload.id, status: 'online' });
    } catch (error) {
      this.logger.error('Authentication error:', error.message);
      client.emit('error', { message: 'Unauthorized' });
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    if (client.data.user) {
      this.connectedUsers.delete(client.data.user.id);
      this.server.emit('userStatus', {
        userId: client.data.user.id,
        status: 'offline',
      });
      this.logger.log(`Client disconnected: ${client.id}`);
    }
  }

  @SubscribeMessage('startChat')
  async handleStartChat(
    client: Socket,
    payload: { recipientId: string },
  ): Promise<void> {
    const senderId = client.data.user.id;
    const recipientId = payload.recipientId?.trim();
    if (!recipientId || typeof recipientId !== 'string') {
      client.emit('error', { message: 'Invalid recipient ID' });
      this.logger.error('Invalid recipientId:', payload);
      return;
    }

    const userIds = [senderId, recipientId].sort();
    let chatGroup = await this.prisma.chatGroup.findUnique({
      where: { user1Id_user2Id: { user1Id: userIds[0], user2Id: userIds[1] } },
    });

    if (!chatGroup) {
      chatGroup = await this.prisma.chatGroup.create({
        data: { user1Id: userIds[0], user2Id: userIds[1] },
      });
    }

    const recipientSocketId = this.connectedUsers.get(recipientId);
    if (!recipientSocketId) {
      client.emit('error', { message: 'Recipient is not online' });
      return;
    }

    client.emit('chatStarted', {
      with: recipientId,
      chatGroupId: chatGroup.id,
    });
    this.server
      .to(recipientSocketId)
      .emit('chatStarted', { with: senderId, chatGroupId: chatGroup.id });
    this.logger.log(
      `Chat started between ${senderId} and ${recipientId} in group ${chatGroup.id}`,
    );
  }

  @SubscribeMessage('sendMessage')
  async handleSendMessage(
    client: Socket,
    payload: { recipientId: string; content: string },
  ): Promise<void> {
    const senderId = client.data.user.id;
    const recipientId = payload.recipientId?.trim();
    if (!recipientId || typeof recipientId !== 'string') {
      client.emit('error', { message: 'Invalid recipient ID' });
      this.logger.error('Invalid recipientId:', payload);
      return;
    }
    if (!payload.content || payload.content.trim().length === 0) {
      client.emit('error', { message: 'Message content cannot be empty' });
      return;
    }

    // Find or create ChatGroup
    const userIds = [senderId, recipientId].sort();
    let chatGroup = await this.prisma.chatGroup.findUnique({
      where: { user1Id_user2Id: { user1Id: userIds[0], user2Id: userIds[1] } },
    });

    if (!chatGroup) {
      chatGroup = await this.prisma.chatGroup.create({
        data: { user1Id: userIds[0], user2Id: userIds[1] },
      });
    }

    // Save message to database
    const message = await this.prisma.message.create({
      data: {
        chatGroupId: chatGroup.id,
        senderId,
        content: payload.content,
        emoji: '',
        isRead: false, // Mark as unread for recipient
      },
    });

    // Determine recipient (the other user in the chat group)
    const otherUserId =
      chatGroup.user1Id === senderId ? chatGroup.user2Id : chatGroup.user1Id;

    // Calculate unread count for the chat group
    const unreadCount = await this.prisma.message.count({
      where: {
        chatGroupId: chatGroup.id,
        senderId: { not: otherUserId }, // Messages not sent by recipient
        isRead: false,
      },
    });

    // Fetch partner details for the chat
    const partner = await this.prisma.user.findUnique({
      where: { id: otherUserId },
      select: { id: true, name: true, image: true },
    });

    // Prepare chat data to match getChats API response
    const chatData = {
      chatGroupId: chatGroup.id,
      partnerId: partner?.id,
      partnerName: partner?.name,
      partnerProfilePic: partner?.image,
      lastMessage: {
        id: message.id,
        content: message.content,
        emoji: message.emoji,
        createdAt: message.createdAt.toISOString(),
        isSentByUser: senderId === client.data.user.id,
      },
      unreadCount, // Include unread count
    };

    // Emit message to recipient if online
    const recipientSocketId = this.connectedUsers.get(otherUserId);
    if (recipientSocketId) {
      this.server.to(recipientSocketId).emit('message', {
        id: message.id,
        chatGroupId: message.chatGroupId,
        senderId,
        content: message.content,
        createdAt: message.createdAt.toISOString(),
      });
      this.server.to(recipientSocketId).emit('chatUpdated', chatData);
    }

    // Send message and chat update to sender
    client.emit('message', {
      id: message.id,
      chatGroupId: message.chatGroupId,
      senderId,
      content: message.content,
      createdAt: message.createdAt.toISOString(),
    });
    client.emit('chatUpdated', chatData);

    this.logger.log(`Message sent from ${senderId} to group ${chatGroup.id}`);
  }
}
