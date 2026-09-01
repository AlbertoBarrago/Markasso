export type ReportCategory = 'bug' | 'visual' | 'performance' | 'other';

export interface Report {
  readonly title: string;
  readonly description: string;
  readonly category: ReportCategory;
  readonly steps?: string;
  readonly userAgent?: string;
}

const CATEGORIES: ReadonlySet<string> = new Set<ReportCategory>([
  'bug',
  'visual',
  'performance',
  'other',
]);

export const MIN_TITLE_LENGTH = 5;
export const MAX_TITLE_LENGTH = 120;
export const MIN_DESCRIPTION_LENGTH = 20;
export const MAX_DESCRIPTION_LENGTH = 4_000;
export const MAX_STEPS_LENGTH = 2_000;
export const MAX_USER_AGENT_LENGTH = 500;

const CATEGORY_LABELS: Record<ReportCategory, string> = {
  bug: 'Bug',
  visual: 'Visual glitch',
  performance: 'Performance',
  other: 'Other',
};

// Every C0/C1 control character except tab (U+0009) and newline (U+000A).
// biome-ignore lint/suspicious/noControlCharactersInRegex: stripping control characters from user input is the point
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000B-\u001F\u007F]/g;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalize(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(CONTROL_CHARACTERS, '');
}

function singleLine(text: string): string {
  return normalize(text).replace(/\n/g, ' ');
}

/**
 * Rejects anything outside the length bounds, measured after trimming.
 * Returns null both for a wrong type and for a length violation, so callers
 * can treat every failure the same way.
 */
function boundedString(
  value: unknown,
  minLength: number,
  maxLength: number,
): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed.length < minLength || trimmed.length > maxLength) return null;
  return trimmed;
}

/**
 * An optional field is valid when absent, and otherwise must be a string
 * within bounds. Returns undefined when absent or empty, null when invalid.
 */
function optionalBoundedString(
  value: unknown,
  maxLength: number,
): string | null | undefined {
  if (value === undefined) return undefined;
  const bounded = boundedString(value, 0, maxLength);
  if (bounded === null) return null;
  return bounded.length > 0 ? bounded : undefined;
}

export function validateReport(value: unknown): Report | null {
  if (!isRecord(value)) return null;

  const title = boundedString(value.title, MIN_TITLE_LENGTH, MAX_TITLE_LENGTH);
  if (title === null) return null;

  const description = boundedString(
    value.description,
    MIN_DESCRIPTION_LENGTH,
    MAX_DESCRIPTION_LENGTH,
  );
  if (description === null) return null;

  if (typeof value.category !== 'string' || !CATEGORIES.has(value.category)) {
    return null;
  }

  const steps = optionalBoundedString(value.steps, MAX_STEPS_LENGTH);
  if (steps === null) return null;

  const userAgent = optionalBoundedString(
    value.userAgent,
    MAX_USER_AGENT_LENGTH,
  );
  if (userAgent === null) return null;

  return {
    title: singleLine(title),
    description: normalize(description),
    category: value.category as ReportCategory,
    ...(steps !== undefined && { steps: normalize(steps) }),
    ...(userAgent !== undefined && { userAgent: singleLine(userAgent) }),
  };
}

/**
 * Neutralizes GitHub's autolink syntax in user-supplied text. An unescaped
 * '@' or '#' in an issue body notifies real accounts and cross-links real
 * issues, so a public report form would otherwise let anyone spam
 * notifications through this repository. The empty HTML comment renders as
 * nothing while breaking GitHub's mention and reference parser.
 */
export function neutralizeAutolinks(text: string): string {
  return text.replace(/[@#]/g, (character) => `${character}<!---->`);
}

export function buildIssueTitle(report: Report): string {
  return neutralizeAutolinks(report.title);
}

export function buildIssueBody(report: Report): string {
  const sections = [
    '### Description',
    neutralizeAutolinks(report.description),
    '',
    `**Category:** ${CATEGORY_LABELS[report.category]}`,
  ];

  if (report.steps) {
    sections.push(
      '',
      '### Steps to reproduce',
      neutralizeAutolinks(report.steps),
    );
  }
  if (report.userAgent) {
    sections.push(
      '',
      `**User agent:** \`${report.userAgent.replace(/`/g, '')}\``,
    );
  }
  sections.push('', '---', '_Submitted through the in-app report form._');

  return sections.join('\n');
}
