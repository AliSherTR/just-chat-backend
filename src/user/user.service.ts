import { Injectable, NotFoundException } from '@nestjs/common';
import { createResponse } from 'src/common/utils/reponse.utils';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class UserService {
  constructor(private prismaService: PrismaService) {}

  async updateProfileInformation(
    image: string,
    username: string,
    userId: string,
  ) {
    const existingUser = await this.prismaService.user.findUnique({
      where: {
        id: userId,
      },
    });

    if (!existingUser) {
      throw new NotFoundException(createResponse('error', 'No user found'));
    }

    const updatedUser = await this.prismaService.user.update({
      where: {
        id: existingUser?.id,
      },
      data: {
        image: image,
        name: username,
      },
      select: {
        email: true,
        name: true,
        image: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return createResponse('success', 'User Updated Successfully', updatedUser);
  }
}
