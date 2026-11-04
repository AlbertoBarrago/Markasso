/**
 * Public Polar links for Markasso Cloud. They are plain URLs (no secret), so
 * they live in the source. The nightly build (`VITE_POLAR_SANDBOX=true`, see
 * `build:nightly`) uses the Polar sandbox, where no payment is processed.
 * An empty link keeps its button in the "Available soon" state on /cloud.
 *
 * Checkout links use `<origin>/cloud?checkout_id={CHECKOUT_ID}` as their
 * success URL, so buyers land on the welcome panel.
 */
type PolarLinks = {
  /** Checkout link for the 5 EUR/month product. */
  readonly monthly: string;
  /** Checkout link for the 48 EUR/year product. */
  readonly yearly: string;
  /** Customer portal: licence key, invoices, cancellation. */
  readonly portal: string;
};

const SANDBOX: PolarLinks = {
  monthly:
    'https://sandbox-api.polar.sh/v1/checkout-links/polar_cl_GfZaMMhh2tJcQjRzObBV8muZMYf3KFGoKemzR0TLA3o/redirect',
  yearly:
    'https://sandbox-api.polar.sh/v1/checkout-links/polar_cl_EPFO7pypIAEXeQVpD0ahmxetPsAjDhtHxIpXu2VJTzZ/redirect',
  portal: 'https://sandbox.polar.sh/markasso/portal',
};

const PRODUCTION: PolarLinks = {
  monthly:
    'https://buy.polar.sh/polar_cl_DmNorprlToSocMfXle37mJwQ7wlgr2CBUJkob2cyaUR',
  yearly:
    'https://buy.polar.sh/polar_cl_wAogWKKmDuPcP2MLw9rbDeR7Luk881qk4oxKf45Z64f',
  portal: 'https://polar.sh/markasso/portal',
};

export const POLAR_LINKS: PolarLinks =
  import.meta.env.VITE_POLAR_SANDBOX === 'true' ? SANDBOX : PRODUCTION;
