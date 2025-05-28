import { Body, Controller, Patch, Req, UseGuards } from '@nestjs/common';
import { UserService } from './user.service';
import { AuthGuard } from '@nestjs/passport';

@Controller('user')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Patch('update')
  @UseGuards(AuthGuard('jwt'))
  async updateProfile(@Body() body: any, @Req() req: any) {
    return await this.userService.updateProfileInformation(
      body.image,
      body.name,
      req.user.id,
    );
  }
}
