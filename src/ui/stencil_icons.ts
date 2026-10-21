import { shapeCommandsToPathData } from '../elements/shapes';
import {
  GENERIC_ICONS,
  type GenericIconId,
} from '../elements/stencils/generic';

/** i18n key of each generic icon's display name. */
export const GENERIC_ICON_LABEL_KEYS: Readonly<Record<GenericIconId, string>> =
  {
    server: 'iconServer',
    database: 'iconDatabase',
    cache: 'iconCache',
    queue: 'iconQueue',
    storage: 'iconStorage',
    loadBalancer: 'iconLoadBalancer',
    firewall: 'iconFirewall',
    router: 'iconRouter',
    network: 'iconNetwork',
    api: 'iconApi',
    container: 'iconContainer',
    function: 'iconFunction',
    browser: 'iconBrowser',
    mobile: 'iconMobile',
    desktop: 'iconDesktop',
    user: 'iconUser',
    users: 'iconUsers',
    externalSystem: 'iconExternalSystem',
    secret: 'iconSecret',
    document: 'iconDocument',
  };

/** Menu/search icon generated from the same paths the canvas draws. */
export function genericIconSvg(id: GenericIconId, size = 18): string {
  const d = shapeCommandsToPathData(GENERIC_ICONS[id].strokes, 0, 0);
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg>`;
}
