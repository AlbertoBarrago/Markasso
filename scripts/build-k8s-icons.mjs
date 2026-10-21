#!/usr/bin/env node
/**
 * Regenerates the bundled Kubernetes icon pack from the official icon set
 * in kubernetes/community (Apache-2.0 or CC-BY-4.0, used here under
 * Apache-2.0).
 *
 * Usage: node scripts/build-k8s-icons.mjs [commit-sha]
 *
 * The commit is pinned so regenerating is reproducible; pass a newer SHA to
 * update the icons. Output: src/libraries/kubernetes/icons.generated.ts and
 * the upstream LICENSE next to it. Run `pnpm lint` afterwards to format the
 * generated module.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_SHA = '440e496d3a172234d81728df1bfe43849b589adf';
const sha = process.argv[2] ?? DEFAULT_SHA;
const RAW = `https://raw.githubusercontent.com/kubernetes/community/${sha}`;
const OUT_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'src',
  'libraries',
  'kubernetes',
);

/** [category, upstream folder, file stem, display name] */
const ICONS = [
  ['Control plane', 'control_plane_components/labeled', 'api', 'API server'],
  [
    'Control plane',
    'control_plane_components/labeled',
    'c-c-m',
    'Cloud controller manager',
  ],
  [
    'Control plane',
    'control_plane_components/labeled',
    'c-m',
    'Controller manager',
  ],
  ['Control plane', 'control_plane_components/labeled', 'sched', 'Scheduler'],
  ['Control plane', 'control_plane_components/labeled', 'kubelet', 'kubelet'],
  [
    'Control plane',
    'control_plane_components/labeled',
    'k-proxy',
    'kube-proxy',
  ],
  [
    'Infrastructure',
    'infrastructure_components/unlabeled',
    'control-plane',
    'Control plane',
  ],
  ['Infrastructure', 'infrastructure_components/unlabeled', 'node', 'Node'],
  ['Infrastructure', 'infrastructure_components/unlabeled', 'etcd', 'etcd'],
  ['Workloads', 'resources/unlabeled', 'pod', 'Pod'],
  ['Workloads', 'resources/unlabeled', 'deploy', 'Deployment'],
  ['Workloads', 'resources/unlabeled', 'rs', 'ReplicaSet'],
  ['Workloads', 'resources/unlabeled', 'sts', 'StatefulSet'],
  ['Workloads', 'resources/unlabeled', 'ds', 'DaemonSet'],
  ['Workloads', 'resources/unlabeled', 'job', 'Job'],
  ['Workloads', 'resources/unlabeled', 'cronjob', 'CronJob'],
  ['Workloads', 'resources/unlabeled', 'hpa', 'HorizontalPodAutoscaler'],
  ['Network', 'resources/unlabeled', 'svc', 'Service'],
  ['Network', 'resources/unlabeled', 'ing', 'Ingress'],
  ['Network', 'resources/unlabeled', 'ep', 'Endpoints'],
  ['Network', 'resources/unlabeled', 'netpol', 'NetworkPolicy'],
  ['Storage', 'resources/unlabeled', 'pv', 'PersistentVolume'],
  ['Storage', 'resources/unlabeled', 'pvc', 'PersistentVolumeClaim'],
  ['Storage', 'resources/unlabeled', 'sc', 'StorageClass'],
  ['Storage', 'resources/unlabeled', 'vol', 'Volume'],
  ['Config', 'resources/unlabeled', 'cm', 'ConfigMap'],
  ['Config', 'resources/unlabeled', 'secret', 'Secret'],
  ['Config', 'resources/unlabeled', 'ns', 'Namespace'],
  ['Config', 'resources/unlabeled', 'quota', 'ResourceQuota'],
  ['Config', 'resources/unlabeled', 'limits', 'LimitRange'],
  ['Config', 'resources/unlabeled', 'crd', 'CustomResourceDefinition'],
  ['Access control', 'resources/unlabeled', 'sa', 'ServiceAccount'],
  ['Access control', 'resources/unlabeled', 'role', 'Role'],
  ['Access control', 'resources/unlabeled', 'rb', 'RoleBinding'],
  ['Access control', 'resources/unlabeled', 'c-role', 'ClusterRole'],
  ['Access control', 'resources/unlabeled', 'crb', 'ClusterRoleBinding'],
  ['Access control', 'resources/unlabeled', 'user', 'User'],
  ['Access control', 'resources/unlabeled', 'group', 'Group'],
  ['Access control', 'resources/unlabeled', 'psp', 'PodSecurityPolicy'],
];

/**
 * Drops editor metadata (Inkscape/Sodipodi/RDF) and whitespace. Upstream
 * files are trusted, but anything scriptable aborts the build rather than
 * being silently shipped.
 */
function minify(svg, file) {
  if (/<script|\son\w+\s*=|<foreignObject|javascript:/i.test(svg)) {
    throw new Error(`${file}: unexpected scriptable content`);
  }
  return svg
    .replace(/<\?xml[^>]*\?>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<metadata[\s\S]*?<\/metadata>/g, '')
    .replace(/<sodipodi:namedview[\s\S]*?(\/>|<\/sodipodi:namedview>)/g, '')
    .replace(/\s(inkscape|sodipodi):[\w-]+="[^"]*"/g, '')
    .replace(/\sxmlns:(inkscape|sodipodi|rdf|cc|dc)="[^"]*"/g, '')
    .replace(/>\s+</g, '><')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

async function fetchText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.text();
}

const entries = [];
let rawBytes = 0;
let minBytes = 0;
for (const [category, folder, stem, label] of ICONS) {
  const file = `icons/svg/${folder}/${stem}.svg`;
  const raw = await fetchText(`${RAW}/${file}`);
  const svg = minify(raw, file);
  rawBytes += raw.length;
  minBytes += svg.length;
  const src = `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`;
  entries.push({ id: stem, label, category, src });
}

const license = await fetchText(`${RAW}/LICENSE`);
await mkdir(OUT_DIR, { recursive: true });
await writeFile(join(OUT_DIR, 'LICENSE'), license);
await writeFile(
  join(OUT_DIR, 'icons.generated.ts'),
  `// Generated by scripts/build-k8s-icons.mjs from kubernetes/community@${sha}.
// Do not edit by hand: rerun the script instead.
//
// Kubernetes Icons Set, (c) The Kubernetes Authors, used under Apache-2.0
// (see ./LICENSE and THIRD_PARTY_NOTICES.md). The Kubernetes logo is a
// registered trademark of The Linux Foundation.
import type { BundledIcon } from '../../elements/stencils/packs';

export const KUBERNETES_ICONS: ReadonlyArray<BundledIcon> = ${JSON.stringify(entries, null, 2)};
`,
);
console.log(
  `Wrote ${entries.length} icons (${(rawBytes / 1024).toFixed(0)} KB raw, ${(minBytes / 1024).toFixed(0)} KB minified).`,
);
