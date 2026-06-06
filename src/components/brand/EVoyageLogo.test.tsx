// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import EVoyageLogo from './EVoyageLogo';

describe('EVoyageLogo', () => {
  it('renders the Route E mark with the Voyage wordmark text', () => {
    const { container } = render(<EVoyageLogo />);

    expect(screen.getByText('Voyage')).toBeInTheDocument();
    expect(container.querySelector('svg')).toHaveAttribute('viewBox', '0 0 112 84');
  });

  it('is hidden from assistive tech so parent links can provide one clean label', () => {
    const { container } = render(<EVoyageLogo />);

    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
  });

  it('supports the larger landing navigation size', () => {
    const { container } = render(<EVoyageLogo size="md" />);
    const svg = container.querySelector('svg');

    expect(svg?.className.baseVal).toContain('h-8');
    expect(screen.getByText('Voyage').className).toContain('text-2xl');
  });
});
