import { describe, expect, it } from 'vitest';
import {
  buildIssueBody,
  buildIssueTitle,
  MAX_DESCRIPTION_LENGTH,
  MAX_TITLE_LENGTH,
  MIN_DESCRIPTION_LENGTH,
  MIN_TITLE_LENGTH,
  neutralizeAutolinks,
  validateReport,
} from '../src/io/report_validation';

const validPayload = {
  title: 'Freehand strokes flicker on release',
  description: 'The stroke sometimes fails to finish when opening the hand.',
  category: 'bug',
};

describe('validateReport', () => {
  it('accepts a minimal valid report', () => {
    const report = validateReport(validPayload);
    expect(report).toEqual(validPayload);
  });

  it('trims whitespace and drops empty optional fields', () => {
    const report = validateReport({
      ...validPayload,
      steps: '  ',
      userAgent: '  Mozilla/5.0  ',
    });
    expect(report?.steps).toBeUndefined();
    expect(report?.userAgent).toBe('Mozilla/5.0');
  });

  it('rejects a non-object payload', () => {
    expect(validateReport(null)).toBeNull();
    expect(validateReport('nope')).toBeNull();
  });

  it('rejects a title outside the length bounds', () => {
    expect(
      validateReport({
        ...validPayload,
        title: 'x'.repeat(MIN_TITLE_LENGTH - 1),
      }),
    ).toBeNull();
    expect(
      validateReport({
        ...validPayload,
        title: 'x'.repeat(MAX_TITLE_LENGTH + 1),
      }),
    ).toBeNull();
  });

  it('rejects a description outside the length bounds', () => {
    expect(
      validateReport({
        ...validPayload,
        description: 'x'.repeat(MIN_DESCRIPTION_LENGTH - 1),
      }),
    ).toBeNull();
    expect(
      validateReport({
        ...validPayload,
        description: 'x'.repeat(MAX_DESCRIPTION_LENGTH + 1),
      }),
    ).toBeNull();
  });

  it('rejects an unknown category', () => {
    expect(
      validateReport({ ...validPayload, category: 'security' }),
    ).toBeNull();
  });

  it('strips control characters and collapses newlines in single-line fields', () => {
    const report = validateReport({
      ...validPayload,
      title: 'Line one\nLine two',
      userAgent: 'Mozilla\x00/5.0',
    });
    expect(report?.title).toBe('Line one Line two');
    expect(report?.userAgent).toBe('Mozilla/5.0');
  });

  it('preserves newlines in multi-line fields', () => {
    const report = validateReport({
      ...validPayload,
      description: 'Step one\nStep two\nStep three, long enough to pass.',
    });
    expect(report?.description).toContain('\n');
  });
});

describe('neutralizeAutolinks', () => {
  it('breaks GitHub mentions and issue references', () => {
    expect(neutralizeAutolinks('cc @someone see #123')).toBe(
      'cc @<!---->someone see #<!---->123',
    );
  });
});

describe('buildIssueTitle / buildIssueBody', () => {
  it('neutralizes autolinks in the title and body', () => {
    const report = validateReport({
      ...validPayload,
      title: 'Ping @maintainer about #42',
      steps: 'Mention @user then check #1',
      userAgent: 'Mozilla/5.0',
    })!;

    expect(buildIssueTitle(report)).not.toContain('@maintainer');
    expect(buildIssueTitle(report)).toContain('@<!---->maintainer');

    const body = buildIssueBody(report);
    expect(body).toContain('### Description');
    expect(body).toContain('**Category:** Bug');
    expect(body).toContain('### Steps to reproduce');
    expect(body).toContain('@<!---->user');
    expect(body).toContain('#<!---->1');
    expect(body).toContain('**User agent:** `Mozilla/5.0`');
  });

  it('omits optional sections when absent', () => {
    const report = validateReport(validPayload)!;
    const body = buildIssueBody(report);
    expect(body).not.toContain('Steps to reproduce');
    expect(body).not.toContain('User agent');
  });
});
