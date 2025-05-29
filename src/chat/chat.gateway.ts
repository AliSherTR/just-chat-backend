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

  @SubscribeMessage('startCall')
  async handleStartCall(
    client: Socket,
    payload: { recipientId: string },
  ): Promise<void> {
    const senderId = client.data.user.id;
    const recipientId = payload.recipientId?.trim();

    // Validate input
    if (!recipientId) {
      client.emit('error', { message: 'Recipient ID is required' });
      this.logger.error('Missing recipientId for call');
      return;
    }

    // Prevent calling self
    if (senderId === recipientId) {
      client.emit('error', { message: 'Cannot call yourself' });
      this.logger.error(`User ${senderId} attempted to call self`);
      return;
    }

    // Check if recipient exists in database
    const recipient = await this.prisma.user.findUnique({
      where: { id: recipientId },
    });

    if (!recipient) {
      client.emit('error', { message: 'Recipient does not exist' });
      this.logger.error(`Recipient not found: ${recipientId}`);
      return;
    }

    // Check if recipient is online
    const recipientSocketId = this.connectedUsers.get(recipientId);
    if (!recipientSocketId) {
      client.emit('error', { message: 'Recipient is offline' });
      this.logger.error(`Recipient ${recipientId} is offline`);
      return;
    }

    // Notify recipient of incoming call
    this.server.to(recipientSocketId).emit('incomingCall', {
      callerId: senderId,
      callerName: client.data.user.name || 'Unknown', // Optional: include name for UI
    });

    this.logger.log(`Call initiated from ${senderId} to ${recipientId}`);
  }

  @SubscribeMessage('offer')
  handleOffer(
    client: Socket,
    payload: { recipientId: string; offer: RTCSessionDescriptionInit },
  ): void {
    const senderId = client.data.user.id;
    const recipientId = payload.recipientId?.trim();
    const offer = payload.offer;

    // Validate input
    if (!recipientId) {
      client.emit('error', { message: 'Recipient ID is required' });
      this.logger.error('Missing recipientId for offer');
      return;
    }
    if (!offer) {
      client.emit('error', { message: 'Offer is required' });
      this.logger.error('Missing offer in payload');
      return;
    }

    // Check if recipient is online
    const recipientSocketId = this.connectedUsers.get(recipientId);
    if (!recipientSocketId) {
      client.emit('error', { message: 'Recipient is offline' });
      this.logger.error(`Recipient ${recipientId} is offline for offer`);
      return;
    }

    // Relay offer to recipient
    this.server.to(recipientSocketId).emit('offer', {
      callerId: senderId,
      offer,
    });
    this.logger.log(`Offer sent from ${senderId} to ${recipientId}`);
  }

  @SubscribeMessage('answer')
  handleAnswer(
    client: Socket,
    payload: { callerId: string; answer: RTCSessionDescriptionInit },
  ): void {
    const senderId = client.data.user.id;
    const callerId = payload.callerId?.trim();
    const answer = payload.answer;

    // Validate input
    if (!callerId) {
      client.emit('error', { message: 'Caller ID is required' });
      this.logger.error('Missing callerId for answer');
      return;
    }
    if (!answer) {
      client.emit('error', { message: 'Answer is required' });
      this.logger.error('Missing answer in payload');
      return;
    }

    // Check if caller is online
    const callerSocketId = this.connectedUsers.get(callerId);
    if (!callerSocketId) {
      client.emit('error', { message: 'Caller is offline' });
      this.logger.error(`Caller ${callerId} is offline for answer`);
      return;
    }

    // Relay answer to caller
    this.server.to(callerSocketId).emit('אר', {
      answer,
      answererId: senderId,
    });
    this.logger.log(`Answer sent from ${senderId} to ${callerId}`);
  }

  // Video Call: ICE Candidate Handler
  @SubscribeMessage('iceCandidate')
  handleIceCandidate(
    client: Socket,
    payload: { recipientId: string; candidate: RTCIceCandidateInit },
  ): void {
    const senderId = client.data.user.id;
    const recipientId = payload.recipientId?.trim();
    const candidate = payload.candidate;

    // Validate input
    if (!recipientId) {
      client.emit('error', { message: 'Recipient ID is required' });
      this.logger.error('Missing recipientId for ICE candidate');
      return;
    }
    if (!candidate) {
      client.emit('error', { message: 'ICE candidate is required' });
      this.logger.error('Missing candidate in payload');
      return;
    }

    // Check if recipient is online
    const recipientSocketId = this.connectedUsers.get(recipientId);
    if (!recipientSocketId) {
      client.emit('error', { message: 'Recipient is offline' });
      this.logger.error(
        `Recipient ${recipientId} is offline for ICE candidate`,
      );
      return;
    }

    // Relay ICE candidate to recipient
    this.server.to(recipientSocketId).emit('iceCandidate', {
      candidate,
      senderId,
    });
    this.logger.log(`ICE candidate sent from ${senderId} to ${recipientId}`);
  }

  // Video Call: End Call Handler
  @SubscribeMessage('endCall')
  handleEndCall(client: Socket, payload: { recipientId: string }): void {
    const senderId = client.data.user.id;
    const recipientId = payload.recipientId?.trim();

    // Validate input
    if (!recipientId) {
      client.emit('error', { message: 'Recipient ID is required' });
      this.logger.error('Missing recipientId for endCall');
      return;
    }

    // Check if recipient is online
    const recipientSocketId = this.connectedUsers.get(recipientId);
    if (!recipientSocketId) {
      client.emit('error', { message: 'Recipient is offline' });
      this.logger.error(`Recipient ${recipientId} is offline for endCall`);
      return;
    }

    // Notify recipient to end the call
    this.server.to(recipientSocketId).emit('callEnded', {
      senderId,
    });
    this.logger.log(`Call ended by ${senderId} for ${recipientId}`);
  }

  // Video Call: Reject Call Handler
  @SubscribeMessage('rejectCall')
  handleRejectCall(client: Socket, payload: { callerId: string }): void {
    const senderId = client.data.user.id;
    const callerId = payload.callerId?.trim();

    // Validate input
    if (!callerId) {
      client.emit('error', { message: 'Caller ID is required' });
      this.logger.error('Missing callerId for rejectCall');
      return;
    }

    // Check if caller is online
    const callerSocketId = this.connectedUsers.get(callerId);
    if (!callerSocketId) {
      client.emit('error', { message: 'Caller is offline' });
      this.logger.error(`Caller ${callerId} is offline for rejectCall`);
      return;
    }

    // Notify caller that the call was rejected
    this.server.to(callerSocketId).emit('callRejected', {
      rejecterId: senderId,
    });
    this.logger.log(`Call rejected by ${senderId} for ${callerId}`);
  }
}
