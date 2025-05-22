import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { createResponse } from 'src/common/utils/reponse.utils';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class AuthService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly JwtService: JwtService,
  ) {}

  async findUserById(id: string) {
    const user = await this.prismaService.user.findUnique({
      where: {
        id,
      },
    });
    if (!user) {
      throw new BadRequestException(createResponse('error', 'Invalid Request'));
    }

    return { ...user, password: undefined };
  }

  async signUp(name: string, email: string, password: string) {
    const user = await this.prismaService.user.findUnique({
      where: {
        email,
      },
    });
    if (user) {
      throw new ConflictException(
        createResponse('error', 'Account already exists', null, [
          'Account already exists',
        ]),
      );
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = await this.prismaService.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        isLoggedIn: true,
      },
    });
    const token = await this.JwtService.signAsync({ id: newUser.id });
    return createResponse('success', 'Account Created Successfully', {
      access_token: token,
    });
  }

  async signIn(email: string, password: string) {
    const user = await this.prismaService.user.findUnique({
      where: {
        email,
      },
    });
    if (!user) {
      throw new UnauthorizedException(
        createResponse('error', 'Invalid Email or password', null, [
          'Invalid credentials',
        ]),
      );
    }
    // if (user.isLoggedIn) {
    //   throw new UnauthorizedException(
    //     createResponse('error', 'Account already logged in', null, [
    //       'Account already logged in',
    //     ]),
    //   );
    // }
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new ConflictException(
        createResponse('error', 'Invalid Email or Password', null, [
          'Invalid Email or Password',
        ]),
      );
    }

    await this.prismaService.user.update({
      where: {
        email: user.email,
      },
      data: {
        isLoggedIn: true,
      },
    });
    const token = await this.JwtService.signAsync({ id: user.id });
    return createResponse('success', 'Login Successful', {
      access_token: token,
    });
  }

  async signOut(req: any) {
    const user = await this.prismaService.user.findUnique({
      where: {
        id: req.user.id,
      },
    });

    if (!user) {
      throw new BadRequestException(createResponse('error', 'Invalid Request'));
    }

    if (!user.isLoggedIn) {
      throw new ConflictException(
        createResponse('error', 'Account already logged out'),
      );
    }

    await this.prismaService.user.update({
      where: {
        email: user.email,
      },
      data: {
        isLoggedIn: false,
      },
    });

    return createResponse('success', 'Logged Out Successfully');
  }

  async getProfileInfo(userId: string) {
    const user = await this.prismaService.user.findUnique({
      where: {
        id: userId,
      },
      select: {
        name: true,
        email: true,
        image: true,
        updatedAt: true,
        createdAt: true,
        id: true,
      },
    });

    if (!user) {
      throw new NotFoundException(createResponse('error', 'No User found'));
    }

    return createResponse('success', 'user details fetched successfully', user);
  }
}
