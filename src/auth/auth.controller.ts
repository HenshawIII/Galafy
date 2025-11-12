import { Controller, Post, Body } from '@nestjs/common';
import { AuthService } from './auth.service.js';

@Controller('auth')
export class AuthController {
    constructor(private readonly authService: AuthService) {}

    @Post('google')
    googleLogin(@Body() body: {idtoken: string}) {
        return this.authService.googleLogin(body.idtoken);
    }
}
