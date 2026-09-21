import { IsNotEmpty, IsOptional, IsString, ValidateNested } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { RegisterDeviceDto } from '../../notifications/dto/notification.dto.js';

export class AppleSignUpDto {
  @ApiProperty({ description: 'Apple identity token (JWT)' })
  @IsString({ message: 'identityToken must be a string' })
  @IsNotEmpty({ message: 'identityToken is required' })
  identityToken: string;

  @ApiPropertyOptional({ description: 'Given name from the Apple credential (sent only on first authorize)' })
  @IsOptional()
  @IsString({ message: 'firstName must be a string' })
  firstName?: string;

  @ApiPropertyOptional({ description: 'Family name from the Apple credential (sent only on first authorize)' })
  @IsOptional()
  @IsString({ message: 'lastName must be a string' })
  lastName?: string;
}

export class AppleLoginDto {
  @ApiProperty({ description: 'Apple identity token (JWT)' })
  @IsString({ message: 'identityToken must be a string' })
  @IsNotEmpty({ message: 'identityToken is required' })
  identityToken: string;

  @ApiPropertyOptional({
    description: 'Optional push device registration to bind this login session to the current device',
    type: RegisterDeviceDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => RegisterDeviceDto)
  device?: RegisterDeviceDto;
}
