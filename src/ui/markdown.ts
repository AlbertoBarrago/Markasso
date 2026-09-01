/**
 * Minimal Markdown-to-HTML renderer covering only the subset of syntax used
 * by MANUAL.md (headings, tables, lists, blockquotes, hr, bold/code/links).
 * Not a general-purpose parser — kept deliberately small to avoid pulling in
 * a Markdown dependency for a single in-app document.
 */

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function renderInline(text: string): string {
  return escapeHtml(text)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(
      /\[([^\]]+)\]\(([^)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>',
    );
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function tableCells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());
}

function renderTable(rows: readonly string[]): string {
  const header = tableCells(rows[0]!);
  const body = rows.slice(2).map(tableCells);
  const thead = `<thead><tr>${header.map((cell) => `<th>${renderInline(cell)}</th>`).join('')}</tr></thead>`;
  const tbody = `<tbody>${body
    .map(
      (row) =>
        `<tr>${row.map((cell) => `<td>${renderInline(cell)}</td>`).join('')}</tr>`,
    )
    .join('')}</tbody>`;
  return `<table>${thead}${tbody}</table>`;
}

export interface MarkdownSection {
  readonly id: string;
  readonly title: string;
}

export interface RenderedMarkdown {
  readonly html: string;
  readonly sections: readonly MarkdownSection[];
}

/** Renders the body of the document, skipping any leading raw-HTML preamble. */
export function renderMarkdown(markdown: string): RenderedMarkdown {
  const bodyStart = markdown.startsWith('## ')
    ? 0
    : markdown.indexOf('\n## ') + 1 || 0;
  const lines = markdown.slice(bodyStart).split('\n');

  const html: string[] = [];
  const sections: MarkdownSection[] = [];
  const seenIds = new Set<string>();
  let paragraph: string[] = [];
  let listItems: string[] = [];
  let listTag: 'ul' | 'ol' | null = null;

  const flushParagraph = (): void => {
    if (paragraph.length > 0) {
      html.push(`<p>${renderInline(paragraph.join(' '))}</p>`);
      paragraph = [];
    }
  };
  const flushList = (): void => {
    if (listTag && listItems.length > 0) {
      html.push(
        `<${listTag}>${listItems.map((item) => `<li>${renderInline(item)}</li>`).join('')}</${listTag}>`,
      );
    }
    listItems = [];
    listTag = null;
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;

    if (line.trim() === '') {
      flushParagraph();
      flushList();
      i++;
      continue;
    }
    if (line.startsWith('### ')) {
      flushParagraph();
      flushList();
      html.push(`<h3>${renderInline(line.slice(4))}</h3>`);
      i++;
      continue;
    }
    if (line.startsWith('## ')) {
      flushParagraph();
      flushList();
      const title = line.slice(3).trim();
      let id = slugify(title);
      while (seenIds.has(id)) id = `${id}-2`;
      seenIds.add(id);
      sections.push({ id, title });
      html.push(`<h2 id="${id}">${renderInline(title)}</h2>`);
      i++;
      continue;
    }
    if (line.trim() === '---') {
      flushParagraph();
      flushList();
      html.push('<hr>');
      i++;
      continue;
    }
    if (line.startsWith('> ')) {
      flushParagraph();
      flushList();
      html.push(`<blockquote>${renderInline(line.slice(2))}</blockquote>`);
      i++;
      continue;
    }
    if (
      line.startsWith('| ') &&
      /^\|[-\s|]+\|$/.test(lines[i + 1]?.trim() ?? '')
    ) {
      flushParagraph();
      flushList();
      const tableLines = [line, lines[i + 1]!];
      let j = i + 2;
      while (j < lines.length && lines[j]!.startsWith('|')) {
        tableLines.push(lines[j]!);
        j++;
      }
      html.push(renderTable(tableLines));
      i = j;
      continue;
    }
    const orderedMatch = /^\d+\.\s+(.*)$/.exec(line);
    const unorderedMatch = /^-\s+(.*)$/.exec(line);
    if (orderedMatch || unorderedMatch) {
      flushParagraph();
      const tag = orderedMatch ? 'ol' : 'ul';
      if (listTag && listTag !== tag) flushList();
      listTag = tag;
      listItems.push((orderedMatch ?? unorderedMatch)![1]!);
      i++;
      continue;
    }

    paragraph.push(line.trim());
    i++;
  }
  flushParagraph();
  flushList();

  return { html: html.join('\n'), sections };
}
