import { Transaction } from 'sequelize';
import { AuditLog } from '../models';
import { currentRequest } from '../lib/requestContext';

/**
 * Registra un cambio sensible. La IP y el navegador se toman solos del pedido en curso
 * (lib/requestContext.ts); el usuario y el colegio se pasan explícitos porque siempre se conocen.
 */
export const audit = (
  entry: {
    schoolId: number | null;
    userId: number | null;
    entity: string;
    entityId?: number | null;
    action: string;
    before?: object | null;
    after?: object | null;
  },
  transaction?: Transaction
) => {
  const request = currentRequest();
  return AuditLog.create(
    { entityId: null, before: null, after: null, ip: request?.ip ?? null, userAgent: request?.userAgent ?? null, ...entry },
    { transaction }
  );
};
