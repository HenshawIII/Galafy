import { SetMetadata } from '@nestjs/common';

export const IS_ADMIN_PUBLIC_KEY = 'isAdminPublic';
export const AdminPublic = () => SetMetadata(IS_ADMIN_PUBLIC_KEY, true);
