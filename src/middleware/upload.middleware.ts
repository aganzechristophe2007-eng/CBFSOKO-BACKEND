import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import multer from 'multer';

// Configuration de Cloudinary avec les variables d'environnement de Render
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Export de l'instance pour réutilisation ailleurs (avatars, messages, etc.)
export { cloudinary };

// Configuration du stockage Cloudinary pour les produits
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: async (req, file) => {
    return {
      folder: 'cbfsoko/products',
      allowed_formats: ['jpg', 'png', 'jpeg', 'webp'],
      transformation: [{ width: 1000, height: 1000, crop: 'limit' }],
    };
  },
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }
});

export default upload;