// import {
//   Injectable,
//   NotFoundException,
//   BadRequestException,
//   Logger,
// } from '@nestjs/common';
// import { PrismaService } from 'src/prisma/prisma.service';
// import { createResponse } from 'src/common/utils/reponse.utils';

// @Injectable()
// export class ChatService {
//   private readonly logger = new Logger(ChatService.name);

//   constructor(private readonly prismaService: PrismaService) {}

//   async getAllChats(userId: string) {
//     try {
//       const chatGroups = await this.prismaService.chatGroup.findMany({
//         where: {
//           OR: [{ user1Id: userId }, { user2Id: userId }],
//         },
//         include: {
//           user1: { select: { id: true, name: true, image: true } },
//           user2: { select: { id: true, name: true, image: true } },
//           messages: {
//             orderBy: { createdAt: 'desc' },
//             take: 1,
//             select: {
//               id: true,
//               content: true,
//               emoji: true,
//               createdAt: true,
//               senderId: true,
//             },
//           },
//         },
//       });

//       const chatList = chatGroups.map((group) => {
//         const partner = group.user1Id === userId ? group.user2 : group.user1;
//         const lastMessage = group.messages[0] || null;
//         return {
//           chatGroupId: group.id,
//           partnerId: partner.id,
//           partnerName: partner.name,
//           partnerProfilePic: partner.image,
//           lastMessage: lastMessage
//             ? {
//                 id: lastMessage.id,
//                 content: lastMessage.content,
//                 emoji: lastMessage.emoji,
//                 createdAt: lastMessage.createdAt,
//                 isSentByUser: lastMessage.senderId === userId,
//               }
//             : null,
//         };
//       });

//       chatList.sort((a, b) =>
//         a.lastMessage && b.lastMessage
//           ? new Date(b.lastMessage.createdAt).getTime() -
//             new Date(a.lastMessage.createdAt).getTime()
//           : 0,
//       );

//       return createResponse(
//         'success',
//         'Chats retrieved successfully',
//         chatList,
//       );
//     } catch (error) {
//       this.logger.error(
//         `Failed to retrieve chats for user ${userId}: ${error.message}`,
//         error.stack,
//       );
//       throw new BadRequestException(
//         createResponse('error', 'Failed to retrieve chats', null),
//       );
//     }
//   }

//   async getSingleChat(
//     userId: string,
//     chatGroupId: string,
//     limit = 50,
//     cursor?: string,
//   ) {
//     try {
//       // Check if the chat group exists and the user is a participant
//       const chatGroup = await this.prismaService.chatGroup.findFirst({
//         where: {
//           id: chatGroupId,
//           OR: [{ user1Id: userId }, { user2Id: userId }],
//         },
//         include: {
//           user1: { select: { id: true, name: true, image: true } },
//           user2: { select: { id: true, name: true, image: true } },
//         },
//       });

//       if (!chatGroup) {
//         this.logger.warn(
//           `Chat group ${chatGroupId} not found or user ${userId} not authorized`,
//         );
//         throw new NotFoundException(
//           createResponse(
//             'error',
//             'Chat not found or you are not authorized',
//             null,
//           ),
//         );
//       }

//       // Fetch messages for the chat group
//       const messages = await this.prismaService.message.findMany({
//         where: { chatGroupId },
//         orderBy: { createdAt: 'desc' },
//         take: limit,
//         skip: cursor ? 1 : 0,
//         cursor: cursor ? { id: cursor } : undefined,
//         select: {
//           id: true,
//           senderId: true,
//           content: true,
//           emoji: true,
//           createdAt: true,
//         },
//       });

//       const partnerUser =
//         chatGroup.user1Id === userId ? chatGroup.user2 : chatGroup.user1;

//       return createResponse('success', 'Chat retrieved successfully', {
//         chatGroupId,
//         partner: {
//           id: partnerUser.id,
//           name: partnerUser.name,
//           profilePic: partnerUser.image,
//         },
//         messages: messages.reverse(), // Reverse to show oldest first
//       });
//     } catch (error) {
//       this.logger.error(
//         `Failed to retrieve chat ${chatGroupId} for user ${userId}: ${error.message}`,
//         error.stack,
//       );
//       if (error instanceof NotFoundException) {
//         throw error;
//       }
//       throw new BadRequestException(
//         createResponse('error', 'Failed to retrieve chat', null),
//       );
//     }
//   }

//   async deleteChat(userId: string, chatGroupIds: string | string[]) {
//     try {
//       const ids = Array.isArray(chatGroupIds) ? chatGroupIds : [chatGroupIds];

//       if (ids.length === 0) {
//         this.logger.warn(
//           `No chat group IDs provided for deletion by user ${userId}`,
//         );
//         throw new BadRequestException(
//           createResponse('error', 'No chat groups specified', null),
//         );
//       }

//       // Validate that all chat groups exist and the user is a participant
//       const chatGroups = await this.prismaService.chatGroup.findMany({
//         where: {
//           id: { in: ids },
//           OR: [{ user1Id: userId }, { user2Id: userId }],
//         },
//         select: { id: true },
//       });

//       const foundIds = chatGroups.map((group) => group.id);
//       const missingIds = ids.filter((id) => !foundIds.includes(id));

//       if (missingIds.length > 0) {
//         this.logger.warn(
//           `Chat groups not found or unauthorized: ${missingIds.join(', ')}`,
//         );
//         throw new NotFoundException(
//           createResponse(
//             'error',
//             `Chat groups not found or you are not authorized: ${missingIds.join(', ')}`,
//             null,
//           ),
//         );
//       }

//       // Delete associated messages first (if not using onDelete: CASCADE)
//       await this.prismaService.message.deleteMany({
//         where: { chatGroupId: { in: foundIds } },
//       });

//       // Delete the chat groups
//       const result = await this.prismaService.chatGroup.deleteMany({
//         where: { id: { in: foundIds } },
//       });

//       this.logger.log(
//         `User ${userId} deleted ${result.count} chat groups: ${foundIds.join(', ')}`,
//       );

//       return createResponse(
//         'success',
//         `Successfully deleted ${result.count} chat(s)`,
//         null,
//       );
//     } catch (error) {
//       this.logger.error(
//         `Failed to delete chats for user ${userId}: ${error.message}`,
//         error.stack,
//       );
//       if (
//         error instanceof NotFoundException ||
//         error instanceof BadRequestException
//       ) {
//         throw error;
//       }
//       throw new BadRequestException(
//         createResponse('error', 'Failed to delete chats', null),
//       );
//     }
//   }

//   async deleteMessage(userId: string, messageIds: string | string[]) {
//     try {
//       const ids = Array.isArray(messageIds) ? messageIds : [messageIds];

//       if (ids.length === 0) {
//         this.logger.warn(
//           `No message IDs provided for deletion by user ${userId}`,
//         );
//         throw new BadRequestException(
//           createResponse('error', 'No messages specified', null),
//         );
//       }
//       const messages = await this.prismaService.message.findMany({
//         where: {
//           id: { in: ids },
//           senderId: userId,
//           chatGroup: {
//             OR: [{ user1Id: userId }, { user2Id: userId }],
//           },
//         },
//         select: { id: true },
//       });

//       const foundIds = messages.map((msg) => msg.id);
//       const missingIds = ids.filter((id) => !foundIds.includes(id));

//       if (missingIds.length > 0) {
//         this.logger.warn(`Messages not found`);
//         throw new NotFoundException(
//           createResponse('error', `Messages not found `, null),
//         );
//       }

//       // Delete the messages
//       const result = await this.prismaService.message.deleteMany({
//         where: { id: { in: foundIds } },
//       });

//       this.logger.log(
//         `User ${userId} deleted ${result.count} messages: ${foundIds.join(', ')}`,
//       );

//       return createResponse(
//         'success',
//         `Successfully deleted ${result.count} message(s)`,
//         null,
//       );
//     } catch (error) {
//       this.logger.error(
//         `Failed to delete messages for user ${userId}: ${error.message}`,
//         error.stack,
//       );
//       if (
//         error instanceof NotFoundException ||
//         error instanceof BadRequestException
//       ) {
//         throw error;
//       }
//       throw new BadRequestException(
//         createResponse(
//           'error',
//           'Failed to delete messages',
//           null,
//           error.message,
//         ),
//       );
//     }
//   }
// }

import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { createResponse } from 'src/common/utils/reponse.utils';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(private readonly prismaService: PrismaService) {}

  async getAllChats(userId: string) {
    try {
      const chatGroups = await this.prismaService.chatGroup.findMany({
        where: {
          OR: [{ user1Id: userId }, { user2Id: userId }],
        },
        include: {
          user1: { select: { id: true, name: true, image: true } },
          user2: { select: { id: true, name: true, image: true } },
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: {
              id: true,
              content: true,
              emoji: true,
              createdAt: true,
              senderId: true,
            },
          },
        },
      });

      const chatList = await Promise.all(
        chatGroups.map(async (group) => {
          const partner = group.user1Id === userId ? group.user2 : group.user1;
          const lastMessage = group.messages[0] || null;
          const unreadCount = await this.prismaService.message.count({
            where: {
              chatGroupId: group.id,
              senderId: { not: userId }, // Messages not sent by the user
              isRead: false,
            },
          });

          return {
            chatGroupId: group.id,
            partnerId: partner.id,
            partnerName: partner.name,
            partnerProfilePic: partner.image,
            lastMessage: lastMessage
              ? {
                  id: lastMessage.id,
                  content: lastMessage.content,
                  emoji: lastMessage.emoji,
                  createdAt: lastMessage.createdAt,
                  isSentByUser: lastMessage.senderId === userId,
                }
              : null,
            unreadCount, // Added unread count
          };
        }),
      );

      chatList.sort((a, b) =>
        a.lastMessage && b.lastMessage
          ? new Date(b.lastMessage.createdAt).getTime() -
            new Date(a.lastMessage.createdAt).getTime()
          : 0,
      );

      return createResponse(
        'success',
        'Chats retrieved successfully',
        chatList,
      );
    } catch (error) {
      this.logger.error(
        `Failed to retrieve chats for user ${userId}: ${error.message}`,
        error.stack,
      );
      throw new BadRequestException(
        createResponse('error', 'Failed to retrieve chats', null),
      );
    }
  }

  async getSingleChat(
    userId: string,
    chatGroupId: string,
    limit = 50,
    cursor?: string,
  ) {
    try {
      const chatGroup = await this.prismaService.chatGroup.findFirst({
        where: {
          id: chatGroupId,
          OR: [{ user1Id: userId }, { user2Id: userId }],
        },
        include: {
          user1: { select: { id: true, name: true, image: true } },
          user2: { select: { id: true, name: true, image: true } },
        },
      });

      if (!chatGroup) {
        this.logger.warn(
          `Chat group ${chatGroupId} not found or user ${userId} not authorized`,
        );
        throw new NotFoundException(
          createResponse(
            'error',
            'Chat not found or you are not authorized',
            null,
          ),
        );
      }

      const messages = await this.prismaService.message.findMany({
        where: { chatGroupId },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: cursor ? 1 : 0,
        cursor: cursor ? { id: cursor } : undefined,
        select: {
          id: true,
          senderId: true,
          content: true,
          emoji: true,
          createdAt: true,
          isRead: true, // Include isRead for completeness
        },
      });

      const partnerUser =
        chatGroup.user1Id === userId ? chatGroup.user2 : chatGroup.user1;

      return createResponse('success', 'Chat retrieved successfully', {
        chatGroupId,
        partner: {
          id: partnerUser.id,
          name: partnerUser.name,
          profilePic: partnerUser.image,
        },
        messages: messages.reverse().map((message) => ({
          id: message.id,
          senderId: message.senderId,
          content: message.content,
          emoji: message.emoji,
          createdAt: message.createdAt,
          isRead: message.isRead,
          isSentByUser: message.senderId === userId, // Added isSentByUser
        })),
      });
    } catch (error) {
      this.logger.error(
        `Failed to retrieve chat ${chatGroupId} for user ${userId}: ${error.message}`,
        error.stack,
      );
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new BadRequestException(
        createResponse('error', 'Failed to retrieve chat', null),
      );
    }
  }

  async deleteChat(userId: string, chatGroupIds: string | string[]) {
    try {
      const ids = Array.isArray(chatGroupIds) ? chatGroupIds : [chatGroupIds];

      if (ids.length === 0) {
        this.logger.warn(
          `No chat group IDs provided for deletion by user ${userId}`,
        );
        throw new BadRequestException(
          createResponse('error', 'No chat groups specified', null),
        );
      }

      const chatGroups = await this.prismaService.chatGroup.findMany({
        where: {
          id: { in: ids },
          OR: [{ user1Id: userId }, { user2Id: userId }],
        },
        select: { id: true },
      });

      const foundIds = chatGroups.map((group) => group.id);
      const missingIds = ids.filter((id) => !foundIds.includes(id));

      if (missingIds.length > 0) {
        this.logger.warn(
          `Chat groups not found or unauthorized: ${missingIds.join(', ')}`,
        );
        throw new NotFoundException(
          createResponse(
            'error',
            `Chat groups not found or you are not authorized: ${missingIds.join(', ')}`,
            null,
          ),
        );
      }

      await this.prismaService.message.deleteMany({
        where: { chatGroupId: { in: foundIds } },
      });

      const result = await this.prismaService.chatGroup.deleteMany({
        where: { id: { in: foundIds } },
      });

      this.logger.log(
        `User ${userId} deleted ${result.count} chat groups: ${foundIds.join(', ')}`,
      );

      return createResponse(
        'success',
        `Successfully deleted ${result.count} chat(s)`,
        null,
      );
    } catch (error) {
      this.logger.error(
        `Failed to delete chats for user ${userId}: ${error.message}`,
        error.stack,
      );
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      throw new BadRequestException(
        createResponse('error', 'Failed to delete chats', null),
      );
    }
  }

  async deleteMessage(userId: string, messageIds: string | string[]) {
    try {
      const ids = Array.isArray(messageIds) ? messageIds : [messageIds];

      if (ids.length === 0) {
        this.logger.warn(
          `No message IDs provided for deletion by user ${userId}`,
        );
        throw new BadRequestException(
          createResponse('error', 'No messages specified', null),
        );
      }
      const messages = await this.prismaService.message.findMany({
        where: {
          id: { in: ids },
          senderId: userId,
          chatGroup: {
            OR: [{ user1Id: userId }, { user2Id: userId }],
          },
        },
        select: { id: true },
      });

      const foundIds = messages.map((msg) => msg.id);
      const missingIds = ids.filter((id) => !foundIds.includes(id));

      if (missingIds.length > 0) {
        this.logger.warn(`Messages not found`);
        throw new NotFoundException(
          createResponse('error', `Messages not found`, null),
        );
      }

      const result = await this.prismaService.message.deleteMany({
        where: { id: { in: foundIds } },
      });

      this.logger.log(
        `User ${userId} deleted ${result.count} messages: ${foundIds.join(', ')}`,
      );

      return createResponse(
        'success',
        `Successfully deleted ${result.count} message(s)`,
        null,
      );
    } catch (error) {
      this.logger.error(
        `Failed to delete messages for user ${userId}: ${error.message}`,
        error.stack,
      );
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      throw new BadRequestException(
        createResponse(
          'error',
          'Failed to delete messages',
          null,
          error.message,
        ),
      );
    }
  }
}
