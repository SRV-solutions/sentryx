/**
 * Prueba del envío de emails: `npm run mail:test -- --to tu@email.com [--check-dns]`
 *
 * 1. Muestra la configuración SMTP que se está usando (sin la contraseña).
 * 2. Verifica la conexión y el usuario/contraseña con el servidor SMTP.
 * 3. Envía un email de prueba con la plantilla de Sentryx.
 * 4. Con --check-dns: revisa los registros SPF, DMARC y DKIM del dominio del remitente.
 */
import { promises as dns } from 'dns';
import { env } from '../config/env';
import { transporter, sendMailNow } from '../config/mailer';
import { brandEmail } from '../lib/emailTemplate';

const argument = (name: string) => {
  const index = process.argv.indexOf(`--${name}`);
  return index > -1 ? process.argv[index + 1] : undefined;
};

const txtRecords = async (host: string) => {
  try {
    return (await dns.resolveTxt(host)).map((parts) => parts.join(''));
  } catch {
    return [];
  }
};

/** Selectores DKIM habituales de cada proveedor (el de tu proveedor puede ser otro: figura en su panel). */
const DKIM_SELECTORS = ['resend._domainkey', 'hostingermail1._domainkey', 'hostingermail-a._domainkey', 'default._domainkey', 'google._domainkey', 'mail._domainkey', 'k1._domainkey', 's1._domainkey'];

const checkDns = async (domain: string) => {
  console.log(`\nDNS de ${domain}`);
  const spf = (await txtRecords(domain)).filter((r) => r.startsWith('v=spf1'));
  console.log(spf.length === 1 ? `  ✓ SPF: ${spf[0]}` : spf.length > 1 ? `  ✗ Hay ${spf.length} registros SPF: tiene que haber UNO solo (unilos en un registro).` : '  ✗ Falta el registro SPF (TXT "v=spf1 …").');
  const dmarc = (await txtRecords(`_dmarc.${domain}`)).filter((r) => r.startsWith('v=DMARC1'));
  console.log(dmarc.length ? `  ✓ DMARC: ${dmarc[0]}` : '  ✗ Falta DMARC (TXT en _dmarc, ej: "v=DMARC1; p=none; rua=mailto:dmarc@' + domain + '").');
  const foundDkim: string[] = [];
  for (const selector of DKIM_SELECTORS) {
    const records = [...(await txtRecords(`${selector}.${domain}`)), ...(await dns.resolveCname(`${selector}.${domain}`).catch(() => []))];
    if (records.length) foundDkim.push(selector);
  }
  console.log(foundDkim.length ? `  ✓ DKIM encontrado en: ${foundDkim.join(', ')}` : '  ? No encontré DKIM con los selectores habituales: verificá en el panel de tu proveedor que el dominio figure como "verificado".');
};

const run = async () => {
  const to = argument('to');
  const from = env.MAIL_FROM ?? env.SMTP_USER ?? '';
  console.log('Configuración de email');
  console.log(`  Servidor : ${env.SMTP_HOST ?? 'gmail (sin SMTP_HOST)'}:${env.SMTP_PORT}`);
  console.log(`  Usuario  : ${env.SMTP_USER ?? '(vacío)'}`);
  console.log(`  Remitente: "${env.MAIL_FROM_NAME}" <${from}>`);
  console.log(to)

  try {
    await transporter.verify();
    console.log('  ✓ Conexión y credenciales SMTP correctas');
  } catch (err) {
    console.log(`  ✗ No se pudo conectar o autenticar: ${(err as Error).message}`);
    process.exitCode = 1;
  }

  if (process.argv.includes('--check-dns') && from.includes('@')) await checkDns(from.split('@')[1]);

  if (to && !process.exitCode) {
    await sendMailNow({
      to,
      subject: 'Prueba de email de Sentryx',
      html: brandEmail({
        title: 'Funciona 🎉',
        paragraphs: ['Si estás leyendo esto, Sentryx ya puede enviar emails (bienvenidas, recupero de contraseña y avisos).', `Enviado desde ${from}.`],
      }),
    });
    console.log(`\n✓ Email de prueba enviado a ${to}. Revisá también la carpeta de spam: si cae ahí, falta SPF/DKIM/DMARC.`);
  } else if (!to) {
    console.log('\n(Agregá --to tu@email.com para enviar un email de prueba.)');
  }
  transporter.close();
};

run().catch((err) => {
  console.error('❌', err.message ?? err);
  process.exit(1);
});
