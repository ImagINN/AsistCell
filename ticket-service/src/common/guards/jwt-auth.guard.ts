import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

export interface JwtUser {
  sub: string;
  email: string;
  role: string;
  iss: string;
}

// Kong JWT plugin token'ı gateway seviyesinde doğrular, ancak servis
// x-user-* header'larına güvenmek yerine token'ı kendisi de doğrular
// (defense in depth — servis doğrudan çağrılırsa da güvenli kalır).
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    // RabbitMQ (rpc) handler'ları HTTP auth kapsamı dışında
    if (context.getType() !== 'http') {
      return true;
    }

    // @Public() ile işaretlenen endpoint'ler (örn. health check) muaf
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const authHeader: string | undefined = request.headers['authorization'];

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing Bearer token');
    }

    const token = authHeader.slice('Bearer '.length);

    try {
      const payload = this.jwtService.verify<JwtUser>(token, {
        secret: process.env.JWT_ACCESS_SECRET,
      });
      request.user = payload;
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}
