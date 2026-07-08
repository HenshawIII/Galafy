import { IsNotEmpty, IsOptional, IsString, ValidateNested } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { RegisterDeviceDto } from '../../notifications/dto/notification.dto.js';

export class GoogleLoginDto {
  @ApiProperty({ description: 'Google ID token' })
  @IsString({ message: 'idtoken must be a string' })
  @IsNotEmpty({ message: 'idtoken is required' })
  idtoken: string;

  @ApiPropertyOptional({
    description: 'Optional push device registration to bind this login session to the current device',
    type: RegisterDeviceDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => RegisterDeviceDto)
  device?: RegisterDeviceDto;
}
