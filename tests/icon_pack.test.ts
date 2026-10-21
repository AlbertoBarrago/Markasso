import { describe, expect, it } from 'vitest';
import { MAX_EMBEDDED_SVG_CHARS } from '../src/elements/stencils/registry';
import {
  buildIconPack,
  cleanIconName,
  describeIconPath,
  detectPackName,
  isIconSvgPath,
} from '../src/io/icon_pack';

const svg = (label: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg"><title>${label}</title></svg>`;
const keep = (s: string) => s;

describe('icon path parsing', () => {
  it.each([
    [
      'Architecture-Service-Icons_07312026/Arch_Databases/64/Arch_Amazon-DynamoDB_64.svg',
      'Amazon DynamoDB',
      'Databases',
    ],
    [
      'Resource-Icons_07312026/Res_General-Icons/Res_48_Dark/Res_Server_48_Dark.svg',
      'Server (dark)',
      'General Icons',
    ],
    [
      'Resource-Icons_07312026/Res_General-Icons/Res_48_Light/Res_Server_48_Light.svg',
      'Server',
      'General Icons',
    ],
    [
      'Category-Icons_07312026/Arch-Category_32/Arch-Category_Blockchain_32.svg',
      'Blockchain',
      'Category Icons',
    ],
    [
      'Azure_Public_Service_Icons/Icons/compute/10021-icon-service-Virtual-Machine.svg',
      'Virtual Machine',
      'Compute',
    ],
    [
      'Unique Icons/Security Operations/SVG/SecOps-512-color-rgb.svg',
      'Security Operations',
      'Unique Icons',
    ],
    [
      'Category Icons/AI _ Machine Learning/SVG/AIMachineLearning-512-color.svg',
      'AI / Machine Learning',
      'Category Icons',
    ],
  ])('%s', (path, name, category) => {
    expect(describeIconPath(path)).toEqual({ name, category });
  });

  it('keeps numbers that are part of the name', () => {
    expect(cleanIconName('00123-icon-service-Windows-10')).toBe('Windows 10');
    expect(cleanIconName('Arch_Amazon-Route-53_64')).toBe('Amazon Route 53');
  });

  it('skips macOS metadata, hidden files and non-SVG files', () => {
    expect(isIconSvgPath('a/b.svg')).toBe(true);
    expect(isIconSvgPath('__MACOSX/a/._b.svg')).toBe(false);
    expect(isIconSvgPath('a/.hidden.svg')).toBe(false);
    expect(isIconSvgPath('a/b.png')).toBe(false);
  });

  it('recognizes the vendor from the archive layout', () => {
    expect(
      detectPackName(['Architecture-Service-Icons_07312026/x.svg'], 'pkg.zip'),
    ).toBe('AWS');
    expect(
      detectPackName(['Azure_Public_Service_Icons/Icons/a.svg'], 'x.zip'),
    ).toBe('Azure');
    expect(detectPackName(['Unique Icons/GKE/SVG/GKE.svg'], 'x.zip')).toBe(
      'Google Cloud',
    );
    expect(detectPackName(['a.svg'], 'my-company_icons.zip')).toBe(
      'My company icons',
    );
  });
});

describe('buildIconPack', () => {
  it('keeps the largest variant of each icon', () => {
    const { icons, skipped } = buildIconPack(
      [16, 32, 64, 48].map((size) => ({
        path: `Architecture-Service-Icons/Arch_Compute/${size}/Arch_AWS-Lambda_${size}.svg`,
        svg: svg(String(size)),
      })),
      keep,
    );
    expect(skipped).toBe(0);
    expect(icons).toHaveLength(1);
    expect(icons[0]).toMatchObject({ name: 'AWS Lambda', category: 'Compute' });
    expect(atob(icons[0]!.src.split(',')[1]!)).toContain('<title>64</title>');
  });

  it('sorts by category then name and encodes strict data URLs', () => {
    const { icons } = buildIconPack(
      [
        { path: 'p/storage/b.svg', svg: svg('b') },
        { path: 'p/compute/z.svg', svg: svg('z') },
        { path: 'p/compute/a.svg', svg: svg('a') },
      ],
      keep,
    );
    expect(icons.map((i) => `${i.category}/${i.name}`)).toEqual([
      'Compute/A',
      'Compute/Z',
      'Storage/B',
    ]);
    for (const icon of icons) {
      expect(icon.src).toMatch(
        /^data:image\/svg\+xml;base64,[A-Za-z0-9+/]+=*$/,
      );
    }
  });

  it('skips files rejected by the sanitizer or over the size cap', () => {
    const { icons, skipped } = buildIconPack(
      [
        { path: 'p/ok.svg', svg: svg('ok') },
        { path: 'p/bad.svg', svg: 'not svg' },
        { path: 'p/huge.svg', svg: svg('x'.repeat(MAX_EMBEDDED_SVG_CHARS)) },
      ],
      (s) => (s.startsWith('<svg') ? s : null),
    );
    expect(icons.map((i) => i.name)).toEqual(['Ok']);
    expect(skipped).toBe(2);
  });

  it('encodes non-ASCII markup', () => {
    const { icons } = buildIconPack(
      [{ path: 'p/café.svg', svg: svg('café ✓') }],
      keep,
    );
    const bytes = Uint8Array.from(atob(icons[0]!.src.split(',')[1]!), (c) =>
      c.charCodeAt(0),
    );
    expect(new TextDecoder().decode(bytes)).toContain('café ✓');
  });
});
