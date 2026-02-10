const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false,              // 587 = STARTTLS (NO secure)
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  },
  requireTLS: true,           // fuerza STARTTLS
  connectionTimeout: 20000,
  greetingTimeout: 20000,
  socketTimeout: 20000,
  tls: {
    servername: "smtp.gmail.com"
  }
});

// opcional pero MUY útil para diagnosticar:
async function testSMTP() {
  try {
    await transporter.verify();
    console.log("[SMTP] OK: transporter.verify() pasó");
  } catch (e) {
    console.error("[SMTP] FAIL verify:", e);
  }
}
testSMTP();

async function enviarCorreoRestablecimiento(correo, urlRestablecimiento) {
  await transporter.sendMail({
    from: `"Distribuidora Torres" <${process.env.SMTP_USER}>`,
    to: correo,
    subject: "Restablecer contraseña",
    html: `
      <p>Hola,</p>
      <p>Recibimos una solicitud para restablecer tu contraseña.</p>
      <p><a href="${urlRestablecimiento}">Haz clic aquí para restablecerla</a></p>
      <p>Este enlace expira pronto. Si no fuiste tú, ignora este correo.</p>
    `
  });S
}

module.exports = { enviarCorreoRestablecimiento };
