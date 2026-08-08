import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class IosVersionQueryDto {
  @ApiProperty({
    example: '1.0.5',
    description: 'Current iOS app version installed on the client',
  })
  @IsString()
  @IsNotEmpty()
  version!: string;
}
