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

/** Renders the body of the document, skipping any leading raw-HTML preamble. */
export function renderMarkdown(markdown: string): string {
  const firstHeading = markdown.indexOf('\n## ');
  const body =
    firstHeading === -1 ? markdown : markdown.slice(firstHeading + 1);
  const lines = body.split('\n');

  const html: string[] = [];
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
      html.push(`<h2>${renderInline(line.slice(3))}</h2>`);
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

  return html.join('\n');
}
