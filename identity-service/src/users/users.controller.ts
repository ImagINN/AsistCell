import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  Ip,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { UsersService } from './users.service';
import { AuditService } from '../audit/audit.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { GetUser } from '../common/decorators/get-user.decorator';

@Controller('api/v1/auth')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly auditService: AuditService,
  ) {}

  // PATCH /api/v1/auth/me
  @Patch('me')
  @HttpCode(HttpStatus.OK)
  updateMe(
    @GetUser('id') userId: string,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.usersService.updateProfile(userId, dto);
  }

  // GET /api/v1/auth/users  (Admin only)
  @Get('users')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  findAll() {
    return this.usersService.findAll();
  }

  // POST /api/v1/auth/users  (Admin only) — rolüyle birlikte hesap oluşturma
  @Post('users')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  createUser(
    @GetUser('id') actorId: string,
    @GetUser('email') actorEmail: string | null,
    @Ip() ip: string,
    @Body() dto: CreateUserDto,
  ) {
    return this.usersService.createUser(dto, actorId, actorEmail ?? undefined, ip);
  }

  // PATCH /api/v1/auth/users/:id/role  (Admin only)
  @Patch('users/:id/role')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  updateRole(
    @GetUser('id') actorId: string,
    @GetUser('email') actorEmail: string | null,
    @Ip() ip: string,
    @Param('id') id: string,
    @Body() dto: UpdateRoleDto,
  ) {
    return this.usersService.updateRole(id, dto.role, actorId, actorEmail ?? undefined, ip);
  }

  // GET /api/v1/auth/audit-logs  (Admin only)
  @Get('audit-logs')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  getAuditLogs(
    @Query('take') take?: string,
    @Query('skip') skip?: string,
  ) {
    return this.auditService.findAll(
      take ? parseInt(take, 10) : 50,
      skip ? parseInt(skip, 10) : 0,
    );
  }
}
