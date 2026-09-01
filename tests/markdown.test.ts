import { describe, expect, it } from 'vitest';
import { renderMarkdown } from '../src/ui/markdown';

describe('renderMarkdown', () => {
  it('skips a leading raw-HTML preamble and starts at the first heading', () => {
    const { html } = renderMarkdown(
      '<div>preamble</div>\n\n## Tools\n\nSome text.\n',
    );
    expect(html).not.toContain('preamble');
    expect(html).toContain('<h2 id="tools">Tools</h2>');
  });

  it('renders headings with a slugified id', () => {
    const { html } = renderMarkdown('## My Section\n\n### Subsection\n');
    expect(html).toContain('<h2 id="my-section">My Section</h2>');
    expect(html).toContain('<h3>Subsection</h3>');
  });

  it('collects sections in document order, de-duplicating repeated titles', () => {
    const { sections } = renderMarkdown('## Tools\n\n## Drawing\n\n## Tools\n');
    expect(sections).toEqual([
      { id: 'tools', title: 'Tools' },
      { id: 'drawing', title: 'Drawing' },
      { id: 'tools-2', title: 'Tools' },
    ]);
  });

  it('renders bold, inline code, and links', () => {
    const { html } = renderMarkdown(
      '## X\n\nUse **bold**, `code`, and [a link](https://example.com).\n',
    );
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<code>code</code>');
    expect(html).toContain(
      '<a href="https://example.com" target="_blank" rel="noopener noreferrer">a link</a>',
    );
  });

  it('escapes raw HTML in paragraph text', () => {
    const { html } = renderMarkdown('## X\n\n<script>alert(1)</script>\n');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('renders unordered and ordered lists separately', () => {
    const { html } = renderMarkdown(
      '## X\n\n- one\n- two\n\n1. first\n2. second\n',
    );
    expect(html).toContain('<ul><li>one</li><li>two</li></ul>');
    expect(html).toContain('<ol><li>first</li><li>second</li></ol>');
  });

  it('renders a table with header and body rows', () => {
    const { html } = renderMarkdown(
      '## X\n\n| Key | Action |\n|-----|--------|\n| `A` | Do A |\n| `B` | Do B |\n',
    );
    expect(html).toContain('<th>Key</th>');
    expect(html).toContain('<td><code>A</code></td>');
    expect(html).toContain('<td>Do A</td>');
  });

  it('renders a horizontal rule and a blockquote', () => {
    const { html } = renderMarkdown('## X\n\n---\n\n> **Note:** careful.\n');
    expect(html).toContain('<hr>');
    expect(html).toContain(
      '<blockquote><strong>Note:</strong> careful.</blockquote>',
    );
  });
});
