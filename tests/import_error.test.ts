import { afterEach, describe, expect, it, vi } from 'vitest';
import { createScene } from '../src/core/scene';
import { History } from '../src/engine/history';
import { importMarkasso } from '../src/io/markasso';

/** Synchronous FileReader stand-in: `readAsText` hands back the file's text. */
function stubReader(text: string): void {
  vi.stubGlobal(
    'FileReader',
    class {
      onload: ((event: { target: { result: string } }) => void) | null = null;
      readAsText() {
        this.onload?.({ target: { result: text } });
      }
    },
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('importMarkasso errors', () => {
  const file = {} as File;

  it('reports a file that is not a Markasso board', () => {
    stubReader(JSON.stringify({ hello: 'world' }));
    const onError = vi.fn();
    const history = new History(createScene());
    importMarkasso(file, history, onError);
    expect(onError).toHaveBeenCalledWith('markassoInvalidFile');
    expect(history.present.elements).toHaveLength(0);
  });

  it('reports a file that is not JSON', () => {
    stubReader('{ not json');
    const onError = vi.fn();
    importMarkasso(file, new History(createScene()), onError);
    expect(onError).toHaveBeenCalledWith('markassoUnreadableFile');
  });
});
