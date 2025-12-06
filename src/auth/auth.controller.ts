import { Controller, Post, Body, Request, UseGuards, ValidationPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody, ApiBearerAuth, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { AuthService } from './auth.service.js';
import { Public } from './public.decorator.js';
import { RefreshTokenDto } from './dto/refresh-token.dto.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
    constructor(private readonly authService: AuthService) {}

    @Post('google')
    @Public()
    @ApiOperation({ summary: 'Google OAuth login' })
    @ApiBody({ schema: { properties: { idtoken: { type: 'string' } } } })
    @ApiResponse({ 
        status: 200, 
        description: 'Login successful, returns access token and refresh token',
        schema: {
            example: {
                access_token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
                refresh_token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
                user: {
                    id: 'uuid',
                    email: 'user@example.com',
                    firstName: 'John',
                    lastName: 'Doe',
                }
            }
        }
    })
    @ApiResponse({ status: 401, description: 'Invalid token' })
    googleLogin(@Body() body: {idtoken: string}) {
        return this.authService.googleLogin(body.idtoken);
    }

    @Post('refresh')
    @Public()
    @ApiOperation({ summary: 'Refresh access token using refresh token' })
    @ApiBody({ type: RefreshTokenDto })
    @ApiResponse({ 
        status: 200, 
        description: 'Access token refreshed successfully',
        schema: {
            example: {
                access_token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
            }
        }
    })
    @ApiResponse({ status: 401, description: 'Invalid or expired refresh token' })
    refreshToken(@Body(ValidationPipe) refreshTokenDto: RefreshTokenDto) {
        return this.authService.refreshToken(refreshTokenDto.refreshToken);
    }

    @Post('logout')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth('bearer')
    @ApiOperation({ summary: 'Logout - invalidate refresh token' })
    @ApiResponse({ 
        status: 200, 
        description: 'Logged out successfully',
        schema: {
            example: {
                message: 'Logged out successfully',
            }
        }
    })
    @ApiUnauthorizedResponse({ description: 'Unauthorized - Invalid or expired token. Please log in again.' })
    logout(@Request() req: any) {
        const userId = req.user?.id;
        if (!userId) {
            throw new Error('User ID is required. Please ensure you are authenticated.');
        }
        return this.authService.logout(userId);
    }
}
