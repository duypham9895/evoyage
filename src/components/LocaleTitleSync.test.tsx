// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { LocaleProvider, useLocale } from '@/lib/locale';
import LocaleTitleSync from './LocaleTitleSync';
import en from '@/locales/en.json';
import vi from '@/locales/vi.json';

function ToggleButton() {
  const { toggleLocale } = useLocale();
  return <button onClick={toggleLocale}>toggle</button>;
}

afterEach(() => {
  document.title = '';
});

describe('LocaleTitleSync', () => {
  it('sets document.title from the vi locale on mount', () => {
    render(
      <LocaleProvider>
        <LocaleTitleSync titleKey="meta_title_plan" />
      </LocaleProvider>,
    );
    expect(document.title).toBe(vi.meta_title_plan);
  });

  it('updates document.title when locale toggles to en', () => {
    const { getByText } = render(
      <LocaleProvider>
        <LocaleTitleSync titleKey="meta_title_plan" />
        <ToggleButton />
      </LocaleProvider>,
    );

    act(() => {
      getByText('toggle').click();
    });

    expect(document.title).toBe(en.meta_title_plan);
  });

  it('updates document.title back to vi when toggled twice', () => {
    const { getByText } = render(
      <LocaleProvider>
        <LocaleTitleSync titleKey="meta_title_plan" />
        <ToggleButton />
      </LocaleProvider>,
    );

    act(() => {
      getByText('toggle').click();
    });
    act(() => {
      getByText('toggle').click();
    });

    expect(document.title).toBe(vi.meta_title_plan);
  });

  it('works with meta_title_default key', () => {
    render(
      <LocaleProvider>
        <LocaleTitleSync titleKey="meta_title_default" />
      </LocaleProvider>,
    );
    expect(document.title).toBe(vi.meta_title_default);
  });

  it('returns null (renders no DOM elements)', () => {
    const { container } = render(
      <LocaleProvider>
        <LocaleTitleSync titleKey="meta_title_plan" />
      </LocaleProvider>,
    );
    expect(container.firstChild).toBeNull();
  });
});
