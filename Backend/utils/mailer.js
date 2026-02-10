const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  connectionTimeout: 20000,
  greetingTimeout: 20000,
  socketTimeout: 20000
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
