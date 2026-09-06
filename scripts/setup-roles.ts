/// <reference types="node" />
import { PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function updateRoles() {
  // 1. Configurer mambofelicien@gmail.com en tant qu'ADMIN_FINANCE
  const hashedPasswordFelicien = await bcrypt.hash('Felicien1234', 10);
  await prisma.user.upsert({
    where: { email: 'mambofelicien@gmail.com' },
    update: { role: Role.ADMIN_FINANCE },
    create: {
      email: 'mambofelicien@gmail.com',
      passwordHash: hashedPasswordFelicien,
      name: 'Felicien Mambo',
      role: Role.ADMIN_FINANCE,
    },
  });
  console.log('✅ Admin Finances configuré : mambofelicien@gmail.com');

  // 2. Configurer benjaminkulimushi1@gmail.com en tant qu'intermédiaire / gestionnaire des ventes
  const hashedPasswordBenjamin = await bcrypt.hash('137905Ben', 10);
  await prisma.user.upsert({
    where: { email: 'benjaminkulimushi1@gmail.com' },
    update: { role: Role.SELLER }, // ou Role.USER selon ton besoin exact
    create: {
      email: 'benjaminkulimushi1@gmail.com',
      passwordHash: hashedPasswordBenjamin,
      name: 'Benjamin Kulimushi',
      role: Role.SELLER,
    },
  });
  console.log('✅ Intermédiaire Vente/Commission configuré : benjaminkulimushi1@gmail.com');
}

updateRoles()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });