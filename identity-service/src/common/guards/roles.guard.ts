import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { AuditService } from '../../audit/audit.service';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private audit: AuditService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // Rol tanımlanmamışsa herkese açık
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const { user } = request;

    if (!requiredRoles.includes(user?.role)) {
      // Yetkisiz erişim denemeleri audit log'a yazılır
      this.audit.log({
        actorId: user?.id,
        actorEmail: user?.email ?? undefined,
        action: 'ACCESS_DENIED',
        ipAddress: request.ip,
        success: false,
        detail: {
          path: `${request.method} ${request.url}`,
          role: user?.role ?? null,
          requiredRoles,
        },
      });
      throw new ForbiddenException(
        'You do not have permission to perform this action',
      );
    }

    return true;
  }
}
