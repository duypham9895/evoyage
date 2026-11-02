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

  it('links to the privacy page from the footer', () => {
    const { container } = render(<LandingPageContent />);
    const footer = container.querySelector('footer');
    const privacyLink = Array.from(footer?.querySelectorAll('a') ?? []).find(
      (a) => a.getAttribute('href') === '/privacy',
    );
    expect(privacyLink).toBeDefined();
    expect(privacyLink?.textContent).toBe('Quyền riêng tư');
  });

  it('never skips a heading level, so screen-reader heading navigation stays in order', () => {
    const { container } = render(<LandingPageContent />);
    const levels = Array.from(container.querySelectorAll('h1, h2, h3, h4, h5, h6'))
      .map((h) => Number(h.tagName[1]));

    expect(levels.length).toBeGreaterThan(0);
    levels.forEach((level, i) => {
      const previous = i === 0 ? 1 : levels[i - 1];
      expect(level - previous, `heading ${i} jumps from h${previous} to h${level}`).toBeLessThanOrEqual(1);
    });
  });
});
