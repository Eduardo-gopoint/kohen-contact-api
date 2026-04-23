import express from 'express';
import multer from 'multer';
import { Resend } from 'resend';

const {
  RESEND_API_KEY,
  FROM_EMAIL = 'Kohen Industrial <contacto@gopointagency.com>',
  TO_EMAIL = 'ventas@kohen.cl',
  REDIRECT_URL = 'https://kohen.cl/gracias/',
  ALLOWED_ORIGIN = 'https://kohen.cl',
  PORT = 10000,
} = process.env;

if (!RESEND_API_KEY) {
  console.error('[kohen-contact-api] Falta RESEND_API_KEY');
  process.exit(1);
}

const resend = new Resend(RESEND_API_KEY);
const app = express();
const upload = multer({ limits: { fileSize: 10 * 1024 * 1024 } }); // 10 MB

app.set('trust proxy', 1);
app.get('/health', (_req, res) => res.json({ ok: true }));

app.post('/submit', upload.any(), async (req, res) => {
  try {
    // Honeypot: si el campo "website" viene con algo, es bot.
    if (req.body.website) {
      return res.redirect(303, REDIRECT_URL);
    }

    const fields = req.body.form_fields || {};
    const name = (fields.name || req.body.name || '').toString().trim();
    const email = (fields.email || req.body.email || '').toString().trim();
    const phone = (fields.field_7db54d5 || fields.phone || req.body.phone || '').toString().trim();
    const message = (fields.message || req.body.message || '').toString().trim();
    const pageTitle = (req.body.referer_title || '').toString();

    if (!name || !email || !message) {
      return res.status(400).json({ error: 'Campos obligatorios faltantes' });
    }

    const attachments = (req.files || [])
      .filter((f) => f.size > 0 && f.size <= 10 * 1024 * 1024)
      .map((f) => ({ filename: f.originalname, content: f.buffer }));

    const subjectEmail = `Nuevo contacto web — ${name}`;
    const htmlBody = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
        <h2 style="color:#0d3b2e">Nuevo mensaje desde kohen.cl</h2>
        <table style="width:100%;border-collapse:collapse">
          <tr><td style="padding:8px;border-bottom:1px solid #eee"><b>Nombre</b></td><td style="padding:8px;border-bottom:1px solid #eee">${escapeHtml(name)}</td></tr>
          <tr><td style="padding:8px;border-bottom:1px solid #eee"><b>Email</b></td><td style="padding:8px;border-bottom:1px solid #eee">${escapeHtml(email)}</td></tr>
          <tr><td style="padding:8px;border-bottom:1px solid #eee"><b>Teléfono</b></td><td style="padding:8px;border-bottom:1px solid #eee">${escapeHtml(phone || '—')}</td></tr>
          <tr><td style="padding:8px;border-bottom:1px solid #eee;vertical-align:top"><b>Mensaje</b></td><td style="padding:8px;border-bottom:1px solid #eee;white-space:pre-wrap">${escapeHtml(message)}</td></tr>
          <tr><td style="padding:8px"><b>Página</b></td><td style="padding:8px">${escapeHtml(pageTitle || '—')}</td></tr>
        </table>
        <p style="color:#888;font-size:12px;margin-top:20px">Enviado desde kohen-contact-api</p>
      </div>`;

    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: [TO_EMAIL],
      reply_to: email,
      subject: subjectEmail,
      html: htmlBody,
      attachments,
    });

    if (error) {
      console.error('[kohen-contact-api] Resend error:', error);
      return res.status(502).json({ error: 'No se pudo enviar el mensaje, intenta de nuevo.' });
    }

    return res.redirect(303, REDIRECT_URL);
  } catch (err) {
    console.error('[kohen-contact-api] Unexpected error:', err);
    return res.status(500).json({ error: 'Error interno' });
  }
});

app.listen(PORT, () => {
  console.log(`[kohen-contact-api] listening on ${PORT}`);
});

function escapeHtml(s) {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
