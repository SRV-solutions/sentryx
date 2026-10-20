/**
 * Reportes de problemas ("Reportar un problema"): cualquier usuario los manda desde la app y quedan
 * asociados a su cuenta, al colegio activo, a la pantalla y al navegador. El equipo de Sentryx los
 * ve en la consola de la plataforma y, al responder, le llega una notificación a quien reportó.
 */
import { Op, WhereOptions } from 'sequelize';
import { SupportReport, User, School } from '../models';
import type { SupportReportStatus, ReportAttachment } from '../models/school/system';
import { asyncHandler, notFound, badRequest, HttpError } from '../lib/http';
import { env } from '../config/env';
import { presignUpload, presignDownload, headObject } from '../config/s3';
import { REPORT_IMAGE_MAX, REPORT_VIDEO_MAX } from '../validators/support.validator';
import { currentRequest } from '../lib/requestContext';
import { notify } from '../services/notifications';
import { audit } from '../services/audit';

const STATUS_LABELS: Record<SupportReportStatus, string> = {
  ABIERTO: 'abierto',
  EN_PROCESO: 'en proceso',
  RESUELTO: 'resuelto',
  DESCARTADO: 'cerrado',
};

/** Adjuntos de reportes: bucket propio (R2_REPORTS_BUCKET), aparte del de los colegios. */
const attachmentsEnabled = () => !!env.reportsBucket && !!env.storage.accessKeyId && !!env.storage.secretAccessKey;
const reportsBucket = () => {
  if (!attachmentsEnabled()) throw new HttpError(503, 'Este servidor todavía no acepta capturas ni videos en los reportes.');
  return env.reportsBucket!;
};
/** URLs firmadas de corta duración para ver los adjuntos (quien reportó y el equipo de Sentryx). */
const signAttachments = (list: ReportAttachment[] = []) =>
  attachmentsEnabled() ? Promise.all(list.map(async (a) => ({ ...a, url: await presignDownload(env.reportsBucket!, a.key, 3600, { name: a.name, mimeType: a.type }) }))) : Promise.resolve(list.map((a) => ({ ...a, url: null })));

// GET /support/config — qué acepta este servidor (la app oculta el botón de adjuntar si no hay bucket).
export const getConfig = asyncHandler(async (_req, res) => {
  res.json({ attachments: attachmentsEnabled(), imageMaxBytes: REPORT_IMAGE_MAX, videoMaxBytes: REPORT_VIDEO_MAX, maxFiles: 5 });
});

// POST /support/attachments/presign — el navegador sube DIRECTO al bucket de reportes.
export const presignAttachment = asyncHandler(async (req, res) => {
  const { fileName, contentType, size } = req.body as { fileName: string; contentType: string; size: number };
  const { key, url } = await presignUpload({ bucket: reportsBucket(), prefix: `reports/${req.user!.id}`, fileName, contentType, size });
  res.json({ key, uploadUrl: url });
});

// POST /support/reports
export const createReport = asyncHandler(async (req, res) => {
  const body = req.body as { category: 'ERROR' | 'SUGERENCIA' | 'CONSULTA'; description: string; pageUrl?: string | null; appVersion?: string | null; clientErrors: object[]; attachments: ReportAttachment[] };
  const schoolHeader = Number(req.headers['x-school-id']) || null;
  const request = currentRequest();
  // Cada adjunto tiene que ser de quien reporta y existir en el bucket con el peso declarado.
  const attachments: ReportAttachment[] = [];
  for (const a of body.attachments ?? []) {
    if (!a.key.startsWith(`reports/${req.user!.id}/`)) throw badRequest('Adjunto inválido.');
    const head = await headObject(reportsBucket(), a.key).catch(() => null);
    if (!head) throw badRequest(`El archivo "${a.name}" no terminó de subirse. Probá de nuevo.`);
    attachments.push({ key: a.key, name: a.name, size: Number(head.ContentLength ?? a.size), type: head.ContentType ?? a.type });
  }
  const report = await SupportReport.create({
    userId: req.user!.id,
    schoolId: schoolHeader,
    category: body.category,
    description: body.description,
    pageUrl: body.pageUrl ?? null,
    userAgent: [request?.userAgent, body.appVersion ? `app ${body.appVersion}` : null].filter(Boolean).join(' · ').slice(0, 300) || null,
    ip: request?.ip ?? null,
    clientErrors: body.clientErrors,
    attachments,
    response: null,
    resolvedById: null,
    resolvedAt: null,
  });
  res.status(201).json({ id: report.id, message: '¡Gracias! Recibimos tu reporte. Te avisamos cuando lo revisemos.' });
});

// GET /support/reports/mine
export const listMyReports = asyncHandler(async (req, res) => {
  const reports = await SupportReport.findAll({
    where: { userId: req.user!.id },
    attributes: ['id', 'category', 'description', 'status', 'response', 'createdAt', 'resolvedAt', 'attachments'],
    order: [['createdAt', 'DESC']],
    limit: 50,
  });
  res.json(await Promise.all(reports.map(async (r) => ({ ...r.toJSON(), attachments: await signAttachments(r.attachments) }))));
});

// GET /platform/support-reports
export const listReports = asyncHandler(async (req, res) => {
  const { page, limit, status, q } = req.query as unknown as { page: number; limit: number; status?: SupportReportStatus; q?: string };
  const where: WhereOptions = {};
  if (status) Object.assign(where, { status });
  if (q) Object.assign(where, { description: { [Op.iLike]: `%${q}%` } });
  const { rows, count } = await SupportReport.findAndCountAll({
    where,
    include: [{ model: User, as: 'Reporter', attributes: ['id', 'firstName', 'lastName', 'email', 'dni'] }],
    order: [['createdAt', 'DESC']],
    limit,
    offset: (page - 1) * limit,
  });
  const schoolNames = new Map(
    (await School.findAll({ where: { id: [...new Set(rows.map((r) => r.schoolId).filter((id): id is number => !!id))] }, attributes: ['id', 'name'] })).map((s) => [s.id, s.name])
  );
  const openCount = await SupportReport.count({ where: { status: ['ABIERTO', 'EN_PROCESO'] } });
  res.json({
    data: await Promise.all(rows.map(async (row) => ({ ...row.toJSON(), attachments: await signAttachments(row.attachments), schoolName: row.schoolId ? schoolNames.get(row.schoolId) ?? null : null }))),
    openCount,
    pagination: { totalItems: count, currentPage: page, totalPages: Math.ceil(count / limit) },
  });
});

// PATCH /platform/support-reports/:id — cambia el estado y (opcional) responde a quien reportó
export const updateReport = asyncHandler(async (req, res) => {
  const report = await SupportReport.findByPk(Number(req.params.id));
  if (!report) throw notFound();
  const { status, response } = req.body as { status: SupportReportStatus; response?: string | null };
  const closing = status === 'RESUELTO' || status === 'DESCARTADO';
  await report.update({
    status,
    response: response ?? report.response,
    resolvedById: closing ? req.user!.id : null,
    resolvedAt: closing ? new Date() : null,
  });
  await audit({ schoolId: report.schoolId, userId: req.user!.id, entity: 'SupportReport', entityId: report.id, action: `status:${status}` });
  notify({
    userIds: [report.userId],
    title: `Tu reporte #${report.id} está ${STATUS_LABELS[status]}`,
    message: response ? response.slice(0, 200) : 'El equipo de Sentryx actualizó tu reporte.',
    type: 'support',
    link: '/perfil/me',
    email: closing ? 'fallback' : 'never',
  });
  res.json(report);
});
