import nodemailer from 'nodemailer';
import { env } from './env';

export const transporter = nodemailer.createTransport({
  ...(env.SMTP_HOST ? { host: env.SMTP_HOST, port: env.SMTP_PORT, secure: env.SMTP_PORT === 465 } : { service: 'gmail' }),
  pool: true,
  maxConnections: 3,
  auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
});

const FROM = () => `"${env.MAIL_FROM_NAME}" <${env.MAIL_FROM ?? env.SMTP_USER}>`;

interface Mail {
  to: string;
  subject: string;
  html: string;
}

const queue: Mail[] = [];
let running = 0;
const CONCURRENCY = 3;

const pump = () => {
  while (running < CONCURRENCY && queue.length) {
    const mail = queue.shift()!;
    running++;
    transporter
      .sendMail({ from: FROM(), ...mail })
      .catch((err) => console.error('[mail] error enviando a', mail.to, err.message))
      .finally(() => {
        running--;
        pump();
      });
  }
};

/**
 * Encola emails y responde al instante: la request HTTP no espera a SMTP.
 * Para volúmenes grandes (comunicados a cientos de familias) se recomienda Amazon SES.
 */
export const sendMail = (mails: Mail | Mail[]) => {
  if (!env.mailEnabled) return;
  queue.push(...(Array.isArray(mails) ? mails : [mails]));
  pump();
};

/** Envío inmediato (para flujos donde el usuario espera el mail, ej: reseteo de contraseña). */
export const sendMailNow = (mail: Mail) =>
  transporter.sendMail({ from: FROM(), ...mail });
