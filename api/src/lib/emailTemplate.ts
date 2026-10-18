import { env } from '../config/env';

export const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const LOGO = 'https://wearesrv.com/srv-logo-256.webp';

/**
 * Plantilla única con la marca SRV (negro, azul #0B78FB, naranja #F6950A).
 * Todo texto variable se escapa: nada de HTML inyectado desde formularios.
 */
export const brandEmail = (opts: {
  title: string;
  paragraphs: string[];
  cta?: { label: string; url: string };
  box?: string[];
  footnote?: string;
}) => {
  const p = opts.paragraphs
    .map((t) => `<p style="color:#E0E0E0;font-size:15px;line-height:1.55;margin:0 0 14px">${escapeHtml(t)}</p>`)
    .join('');
  const box = opts.box?.length
    ? `<div style="margin:22px 0;padding:16px 18px;border:1px solid #262626;border-radius:12px;background:#111">${opts.box
        .map((t) => `<p style="color:#fff;font-size:15px;margin:4px 0">${escapeHtml(t)}</p>`)
        .join('')}</div>`
    : '';
  const cta = opts.cta
    ? `<a href="${escapeHtml(opts.cta.url)}" style="display:inline-block;margin:10px 0 6px;padding:13px 26px;background:#F6950A;color:#000;font-weight:800;text-decoration:none;border-radius:10px">${escapeHtml(opts.cta.label)}</a>`
    : '';
  return `<!doctype html><html><body style="margin:0;background:#000">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#000;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif">
<tr><td align="center" style="padding:28px 12px">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#0D0D0D;border:1px solid #1f1f1f;border-radius:16px">
    <tr><td style="padding:28px 28px 8px"><img src="${LOGO}" width="44" height="44" alt="SRV" style="display:block"/></td></tr>
    <tr><td style="padding:8px 28px 28px">
      <h1 style="color:#fff;font-size:22px;font-weight:900;margin:0 0 16px">${escapeHtml(opts.title)}</h1>
      ${p}${box}${cta}
      ${opts.footnote ? `<p style="color:#A0A0A0;font-size:13px;margin-top:18px">${escapeHtml(opts.footnote)}</p>` : ''}
    </td></tr>
  </table>
  <p style="color:#666;font-size:12px;margin-top:16px">Sentryx · por <a href="https://wearesrv.com" style="color:#0B78FB;text-decoration:none">SRV</a> · <a href="${escapeHtml(env.FRONTEND_URL)}" style="color:#0B78FB;text-decoration:none">${escapeHtml(env.FRONTEND_URL.replace(/^https?:\/\//, ''))}</a></p>
</td></tr></table></body></html>`;
};
