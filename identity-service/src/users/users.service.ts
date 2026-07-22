import { Injectable, NotFoundException } from '@nestjs/common';
import { Role, User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateProfileDto } from './dto/update-profile.dto';

type SafeUser = Omit<User, 'password'>;

const USER_SELECT = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  role: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  password: false,
} as const;

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

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
  async updateRole(id: string, role: Role): Promise<SafeUser> {
    await this.findById(id); // existence check

    return this.prisma.user.update({
      where: { id },
      data: { role },
      select: USER_SELECT,
    });
  }
}
