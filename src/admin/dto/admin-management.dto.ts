import { IsEmail, IsNotEmpty, IsString, IsOptional, IsEnum, IsBoolean, IsInt, Min, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { AdminRole } from '../../../generated/prisma/enums.js';

export class InviteAdminDto {
  @ApiProperty({ example: 'newadmin@example.com', description: 'Email address of the admin to invite' })
  @IsEmail({}, { message: 'Invalid email format' })
  @IsNotEmpty({ message: 'Email is required' })
  email: string;

  @ApiProperty({
    enum: AdminRole,
    example: AdminRole.COMPLIANCE,
    description: 'Admin role to assign',
  })
  @IsEnum(AdminRole, { message: 'Invalid admin role' })
  @IsNotEmpty({ message: 'Role is required' })
  role: AdminRole;
}

export class AcceptInviteDto {
  @ApiProperty({ example: 'invite-token-here', description: 'Invite token from email' })
  @IsString({ message: 'Token must be a string' })
  @IsNotEmpty({ message: 'Token is required' })
  token: string;

  @ApiProperty({ example: 'SecurePassword123!', description: 'Password for the admin account', minLength: 8 })
  @IsString({ message: 'Password must be a string' })
  @IsNotEmpty({ message: 'Password is required' })
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  password: string;
}

export class GetAdminsDto {
  @ApiProperty({ required: false, example: 1, description: 'Page number' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiProperty({ required: false, example: 20, description: 'Items per page' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 20;

  @ApiProperty({ required: false, example: 'admin@example.com', description: 'Search by email' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiProperty({ required: false, enum: AdminRole, description: 'Filter by role' })
  @IsOptional()
  @IsEnum(AdminRole)
  role?: AdminRole;

  @ApiProperty({ required: false, example: true, description: 'Filter by active status' })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateAdminDto {
  @ApiPropertyOptional({ enum: AdminRole, description: 'Admin role' })
  @IsOptional()
  @IsEnum(AdminRole)
  role?: AdminRole;

  @ApiPropertyOptional({ example: true, description: 'Active status' })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isActive?: boolean;
}

export class AssignRoleDto {
  @ApiProperty({ example: 'admin-uuid', description: 'Admin ID to assign role to' })
  @IsString({ message: 'Admin ID must be a string' })
  @IsNotEmpty({ message: 'Admin ID is required' })
  adminId: string;
}
