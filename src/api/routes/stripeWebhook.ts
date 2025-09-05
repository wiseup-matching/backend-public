import express, { Request, Response } from 'express';
import Stripe from 'stripe';
import { Startup } from '../../db/schema';

// Stripe webhook secret for validation
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

// Number of connections to add per additional purchase
const ADDITIONAL_CONNECTIONS_AMOUNT = 5;

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
if (!stripeSecretKey) {
  throw new Error('STRIPE_SECRET_KEY environment variable is not set');
}
const stripe = new Stripe(stripeSecretKey);

// syncs startup with Stripe subscription data if has customer id then we update the customer id
const syncStartupWithSubscription = async (params: {
  wiseupId?: string;
  stripeCustomerId?: string;
  subscription: Stripe.Subscription;
  includeCustomerId?: boolean;
}): Promise<void> => {
  const { wiseupId, stripeCustomerId, subscription, includeCustomerId = false } = params;

  // Get customerId from subscription if not provided
  const customerIdFromSub =
    typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id;

  let query: Record<string, unknown> = {};

  // Build query using wiseupId or stripeCustomerId
  if (wiseupId) {
    query = { _id: wiseupId };
  } else {
    const scid = stripeCustomerId ?? customerIdFromSub;
    if (scid) {
      query = { stripeCustomerId: scid };
    } else {
      throw new Error('Either wiseUpUserId or stripeCustomerId must be provided');
    }
  }

  const priceId = subscription.items.data[0].price.id;
  const status = subscription.status;

  // Determine tier and monthly balance from price nickname
  const price = await stripe.prices.retrieve(priceId);
  let tier = price.nickname?.split('_')[0] ?? 'free';

  let monthlyConnectionBalance = 1;
  if (tier === 'gold') monthlyConnectionBalance = 30;
  else if (tier === 'silver') monthlyConnectionBalance = 10;

  // Downgrade to free if subscription is not active or trialing
  if (status !== 'active' && status !== 'trialing') {
    tier = 'free';
    monthlyConnectionBalance = 1;
  }

  const currentPeriodEnd = subscription.items.data[0].current_period_end;

  const updateFields: Record<string, unknown> = {
    stripePriceId: priceId,
    stripeSubscriptionExpiryDate: new Date(currentPeriodEnd * 1000),
    wiseUpSubscriptionTier: tier,
    monthlyConnectionBalance,
  };

  if (includeCustomerId && customerIdFromSub) {
    updateFields.stripeCustomerId = customerIdFromSub;
  }

  const result = await Startup.updateOne(query, { $set: updateFields });

  if (result.modifiedCount === 0) {
    const queryDescription = wiseupId
      ? `ID ${wiseupId}`
      : `customer ID ${stripeCustomerId ?? customerIdFromSub}`;
    throw new Error(`No startup found with ${queryDescription}`);
  }
};

// Handle one-time payments, specifically for additional connections

const handleOneTimePayment = async (params: {
  wiseupId?: string;
  stripeCustomerId?: string;
  lineItems: Stripe.LineItem[];
}): Promise<void> => {
  const { wiseupId, stripeCustomerId, lineItems } = params;

  let query: Record<string, unknown> = {};

  // Build query using wiseupId or stripeCustomerId
  if (wiseupId) {
    query = { _id: wiseupId };
  } else if (stripeCustomerId) {
    query = { stripeCustomerId };
  } else {
    throw new Error('Either wiseUpUserId or stripeCustomerId must be provided');
  }

  for (const item of lineItems) {
    try {
      const priceIdFromItem = item.price?.id;
      if (!priceIdFromItem) {
        continue;
      }
      const price = await stripe.prices.retrieve(priceIdFromItem);

      if (price.nickname?.includes('additional_connections')) {
        const quantity = item.quantity ?? 1;

        // Update permanent connection balance
        const updateResult = await Startup.updateOne(query, {
          $inc: {
            permanentConnectionBalance: ADDITIONAL_CONNECTIONS_AMOUNT * quantity,
          },
        });

        if (updateResult.modifiedCount === 0) {
          const queryDescription = wiseupId
            ? `ID ${wiseupId}`
            : `customer ID ${stripeCustomerId ?? 'unknown'}`;
          throw new Error(`No startup found with ${queryDescription}`);
        }
      }
    } catch (err: unknown) {
      console.error(`Error processing line item: `, err);
      throw err;
    }
  }
};

const router = express.Router();

router.post(
  '/',
  express.raw({ type: 'application/json' }),
  async (request: Request, response: Response): Promise<void> => {
    const signature = request.headers['stripe-signature'] as string | undefined;
    let event: Stripe.Event;

    try {
      if (endpointSecret) {
        if (!signature) {
          response.status(403).send('Missing Stripe signature header');
          return;
        }
        event = stripe.webhooks.constructEvent(request.body as Buffer, signature, endpointSecret);
      } else {
        // No endpoint secret in env, parse raw body as JSON
        event = JSON.parse((request.body as Buffer).toString('utf8')) as Stripe.Event;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error validating webhook';
      const isSignatureError = err instanceof Stripe.errors.StripeSignatureVerificationError;
      response.status(isSignatureError ? 403 : 400).send(`Webhook Error: ${message}`);
      return;
    }

    // Handle the event
    switch (event.type) {
      case 'checkout.session.completed': {
        try {
          const checkoutEvent = event.data.object;
          const wiseupId = checkoutEvent.metadata?.wiseUpUserId;
          const customerId: string | undefined = checkoutEvent.customer
            ? typeof checkoutEvent.customer === 'string'
              ? checkoutEvent.customer
              : checkoutEvent.customer.id
            : undefined;

          if (checkoutEvent.mode === 'subscription' && checkoutEvent.subscription) {
            let subscription: Stripe.Subscription;
            if (typeof checkoutEvent.subscription === 'string') {
              // If we only have the subscription ID, retrieve the full object.
              subscription = await stripe.subscriptions.retrieve(checkoutEvent.subscription);
            } else {
              // If the subscription object is already expanded, use it directly.
              subscription = checkoutEvent.subscription;
            }

            await syncStartupWithSubscription({
              wiseupId,
              stripeCustomerId: customerId,
              subscription,
              includeCustomerId: true,
            });
          } else {
            // Retrieve line items for one-time payment
            const lineItems = await stripe.checkout.sessions.listLineItems(checkoutEvent.id);

            await handleOneTimePayment({
              wiseupId,
              stripeCustomerId: customerId,
              lineItems: lineItems.data,
            });
          }

          response.send();
          return;
        } catch (err: unknown) {
          console.error(
            `Error processing checkout session: ${err instanceof Error ? err.message : String(err)}`,
            err,
          );
          response.status(500).send('Internal Server Error');
          return;
        }
      }

      case 'customer.subscription.updated': {
        try {
          const subscription = event.data.object;
          const wiseupId = subscription.metadata.wiseUpUserId;
          const customerId =
            typeof subscription.customer === 'string'
              ? subscription.customer
              : subscription.customer.id;

          await syncStartupWithSubscription({
            wiseupId,
            stripeCustomerId: customerId,
            subscription,
          });

          response.send();
          return;
        } catch (err: unknown) {
          console.error(
            `Error processing subscription update: ${err instanceof Error ? err.message : String(err)}`,
            err,
          );
          response.status(500).send('Internal Server Error');
          return;
        }
      }
      default:
    }
    // Acknowledge receipt of the event
    response.send();
  },
);

export default router;
