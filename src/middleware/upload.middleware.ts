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

// Configuration dynamique du stockage Cloudinary pour gérer les images et les vidéos
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: async (req, file) => {
    // Si c'est une vidéo, on adapte le dossier, les formats acceptés et le type de ressource Cloudinary
    const isVideo = file.fieldname === 'video' || file.mimetype.startsWith('video/');

    return {
      folder: isVideo ? 'cbfsoko/products/videos' : 'cbfsoko/products',
      resource_type: isVideo ? 'video' : 'image',
      allowed_formats: isVideo ? ['mp4', 'mov', 'webm', 'avi'] : ['jpg', 'png', 'jpeg', 'webp'],
      ...(isVideo ? {} : { transformation: [{ width: 1000, height: 1000, crop: 'limit' }] }),
    };
  },
});

// Middleware Multer configuré avec des limites adaptées (ex: 50 Mo max pour la vidéo)
const upload = multer({
  storage: storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 Mo pour supporter les capsules vidéo courtes
  fileFilter: (req, file, cb) => {
    if (file.fieldname === 'images' || file.fieldname === 'video' || file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) {
      cb(null, true);
    } else {
      cb(new Error('Format de fichier non supporté (images ou vidéos uniquement).'));
    }
  }
});

export default upload;