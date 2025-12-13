import { IsString, IsOptional, IsNotEmpty, IsDecimal, Min, ValidateIf } from 'class-validator';
import { ApiProperty, ApiPropertyOptional, ApiHideProperty } from '@nestjs/swagger';

export class CreateSprayDto {
  @ApiProperty({
    description: 'User ID of the receiver',
    example: 'uuid-of-receiver-user',
    required: true,
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  receiverUserId?: string;

  @ApiHideProperty()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  receiverParticipantId?: string;

  @ApiProperty({
    description: 'Spray amount as decimal string',
    example: '100.50',
  })
  @IsString()
  @IsNotEmpty()
  @IsDecimal({ decimal_digits: '0,2' }, { message: 'Amount must be a valid decimal with up to 2 decimal places' })
  amount: string;

  @ApiPropertyOptional({
    description: 'Optional note/message with the spray',
    example: 'Great performance!',
  })
  @IsOptional()
  @IsString()
  note?: string;

  // Validation: At least one of receiverUserId or receiverParticipantId must be provided
  @ValidateIf((o) => !o.receiverUserId && !o.receiverParticipantId)
  @IsNotEmpty({ message: 'Either receiverUserId or receiverParticipantId must be provided' })
  _receiverValidation?: never;
}

