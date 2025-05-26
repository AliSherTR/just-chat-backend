import {
  Controller,
  Get,
  Req,
  UseGuards,
  Delete,
  Param,
  Request,
  Query,
  Post,
  Patch,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

import {
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { ChatService } from './chat.service';
import { DeleteChatDto } from './dto/deletechat.dto';
import { DeleteMessageDto } from './dto/deletemessage.dto';

@ApiTags('Chats')
@ApiBearerAuth()
@Controller('chats')
export class ChatsController {
  constructor(private readonly chatsService: ChatService) {}

  @Get()
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Get all chats for the authenticated user' })
  @ApiResponse({
    status: 200,
    description: 'List of chats retrieved successfully',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getChats(@Req() req) {
    const userId = req.user.id;
    return this.chatsService.getAllChats(userId);
  }

  @Get(':chatGroupId')
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({
    summary: 'Get a single chat by ID for the authenticated user',
  })
  @ApiResponse({ status: 200, description: 'Chat retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Chat not found or unauthorized' })
  @ApiBearerAuth()
  async getSingleChat(
    @Request() req: any,
    @Param('chatGroupId') chatGroupId: string,
    @Query('limit') limit: string = '50',
    @Query('cursor') cursor?: string,
  ) {
    const userId = req.user.id;
    return this.chatsService.getSingleChat(
      userId,
      chatGroupId,
      parseInt(limit),
      cursor,
    );
  }

  @Delete(':chatGroupId')
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Delete a chat group and all its messages' })
  @ApiParam({
    name: 'chatGroupId',
    description: 'The ID of the chat group to delete',
    example: 'cld1234567890abcdef1234567890',
  })
  @ApiResponse({ status: 200, description: 'Chat deleted successfully' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden: User is not part of the chat',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async deleteChat(@Req() req, @Param() params: DeleteChatDto) {
    const userId = req.user.id;
    return this.chatsService.deleteChat(userId, params.chatGroupId);
  }

  @Delete('messages/:messageId')
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Delete a single message' })
  @ApiParam({
    name: 'messageId',
    description: 'The ID of the message to delete',
    example: '920d9b58-8ee8-45a0-8873-ac989065d6f6',
  })
  @ApiResponse({ status: 200, description: 'Message deleted successfully' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden: User is not the sender of the message',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async deleteMessage(@Req() req, @Param() params: DeleteMessageDto) {
    const userId = req.user.id;
    return this.chatsService.deleteMessage(userId, params.messageId);
  }

  @Patch('markMessagesAsRead')
  async markMessagesAsRead(@Param() params: any) {
    return this.chatsService.markMessagesAsRead(params.id);
  }
}
