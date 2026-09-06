import { PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcryptjs';
import * as readline from 'readline';

const prisma = new PrismaClient();
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

async function main() {
  console.log('--- CRÉATION DU COMPTE SUPER ADMINISTRATEUR CBFSOKO ---');
  
  rl.question('Nom complet : ', (name) => {
    rl.question('Email : ', (email) => {
      rl.question('Mot de passe : ', async (password) => {
        try {
          const hashedPassword = await bcrypt.hash(password, 12);
          const admin = await prisma.user.create({
            data: {
              name,
              email,
              passwordHash: hashedPassword,
              role: Role.SUPER_ADMIN
            }
          });
          console.log(`\nSuccès ! Super Administrateur créé avec l'ID : ${admin.id}`);
        } catch (error) {
          console.error('Erreur lors de la création :', error);
        } finally {
          await prisma.$disconnect();
          rl.close();
        }
      });
    });
  });
}

main();
