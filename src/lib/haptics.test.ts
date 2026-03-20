// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { hapticLight, hapticMedium, hapticTick } from './haptics';

describe('haptics', () => {
  let vibrateMock: ReturnType<typeof vi.fn>;
  let matchMediaMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vibrateMock = vi.fn();
    Object.defineProperty(navigator, 'vibrate', {
      value: vibrateMock,
      writable: true,
      configurable: true,
    });
    matchMediaMock = vi.fn().mockReturnValue({ matches: false });
    Object.defineProperty(window, 'matchMedia', {
      value: matchMediaMock,
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('hapticLight', () => {
    it('calls vibrate with 10ms', () => {
      hapticLight();
      expect(vibrateMock).toHaveBeenCalledWith(10);
    });

    it('does not vibrate when prefers-reduced-motion is set', () => {
      matchMediaMock.mockReturnValue({ matches: true });
      hapticLight();
      expect(vibrateMock).not.toHaveBeenCalled();
    });
  });

  describe('hapticMedium', () => {
    it('calls vibrate with 25ms', () => {
      hapticMedium();
      expect(vibrateMock).toHaveBeenCalledWith(25);
    });
  });

  describe('hapticTick', () => {
    it('calls vibrate with 5ms', () => {
      hapticTick();
      expect(vibrateMock).toHaveBeenCalledWith(5);
    });
  });

  describe('SSR safety', () => {
    it('does not throw when navigator.vibrate is undefined', () => {
      Object.defineProperty(navigator, 'vibrate', {
        value: undefined,
        writable: true,
        configurable: true,
      });
      expect(() => hapticLight()).not.toThrow();
      expect(() => hapticMedium()).not.toThrow();
      expect(() => hapticTick()).not.toThrow();
    });
  });
});
