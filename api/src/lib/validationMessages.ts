import { z, ZodError, ZodIssueCode } from 'zod';

/**
 * Mensajes de validación en español y legibles para la persona que carga datos
 * (antes se respondía "Datos inválidos." sin decir qué campo fallaba).
 */
z.setErrorMap((issue, session) => {
  switch (issue.code) {
    case ZodIssueCode.invalid_type:
      return { message: issue.received === 'undefined' || issue.received === 'null' ? 'es obligatorio' : 'tiene un formato inválido' };
    case ZodIssueCode.too_small:
      if (issue.type === 'string') return { message: issue.minimum === 1 ? 'es obligatorio' : `debe tener al menos ${issue.minimum} caracteres` };
      if (issue.type === 'array') return { message: `debe tener al menos ${issue.minimum} elemento(s)` };
      return { message: `debe ser mayor o igual a ${issue.minimum}` };
    case ZodIssueCode.too_big:
      if (issue.type === 'string') return { message: `admite hasta ${issue.maximum} caracteres` };
      if (issue.type === 'array') return { message: `admite hasta ${issue.maximum} elementos` };
      return { message: `debe ser menor o igual a ${issue.maximum}` };
    case ZodIssueCode.invalid_string:
      if (issue.validation === 'email') return { message: 'no es un email válido' };
      if (issue.validation === 'url') return { message: 'no es un link válido' };
      if (issue.validation === 'date') return { message: 'no es una fecha válida' };
      return { message: 'tiene un formato inválido' };
    case ZodIssueCode.invalid_enum_value:
      return { message: 'tiene un valor no permitido' };
    default:
      return { message: session.defaultError };
  }
});

const LABELS: Record<string, string> = {
  firstName: 'Nombre',
  lastName: 'Apellido',
  email: 'Email',
  dni: 'DNI',
  phone: 'Teléfono',
  relationship: 'Vínculo',
  birthDate: 'Fecha de nacimiento',
  divisionId: 'División',
  levelId: 'Nivel',
  role: 'Rol',
  title: 'Cargo',
  username: 'Usuario',
  password: 'Contraseña',
  newPassword: 'Nueva contraseña',
  currentPassword: 'Contraseña actual',
  biography: 'Biografía',
  subject: 'Asunto',
  body: 'Texto',
  name: 'Nombre',
};

const describePath = (path: (string | number)[]) => {
  const parts: string[] = [];
  for (let i = 0; i < path.length; i++) {
    const p = path[i];
    if (p === 'guardians' && typeof path[i + 1] === 'number') {
      parts.push(`Familiar ${(path[i + 1] as number) + 1}`);
      i++;
    } else if (typeof p === 'string') parts.push(LABELS[p] ?? p);
  }
  return parts.join(' · ');
};

/** "Familiar 2 · Email: no es un email válido". Con varios errores, los primeros tres. */
export const describeZodError = (err: ZodError) => {
  const issues = err.issues.map((i) => {
    const where = describePath(i.path);
    return { path: i.path.join('.'), message: where ? `${where}: ${i.message}` : i.message };
  });
  const message = issues.slice(0, 3).map((i) => i.message).join(' · ') + (issues.length > 3 ? ` (y ${issues.length - 3} más)` : '');
  return { message: message || 'Datos inválidos.', issues };
};
