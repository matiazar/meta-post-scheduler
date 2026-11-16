import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateIf,
} from 'class-validator';

export class AssignBrandDto {
  /** Id de la marca, o null para dejar la cuenta sin asignar */
  @ValidateIf((o: AssignBrandDto) => o.brandId !== null)
  @IsString()
  @IsNotEmpty()
  brandId: string | null;
}

export class ListSocialAccountsQuery {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  brandId?: string;

  /** ?unassigned=true: solo las cuentas sin marca */
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  unassigned?: boolean;
}
