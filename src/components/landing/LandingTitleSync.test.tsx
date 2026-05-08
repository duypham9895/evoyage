// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { LandingWrapper, useLandingLocale } from './LandingClient';
import LandingTitleSync from './LandingTitleSync';
import en from '@/locales/en.json';
import vi from '@/locales/vi.json';

function ToggleButton() {
  const { toggleLocale } = useLandingLocale();
  return <button onClick={toggleLocale}>toggle</button>;
}

afterEach(() => {
  document.title = '';
});

describe('LandingTitleSync', () => {
  it('sets document.title from the vi locale on mount', () => {
    render(
      <LandingWrapper>
        <LandingTitleSync titleKey="meta_title_default" />
      </LandingWrapper>,
    );
    expect(document.title).toBe(vi.meta_title_default);
  });

  it('updates document.title when locale toggles to en', () => {
    const { getByText } = render(
      <LandingWrapper>
        <LandingTitleSync titleKey="meta_title_default" />
        <ToggleButton />
      </LandingWrapper>,
    );

    act(() => {
      getByText('toggle').click();
    });

    expect(document.title).toBe(en.meta_title_default);
  });

  it('updates document.title back to vi when toggled twice', () => {
    const { getByText } = render(
      <LandingWrapper>
        <LandingTitleSync titleKey="meta_title_default" />
        <ToggleButton />
      </LandingWrapper>,
    );

    act(() => {
      getByText('toggle').click();
    });
    act(() => {
      getByText('toggle').click();
    });

    expect(document.title).toBe(vi.meta_title_default);
  });

  it('falls back to the titleKey string for an unknown key', () => {
    render(
      <LandingWrapper>
        <LandingTitleSync titleKey="nonexistent_key_xyz" />
      </LandingWrapper>,
    );
    expect(document.title).toBe('nonexistent_key_xyz');
  });

  it('returns null (renders no DOM elements)', () => {
    const { container } = render(
      <LandingWrapper>
        <LandingTitleSync titleKey="meta_title_default" />
      </LandingWrapper>,
    );
    expect(container.firstChild).toBeNull();
  });
});
