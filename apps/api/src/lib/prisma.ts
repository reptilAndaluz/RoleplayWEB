import { PrismaClient } from '@prisma/client';

// Patrón singleton para evitar agotamiento de sockets en recargas en caliente o instancias serverless
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
