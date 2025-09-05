// src/index.ts
import 'dotenv/config';
import express, { Router, Request, Response } from 'express';
import { ParamsDictionary } from 'express-serve-static-core';
import cors from 'cors';
import Stripe from 'stripe';
import { auth } from '../../middlewares';

const router = Router();

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
if (!stripeSecretKey) {
  throw new Error('STRIPE_SECRET_KEY environment variable is not set');
}
const stripe = new Stripe(stripeSecretKey);

const success_url = process.env.STRIPE_SUCCESS_URL ?? 'http://localhost:5173/startup/profile';
const cancel_url = process.env.STRIPE_CANCEL_URL ?? 'http://localhost:5173/startup/profile';
const return_url = process.env.STRIPE_RETURN_URL ?? 'http://localhost:5173/startup/profile';

interface CheckoutBody {
  priceId: string;
  customer_email: string;
  wiseUpUserId: string;
  quantity?: number;
}

/* ---------- App ---------- */

router.use(cors());
router.use(express.json());

/* ---------- PRICE LIST ---------- */
router.get('/prices', auth.required, async (_req, res) => {
  try {
    const { data } = await stripe.prices.list({
      active: true,
      limit: 100,
      expand: ['data.product'],
    });

    // Only include prices with active products
    const activePrices = data.filter((p) => p.product && (p.product as Stripe.Product).active);

    const formatted = activePrices.map((p) => ({
      id: p.id,
      nickname: p.nickname ?? (p.product as Stripe.Product).name,
      unit_amount: (p.unit_amount ?? 0) / 100,
      currency: p.currency.toUpperCase(),
      interval: p.recurring ? p.recurring.interval : null,
      type: p.type,
    }));

    res.json(formatted);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'price_list_failed' });
  }
});

/* ---------- NEW CHECKOUT ---------- */
router.post(
  '/create-checkout-session',
  auth.required,
  async (req: Request<ParamsDictionary, unknown, CheckoutBody>, res: Response): Promise<void> => {
    const { priceId, customer_email, wiseUpUserId, quantity = 1 } = req.body;

    const priceIdStr = String(priceId);
    const customerEmailStr = String(customer_email);
    const quantityNum = typeof quantity === 'number' ? quantity : Number(quantity);

    let checkoutMode: 'subscription' | 'payment' = 'subscription';

    try {
      // Find or create customer
      const search = await stripe.customers.search({
        query: `email:"${customerEmailStr}"`,
        limit: 1,
      });

      let customer: Stripe.Customer;

      if (search.data.length > 0) {
        customer = search.data[0];

        // Check for active subscription
        const subs = await stripe.subscriptions.list({
          customer: customer.id,
          status: 'active',
          limit: 1,
        });
        const price = await stripe.prices.retrieve(priceIdStr);

        if (subs.data.length > 0 && price.type === 'recurring' && quantityNum === 1) {
          // Redirect to billing portal if already subscribed
          const portal = await stripe.billingPortal.sessions.create({
            customer: customer.id,
            return_url: return_url,
          });
          res.json({ url: portal.url, portal: true });
          return;
        } else if (subs.data.length == 0 && price.type === 'recurring' && quantityNum === 1) {
          checkoutMode = 'subscription';
        } else {
          checkoutMode = 'payment';
        }
      } else {
        customer = await stripe.customers.create({
          email: customerEmailStr,
          metadata: { wiseUpUserId },
        });
      }

      // Create checkout session
      const session = await stripe.checkout.sessions.create({
        mode: checkoutMode,
        customer: customer.id,
        line_items: [
          {
            price: priceIdStr,
            quantity: quantityNum,
          },
        ],
        success_url: success_url,
        cancel_url: cancel_url,
        metadata: {
          wiseUpUserId,
          quantity: quantityNum.toString(),
        },
      });

      res.json({ url: session.url });
      return;
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'create_or_swap_failed' });
    }
  },
);

/* ---------- BILLING PORTAL ---------- */
router.post('/billing-portal', auth.required, async (req, res): Promise<void> => {
  const { stripeCustomerId } = req.body;

  if (!stripeCustomerId) {
    res.status(400).json({ error: 'no_customer' });
    return;
  }

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: return_url,
    });

    res.json({ url: session.url });
    return;
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'portal_failed' });
  }
});

/* ---------- START ---------- */
export default router;
