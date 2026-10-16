import { Transaction } from 'sequelize';
import { AuditLog } from '../../models';

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
) =>
  AuditLog.create(
    { entityId: null, before: null, after: null, ...entry },
    { transaction }
  );
