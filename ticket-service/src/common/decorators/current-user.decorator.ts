import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { JwtUser } from '../guards/jwt-auth.guard';

export const CurrentUser = createParamDecorator(
  (data: keyof JwtUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user: JwtUser = request.user;
    return data ? user?.[data] : user;
  },
);
