import { Request, Response, NextFunction } from 'express';
import { PlanFeature, FEATURE_LABELS, minimumPlanFor } from '../constants/plans';
import { HttpError } from '../lib/http';

/**
 * PLAN: "para usar esta función, el plan de la persona tiene que incluirla".
 *
 *   router.post('/events', authorize(Entity.EVENTS, Action.CREATE), requireFeature(PlanFeature.EVENTS), EventsController.create)
 *
 * authorize() mira el ROL (qué le corresponde hacer); requireFeature() mira el PLAN (qué está contratado).
 * Responde 402 con el plan mínimo necesario, para que la app ofrezca pedir el cambio de plan.
 */
export const planRequiredError = (feature: PlanFeature) => {
  const plan = minimumPlanFor(feature);
  return new HttpError(402, `${FEATURE_LABELS[feature]} está disponible desde el plan ${plan.name}. Pedile a la Representante Legal que te cambie el plan.`, {
    code: 'PLAN_REQUIRED',
    feature,
    requiredPlan: plan.code,
  });
};

export const requireFeature = (feature: PlanFeature) => {
  const middleware = (req: Request, _res: Response, next: NextFunction) => {
    if (req.schoolSession?.hasFeature(feature)) return next();
    next(planRequiredError(feature));
  };
  Object.defineProperty(middleware, 'name', { value: `requireFeature(${feature})` });
  return middleware;
};
