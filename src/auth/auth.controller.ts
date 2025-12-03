import { Controller, Post, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody } from '@nestjs/swagger';
import { AuthService } from './auth.service.js';
import { Public } from './public.decorator.js';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
    constructor(private readonly authService: AuthService) {}

    @Post('google')
    @Public()
    @ApiOperation({ summary: 'Google OAuth login' })
    @ApiBody({ schema: { properties: { idtoken: { type: 'string' } } } })
    @ApiResponse({ status: 200, description: 'Login successful, returns JWT token' })
    @ApiResponse({ status: 401, description: 'Invalid token' })
    googleLogin(@Body() body: {idtoken: string}) {
        return this.authService.googleLogin(body.idtoken);
    }
}
