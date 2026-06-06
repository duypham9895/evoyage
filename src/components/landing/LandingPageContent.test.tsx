// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom';
import { render } from '@testing-library/react';
import LandingPageContent from './LandingPageContent';

vi.mock('./VietnamMap', () => ({
  default: () => <div data-testid="vietnam-map" />,
}));

class MockIntersectionObserver implements IntersectionObserver {
  readonly root = null;
  readonly rootMargin = '';
  readonly thresholds = [];

  disconnect() {}
  observe() {}
  takeRecords(): IntersectionObserverEntry[] { return []; }
  unobserve() {}
}

describe('LandingPageContent', () => {
  beforeEach(() => {
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockReturnValue({ matches: false }),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses the Route E wordmark in the footer instead of the old italic text logo', () => {
    const { container } = render(<LandingPageContent />);
    const footer = container.querySelector('footer');

    expect(footer?.querySelector('svg[viewBox="0 0 112 84"]')).toBeInTheDocument();
    expect(footer?.querySelector('.italic')).not.toBeInTheDocument();
  });
});
