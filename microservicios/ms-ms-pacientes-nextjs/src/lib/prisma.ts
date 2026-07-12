import { PrismaClient } from '@prisma/client';

// Singleton para evitar multiples instancias con el hot-reload de Next en dev.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
