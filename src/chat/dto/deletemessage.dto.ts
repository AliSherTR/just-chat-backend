import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsUUID } from 'class-validator';

export class DeleteMessageDto {
  @ApiProperty({
    description: 'The ID of the message to delete',
    example: '920d9b58-8ee8-45a0-8873-ac989065d6f6',
    type: String,
  })
  @IsString()
  @IsNotEmpty()
  @IsUUID('all', { message: 'Message ID must be a valid UUID' })
  messageId: string;
}
