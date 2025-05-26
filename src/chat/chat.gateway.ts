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

//       this.logger.log(`Client connected: ${client.id}, User: ${payload.id}`);

//       client.emit('connected', {
//         userId: payload.id,
//         onlineUsers: Array.from(this.connectedUsers.keys()),
//       });

//       this.server.emit('userStatus', { userId: payload.id, status: 'online' });
//     } catch (error) {
//       this.logger.error(`Authentication error: ${error.message}`);
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

//   @SubscribeMessage('sendMessage')
//   async handleSendMessage(
//     client: Socket,
//     payload: { recipientId?: string; receiverEmail?: string; content: string },
//   ): Promise<void> {
//     const senderId = client.data.user.id;
//     const recipientId = payload.recipientId?.trim();
//     const receiverEmail = payload.receiverEmail?.trim();
//     const content = payload.content?.trim();

//     // Validate inputs
//     if (!recipientId && !receiverEmail) {
//       client.emit('error', { message: 'Recipient ID or email is required' });
//       this.logger.error(
//         `Missing recipientId or receiverEmail: ${JSON.stringify(payload)}`,
//       );
//       return;
//     }
//     if (!content || content.length === 0) {
//       client.emit('error', { message: 'Message content cannot be empty' });
//       this.logger.error('Empty message content');
//       return;
//     }

//     // Verify recipient exists
//     let recipient;
//     if (receiverEmail) {
//       recipient = await this.prisma.user.findUnique({
//         where: { email: receiverEmail },
//       });
//     } else {
//       recipient = await this.prisma.user.findUnique({
//         where: { id: recipientId },
//       });
//     }

//     if (!recipient) {
//       client.emit('error', { message: 'Recipient does not exist' });
//       this.logger.error(`Recipient not found: ${recipientId || receiverEmail}`);
//       return;
//     }

//     const otherUserId = recipient.id;

//     // Prevent sending message to self
//     if (senderId === otherUserId) {
//       client.emit('error', { message: 'Cannot send message to yourself' });
//       this.logger.error(`User ${senderId} attempted to send message to self`);
//       return;
//     }

//     // Find or create ChatGroup
//     const userIds = [senderId, otherUserId].sort();
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
//         content,
//         emoji: '',
//         isRead: false,
//       },
//     });

//     // Calculate unread count for the recipient
//     const unreadCount = await this.prisma.message.count({
//       where: {
//         chatGroupId: chatGroup.id,
//         senderId: { not: otherUserId },
//         isRead: false,
//       },
//     });

//     // Fetch partner details for sender (recipient is the partner)
//     const senderPartner = await this.prisma.user.findUnique({
//       where: { id: otherUserId },
//       select: { id: true, name: true, image: true },
//     });

//     // Fetch partner details for recipient (sender is the partner)
//     const recipientPartner = await this.prisma.user.findUnique({
//       where: { id: senderId },
//       select: { id: true, name: true, image: true },
//     });

//     // Prepare chat data for sender
//     const senderChatData = {
//       chatGroupId: chatGroup.id,
//       partnerId: senderPartner?.id,
//       partnerName: senderPartner?.name,
//       partnerProfilePic: senderPartner?.image,
//       lastMessage: {
//         id: message.id,
//         content: message.content,
//         createdAt: message.createdAt.toISOString(),
//         isSentByUser: true, // Sender sent the message
//         senderId, // Include senderId for clarity
//       },
//       unreadCount,
//     };

//     // Prepare chat data for recipient
//     const recipientChatData = {
//       chatGroupId: chatGroup.id,
//       partnerId: recipientPartner?.id,
//       partnerName: recipientPartner?.name,
//       partnerProfilePic: recipientPartner?.image,
//       lastMessage: {
//         id: message.id,
//         content: message.content,
//         createdAt: message.createdAt.toISOString(),
//         isSentByUser: false, // Recipient did not send the message
//         senderId, // Include senderId for clarity
//       },
//       unreadCount,
//     };

//     // Emit message and chat update to recipient if online
//     const recipientSocketId = this.connectedUsers.get(otherUserId);
//     console.log(recipientSocketId);
//     if (recipientSocketId) {
//       this.server.to(recipientSocketId).emit('message', {
//         id: message.id,
//         chatGroupId: message.chatGroupId,
//         senderId,
//         content: message.content,
//         createdAt: message.createdAt.toISOString(),
//       });
//       this.server.to(recipientSocketId).emit('chatUpdated', recipientChatData);
//     }

//     // Emit message and chat update to sender
//     client.emit('message', {
//       id: message.id,
//       chatGroupId: message.chatGroupId,
//       senderId,
//       content: message.content,
//       createdAt: message.createdAt.toISOString(),
//     });
//     client.emit('chatUpdated', senderChatData);

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
      this.logger.error(`Authentication error: ${error.message}`);
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

  @SubscribeMessage('sendMessage')
  async handleSendMessage(
    client: Socket,
    payload: {
      recipientId?: string;
      receiverEmail?: string;
      content: string;
      tempId?: string;
    },
  ): Promise<void> {
    const senderId = client.data.user.id;
    const recipientId = payload.recipientId?.trim();
    const receiverEmail = payload.receiverEmail?.trim();
    const content = payload.content?.trim();
    const tempId = payload.tempId?.trim(); // Get tempId from client

    // Validate inputs
    if (!recipientId && !receiverEmail) {
      client.emit('error', { message: 'Recipient ID or email is required' });
      this.logger.error(
        `Missing recipientId or receiverEmail: ${JSON.stringify(payload)}`,
      );
      return;
    }
    if (!content || content.length === 0) {
      client.emit('error', { message: 'Message content cannot be empty' });
      this.logger.error('Empty message content');
      return;
    }

    // Verify recipient exists
    let recipient;
    if (receiverEmail) {
      recipient = await this.prisma.user.findUnique({
        where: { email: receiverEmail },
      });
    } else {
      recipient = await this.prisma.user.findUnique({
        where: { id: recipientId },
      });
    }

    if (!recipient) {
      client.emit('error', { message: 'Recipient does not exist' });
      this.logger.error(`Recipient not found: ${recipientId || receiverEmail}`);
      return;
    }

    const otherUserId = recipient.id;

    // Prevent sending message to self
    if (senderId === otherUserId) {
      client.emit('error', { message: 'Cannot send message to yourself' });
      this.logger.error(`User ${senderId} attempted to send message to self`);
      return;
    }

    // Find or create ChatGroup
    const userIds = [senderId, otherUserId].sort();
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
        content,
        emoji: '',
        isRead: false,
      },
    });

    // Calculate unread count for the recipient
    const unreadCount = await this.prisma.message.count({
      where: {
        chatGroupId: chatGroup.id,
        senderId: { not: otherUserId },
        isRead: false,
      },
    });

    // Fetch partner details for sender (recipient is the partner)
    const senderPartner = await this.prisma.user.findUnique({
      where: { id: otherUserId },
      select: { id: true, name: true, image: true },
    });

    // Fetch partner details for recipient (sender is the partner)
    const recipientPartner = await this.prisma.user.findUnique({
      where: { id: senderId },
      select: { id: true, name: true, image: true },
    });

    // Prepare chat data for sender
    const senderChatData = {
      chatGroupId: chatGroup.id,
      partnerId: senderPartner?.id,
      partnerName: senderPartner?.name,
      partnerProfilePic: senderPartner?.image,
      lastMessage: {
        id: message.id,
        content: message.content,
        createdAt: message.createdAt.toISOString(),
        senderId,
        tempId, // Include tempId for sender to match pending message
        emoji: message.emoji || '',
      },
      unreadCount,
    };

    // Prepare chat data for recipient
    const recipientChatData = {
      chatGroupId: chatGroup.id,
      partnerId: recipientPartner?.id,
      partnerName: recipientPartner?.name,
      partnerProfilePic: recipientPartner?.image,
      lastMessage: {
        id: message.id,
        content: message.content,
        createdAt: message.createdAt.toISOString(),
        senderId,
        emoji: message.emoji || '',
        // Do not include tempId for recipient
      },
      unreadCount,
    };

    // Emit message and chat update to recipient if online
    const recipientSocketId = this.connectedUsers.get(otherUserId);
    if (recipientSocketId) {
      this.server.to(recipientSocketId).emit('message', {
        id: message.id,
        chatGroupId: message.chatGroupId,
        senderId,
        content: message.content,
        createdAt: message.createdAt.toISOString(),
        emoji: message.emoji || '',
      });
      this.server.to(recipientSocketId).emit('chatUpdated', recipientChatData);
    }

    // Emit message and chat update to sender
    client.emit('message', {
      id: message.id,
      chatGroupId: message.chatGroupId,
      senderId,
      content: message.content,
      createdAt: message.createdAt.toISOString(),
      emoji: message.emoji || '',
      tempId, // Include tempId for sender
    });
    client.emit('chatUpdated', senderChatData);

    this.logger.log(`Message sent from ${senderId} to group ${chatGroup.id}`);
  }
}
