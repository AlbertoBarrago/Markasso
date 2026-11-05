import { describe, expect, it, vi } from 'vitest';
import {
  REMOTE_CHECK_INTERVAL,
  REMOTE_CHECK_THROTTLE,
  RemoteCheckSchedule,
  remoteDecision,
} from '../src/ui/cloud_remote_check';

const clean = {
  boardChanged: false,
  stale: false,
  interacting: false,
  writing: false,
  unsaved: false,
  elementsChanged: false,
};

describe('remoteDecision', () => {
  it('applies when nothing changed locally', () => {
    expect(remoteDecision(clean)).toBe('apply');
  });
  it('drops results for another board or one our save already reached', () => {
    expect(remoteDecision({ ...clean, boardChanged: true })).toBe('drop');
    expect(remoteDecision({ ...clean, stale: true, interacting: true })).toBe(
      'drop',
    );
  });
  it('defers while interacting, even with unsaved edits', () => {
    expect(remoteDecision({ ...clean, interacting: true })).toBe('defer');
    expect(remoteDecision({ ...clean, interacting: true, unsaved: true })).toBe(
      'defer',
    );
  });
  it('reports a conflict for unsaved local edits', () => {
    expect(
      remoteDecision({ ...clean, unsaved: true, elementsChanged: true }),
    ).toBe('conflict');
  });
  it('leaves a save in flight to meet the change itself', () => {
    expect(remoteDecision({ ...clean, writing: true, unsaved: true })).toBe(
      'drop',
    );
  });
  it('drops when edits were already saved', () => {
    expect(remoteDecision({ ...clean, elementsChanged: true })).toBe('drop');
  });
});

describe('RemoteCheckSchedule', () => {
  function setup(visible = true) {
    vi.useFakeTimers();
    const state = { visible };
    const check = vi.fn();
    const schedule = new RemoteCheckSchedule(check, {
      now: () => Date.now(),
      visible: () => state.visible,
      setInterval: (run, ms) => setInterval(run, ms),
      clearInterval: (handle) =>
        clearInterval(handle as ReturnType<typeof setInterval>),
    });
    return { state, check, schedule };
  }
  it('does nothing before start and after stop', () => {
    const { check, schedule } = setup();
    schedule.visibilityChanged();
    vi.advanceTimersByTime(REMOTE_CHECK_INTERVAL * 3);
    expect(check).not.toHaveBeenCalled();
    schedule.start();
    schedule.stop();
    vi.advanceTimersByTime(REMOTE_CHECK_INTERVAL * 3);
    expect(check).not.toHaveBeenCalled();
    expect(schedule.polling).toBe(false);
    vi.useRealTimers();
  });
  it('polls every interval while visible', () => {
    const { check, schedule } = setup();
    schedule.start();
    vi.advanceTimersByTime(REMOTE_CHECK_INTERVAL - 1);
    expect(check).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(check).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(REMOTE_CHECK_INTERVAL);
    expect(check).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
  it('runs no timer while hidden and checks when visible again', () => {
    const { state, check, schedule } = setup(false);
    schedule.start();
    expect(schedule.polling).toBe(false);
    vi.advanceTimersByTime(REMOTE_CHECK_INTERVAL * 3);
    expect(check).not.toHaveBeenCalled();
    state.visible = true;
    schedule.visibilityChanged();
    expect(check).toHaveBeenCalledTimes(1);
    expect(schedule.polling).toBe(true);
    state.visible = false;
    schedule.visibilityChanged();
    expect(schedule.polling).toBe(false);
    vi.useRealTimers();
  });
  it('throttles checks on visibility to one every few seconds', () => {
    const { state, check, schedule } = setup();
    schedule.start();
    schedule.visibilityChanged();
    expect(check).not.toHaveBeenCalled();
    vi.advanceTimersByTime(REMOTE_CHECK_THROTTLE);
    schedule.visibilityChanged();
    expect(check).toHaveBeenCalledTimes(1);
    state.visible = false;
    schedule.visibilityChanged();
    state.visible = true;
    vi.advanceTimersByTime(REMOTE_CHECK_THROTTLE - 1);
    schedule.visibilityChanged();
    expect(check).toHaveBeenCalledTimes(1);
    // The interval restarts on return, so the next poll is a full interval away.
    vi.advanceTimersByTime(REMOTE_CHECK_INTERVAL - 1);
    expect(check).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(check).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});
