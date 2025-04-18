import { Body, Controller, Post, Req, Res, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { SignUpDto } from './dto/signup.dto';
import { SignInDto } from './dto/signin.dto';
import { ApiBody, ApiOperation, ApiResponse } from '@nestjs/swagger';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('signup')
  @ApiOperation({ summary: 'Register a new user' })
  @ApiBody({ type: SignUpDto })
  @ApiResponse({ status: 201, description: 'User created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input or email already taken' })
  @UsePipes(ValidationPipe)
  async signUp(@Body() body: SignUpDto) {
    return await this.authService.signUp(
      body.name,
      body.email,
      body.password,
    );
  }

  @Post('signin')
  @ApiOperation({ summary: 'Login a user' })
  @ApiBody({ type: SignUpDto })
  @ApiResponse({ status: 200, description: 'User logged in successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  async signIn(@Body() body: SignInDto) {
    return this.authService.signIn(body.email , body.password);
  }

  @Post('signout')
  @UseGuards(AuthGuard("jwt"))
  @ApiOperation({ summary: 'Log out a user' })
  async singout(@Req() req: Request) {
    return this.authService.signOut(req);
  }
}
