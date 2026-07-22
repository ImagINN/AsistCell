import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Role, User } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { CreateUserDto } from './dto/create-user.dto';

type SafeUser = Omit<User, 'password' | 'failedLoginAttempts' | 'lockedUntil'>;

const USER_SELECT = {
  id: true,
  email: true,
  gsmNumber: true,
  firstName: true,
  lastName: true,
  role: true,
  specialties: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  password: false,
} as const;

@Injectable()
export class UsersService {
  private readonly SALT_ROUNDS = 12;

  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  // Admin'in rolüyle birlikte hesap oluşturması (temsilci/süpervizör)
  async createUser(dto: CreateUserDto, actorId: string, actorEmail?: string, ip?: string): Promise<SafeUser> {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }

    const hashedPassword = await bcrypt.hash(dto.password, this.SALT_ROUNDS);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        password: hashedPassword,
        firstName: dto.firstName,
        lastName: dto.lastName,
        role: dto.role,
        specialties: dto.specialties ?? [],
      },
      select: USER_SELECT,
    });

    this.audit.log({
      actorId,
      actorEmail,
      action: 'USER_CREATED',
      targetId: user.id,
      ipAddress: ip,
      success: true,
      detail: { email: user.email, role: user.role, specialties: user.specialties },
    });

    return user;
  }

  // Tüm kullanıcıları listele (Admin only)
  async findAll(): Promise<SafeUser[]> {
    return this.prisma.user.findMany({
      select: USER_SELECT,
      orderBy: { createdAt: 'desc' },
    });
  }

  // Tek kullanıcı bul
  async findById(id: string): Promise<SafeUser> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: USER_SELECT,
    });

    if (!user) {
      throw new NotFoundException(`User with id "${id}" not found`);
    }

    return user;
  }

  // Profil güncelle
  async updateProfile(id: string, dto: UpdateProfileDto): Promise<SafeUser> {
    await this.findById(id); // existence check

    return this.prisma.user.update({
      where: { id },
      data: dto,
      select: USER_SELECT,
    });
  }

  // Rol değiştir (Admin only)
  async updateRole(id: string, role: Role, actorId?: string, actorEmail?: string, ip?: string): Promise<SafeUser> {
    const before = await this.findById(id); // existence check

    const updated = await this.prisma.user.update({
      where: { id },
      data: { role },
      select: USER_SELECT,
    });

    this.audit.log({
      actorId,
      actorEmail,
      action: 'ROLE_UPDATED',
      targetId: id,
      ipAddress: ip,
      success: true,
      detail: { email: updated.email, from: before.role, to: role },
    });

    return updated;
  }
}
