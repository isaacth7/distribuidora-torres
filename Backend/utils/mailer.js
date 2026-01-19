const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 587),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

async function enviarCorreoRestablecimiento(correo, urlRestablecimiento) {
  await transporter.sendMail({
    from: `"Distribuidora Torres" <${process.env.SMTP_USER}>`,
    to: correo,
    subject: 'Restablecer contraseña',
    html: `
      <p>Hola,</p>
      <p>Recibimos una solicitud para restablecer tu contraseña.</p>
      <p>
        <a href="${urlRestablecimiento}">
          Haz clic aquí para restablecerla
        </a>
      </p>
      <p>Este enlace expira pronto. Si no fuiste tú, ignora este correo.</p>
    `
  });
}

module.exports = { enviarCorreoRestablecimiento };
