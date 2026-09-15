import { PrismaClient } from '@prisma/client';
 
const prisma = new PrismaClient();
 
// Liste volontairement très large de catégories pour couvrir la quasi-totalité
// des besoins d'une marketplace généraliste (biens, services, immobilier,
// véhicules, emploi, agriculture...). Utilise `upsert` : le script est donc
// idempotent, tu peux le relancer sans jamais créer de doublons.
const CATEGORY_NAMES: string[] = [
  // --- Électronique & High-Tech ---
  'Téléphones & Tablettes',
  'Ordinateurs & Accessoires',
  'Télévisions & Home Cinéma',
  'Photographie & Vidéo',
  'Audio & Enceintes',
  'Jeux vidéo & Consoles',
  'Accessoires électroniques',
  'Énergie solaire & Générateurs',
  'Sécurité & Vidéosurveillance',
 
  // --- Mode & Beauté ---
  'Mode Homme',
  'Mode Femme',
  'Mode Enfant',
  'Chaussures',
  'Sacs & Bagagerie',
  'Bijoux & Montres',
  'Optique & Lunettes',
  'Beauté & Cosmétiques',
  'Coiffure & Soins capillaires',
  'Parfumerie',
 
  // --- Maison ---
  'Meubles & Décoration',
  'Électroménager',
  'Cuisine & Arts de la table',
  'Linge de maison',
  'Bricolage & Outillage',
  'Jardin & Extérieur',
  'Climatisation & Ventilation',
  'Plomberie & Sanitaire',
  'Matériaux de construction',
 
  // --- Véhicules ---
  'Voitures',
  'Motos & Scooters',
  'Vélos',
  'Camions & Véhicules utilitaires',
  'Pièces & Accessoires automobiles',
  'Bateaux & Nautisme',
 
  // --- Immobilier ---
  'Maisons à vendre',
  'Maisons à louer',
  'Appartements à louer',
  'Terrains',
  'Bureaux & Locaux commerciaux',
  'Location de salles & Événementiel',
 
  // --- Emploi & Services ---
  'Offres d\'emploi',
  'Services professionnels',
  'Cours & Formations',
  'Réparation & Maintenance',
  'Transport & Logistique',
  'Nettoyage & Entretien',
  'Traiteur & Restauration',
  'Photographie événementielle',
  'Services informatiques',
  'Services juridiques & Comptables',
 
  // --- Famille & Loisirs ---
  'Bébé & Puériculture',
  'Jouets & Jeux enfants',
  'Sport & Fitness',
  'Camping & Randonnée',
  'Livres & Papeterie',
  'Instruments de musique',
  'Films, Musique & Divertissement',
  'Art & Artisanat',
  'Antiquités & Collections',
 
  // --- Animaux & Agriculture ---
  'Animaux & Accessoires',
  'Agriculture & Élevage',
  'Matériel agricole',
 
  // --- Alimentation ---
  'Alimentation & Boissons',
  'Épicerie',
  'Produits locaux & Vivres frais',
 
  // --- Santé ---
  'Santé & Bien-être',
  'Matériel médical',
  'Pharmacie & Parapharmacie',
 
  // --- Bureau & Divers ---
  'Fournitures de bureau',
  'Téléphonie & Forfaits Internet',
  'Mariage & Cérémonies',
  'Autres',
];
 
function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // retire les accents
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
 
async function main() {
  console.log(`Seed de ${CATEGORY_NAMES.length} catégories...`);
 
  for (const name of CATEGORY_NAMES) {
    await prisma.category.upsert({
      where: { name },
      update: { slug: slugify(name) },
      create: { name, slug: slugify(name) },
    });
  }
 
  console.log('Catégories créées/à jour avec succès.');
}
 
main()
  .catch((error) => {
    console.error('Erreur lors du seed des catégories :', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
 
