const Stripe = require('stripe');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
    const sig = req.headers['stripe-signature'];
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

    let event;

    if (endpointSecret) {
      // Vercel provides the raw request body as req.rawBody for signature verification
      const rawBody = req.rawBody || req.body;
      event = stripe.webhooks.constructEvent(rawBody, sig, endpointSecret);
    } else {
      event = req.body;
    }

    switch (event.type) {
      case 'checkout.session.completed':
        // Payment succeeded — user is now subscribed
        console.log('Subscription created:', event.data.object.id);
        break;
      case 'customer.subscription.deleted':
        // User cancelled
        console.log('Subscription cancelled:', event.data.object.id);
        break;
      default:
        // Unhandled event type
    }

    return res.status(200).json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    return res.status(400).json({ error: 'Webhook failed' });
  }
};