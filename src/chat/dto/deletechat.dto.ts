import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class DeleteChatDto {
  @ApiProperty({
    description: 'The ID of the chat group to delete',
    example: 'cld1234567890abcdef1234567890',
    type: String,
  })
  @IsString()
  @IsNotEmpty()
  chatGroupId: string;
}
