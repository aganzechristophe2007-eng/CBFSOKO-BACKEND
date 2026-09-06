import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS, // Le mot de passe d'application généré depuis ton compte Google
  },
});

export const sendWelcomeEmail = async (email: string, name: string) => {
  const homeLink = 'http://localhost:5173/'; // Ton URL frontend (accueil)

  await transporter.sendMail({
    from: '"CBFSOKO Bukavu" <no-reply@cbfsoko.com>',
    to: email,
    subject: 'Bienvenue sur CBFSOKO - Votre compte est actif !',
    html: `
      <div style="font-family: Arial, sans-serif; padding: 20px; color: #333; max-width: 600px; margin: auto; border: 1px solid #eee; border-radius: 10px;">
        <h2 style="color: #e67e22;">Bienvenue sur CBFSOKO, ${name} !</h2>
        <p>Votre inscription a été validée avec succès.</p>
        <p>Vous pouvez dès à présent explorer la plateforme, publier vos articles ou gérer vos commandes :</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${homeLink}" style="background: #e67e22; color: white; padding: 12px 25px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Accéder à la plateforme</a>
        </div>
        <p style="font-size: 12px; color: #777;">Si vous n'êtes pas à l'origine de cette inscription, veuillez ignorer cet e-mail.</p>
      </div>
    `,
  });
};