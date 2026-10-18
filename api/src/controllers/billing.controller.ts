/** Dashboard de facturación: Representante Legal (su colegio) y superadmin de Sentryx (todos). */
import { asyncHandler, forbidden } from '../lib/http';
import { billingFor, availableCycles, cycleOf } from '../services/billing';

// GET /billing
export const getSchoolBilling = asyncHandler(async (req, res) => {
    const session = req.schoolSession!;
    const cycle = (req.query as { cycle?: string }).cycle ?? cycleOf();
    if (cycle > cycleOf()) throw forbidden('Ese ciclo todavía no empezó.');
    const [summary, cycles] = await Promise.all([billingFor(session.schoolId, cycle), availableCycles(session.schoolId)]);
    res.json({ ...summary, cycles, currentCycle: cycleOf(), priceSource: 'BILLING_PRICE_ARS' });
  });
