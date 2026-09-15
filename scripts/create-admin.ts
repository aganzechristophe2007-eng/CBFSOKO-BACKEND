/// <reference types="node" />
import { password } from '@inquirer/prompts';

async function main() {
  const adminPassword = await password({
    message: 'Entrez le mot de passe du Super Admin :',
    mask: '*', // Affiche des '*' à chaque touche pressée
    validate: (input) => {
      if (input.length < 12) {
        return 'Le mot de passe doit contenir au moins 12 caractères.';
      }
      return true;
    },
  });

  console.log('Mot de passe saisi et validé avec succès.');
}

main();