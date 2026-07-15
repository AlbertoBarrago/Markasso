import { getWebInstrumentations, initializeFaro } from '@grafana/faro-web-sdk';
import { TracingInstrumentation } from '@grafana/faro-web-tracing';

/**
 * Initializes Grafana Faro (RUM) for production traffic analysis.
 * Skipped outside production to avoid polluting the free-tier session quota
 * with local dev / preview traffic.
 */
export function initFaro(): void {
  if (import.meta.env.MODE !== 'production') return;

  initializeFaro({
    url: 'https://faro-collector-prod-eu-west-2.grafana.net/collect/315e70421150bfbd634ddb18f1f8e964',
    app: {
      name: 'markasso-web',
      version: '1.0.0',
      environment: 'production',
    },
    instrumentations: [
      ...getWebInstrumentations(),
      new TracingInstrumentation(),
    ],
  });
}
