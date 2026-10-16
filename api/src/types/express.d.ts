import type { SchoolContext } from '../school/context';

declare global {
  namespace Express {
    interface Request {
      user?: { id: number; email: string; roleId: number };
      school?: SchoolContext;
    }
  }
}

export {};
