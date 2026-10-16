import { School, FileAsset } from '../../models';
import { signFiles } from './files';

/**
 * Escudo/logo del colegio. Se guarda como "file:<id>" (subido a la plataforma) o como URL externa.
 * La marca de la plataforma (SRV) no cambia: el escudo identifica en qué colegio está el usuario.
 */
export const resolveLogo = async (school: Pick<School, 'logoUrl'>) => {
  const v = school.logoUrl;
  if (!v) return null;
  if (v.startsWith('file:')) return (await signFiles([Number(v.slice(5))])).get(Number(v.slice(5)))?.url ?? null;
  return v;
};

export const publicSchool = async (school: School) => ({
  id: school.id,
  name: school.name,
  slug: school.slug,
  logoUrl: await resolveLogo(school),
});

export const isImageAsset = async (fileId: number, schoolId: number) =>
  !!(await FileAsset.findOne({ where: { id: fileId, schoolId, status: 'READY' }, attributes: ['mimeType'] }))?.mimeType.startsWith('image/');
