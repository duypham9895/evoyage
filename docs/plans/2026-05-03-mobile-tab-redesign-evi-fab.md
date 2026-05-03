# Mobile Tab Redesign + eVi FAB Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** [`docs/specs/2026-05-03-mobile-tab-redesign-evi-fab-design.md`](../specs/2026-05-03-mobile-tab-redesign-evi-fab-design.md)

**Goal:** Reduce visual weight of the `/plan` mobile tab bar by removing eVi from the 5-tab row, surfacing it as a context-independent FAB, and reframing the remaining 4 tabs as equal-width segments with underline active state.

**Architecture:** Split mobile state into `activeTab` (4 values: route/vehicle/battery/stations) and `isEViOpen` (boolean). The existing `<EVi>` component is unchanged but moves from inline tabpanel render into a new `<EViMobileSheet>` overlay opened by a new `<EViFab>` button. Desktop sidebar untouched.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Tailwind CSS, Vitest + @testing-library/react, Playwright (E2E).

**File map (8 files):**
- Modify: `src/components/layout/MobileTabBar.tsx` (drop eVi, flex-1 layout, underline active)
- Create: `src/components/trip/EViFab.tsx` (circular FAB, mobile-only)
- Create: `src/components/trip/EViMobileSheet.tsx` (fullscreen overlay hosting `<EVi>`)
- Modify: `src/components/trip/EViNudge.tsx` (reposition above FAB)
- Modify: `src/app/plan/page.tsx` (state split, 8 call sites, render new components)
- Modify: `src/locales/en.json` (remove `tab_evi`, add `evi_fab_label`)
- Modify: `src/locales/vi.json` (remove `tab_evi`, add `evi_fab_label`)
- Update if needed: `e2e/bilingual.spec.ts` (replace tab click with FAB click)

**Test files:**
- Create: `src/components/trip/EViFab.test.tsx`
- Create: `src/components/trip/EViMobileSheet.test.tsx`
- Modify: `src/components/layout/MobileTabBar.tsx`'s tests do not currently exist — colocate a new `MobileTabBar.test.tsx`

---

## Task 1 — Create `EViFab` component (TDD)

**Files:**
- Create: `src/components/trip/EViFab.test.tsx`
- Create: `src/components/trip/EViFab.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/trip/EViFab.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import EViFab from './EViFab';

vi.mock('@/lib/locale', () => ({
  useLocale: () => ({
    t: (key: string) => (key === 'evi_fab_label' ? 'Mở trợ lý eVi' : key),
  }),
}));

vi.mock('@/lib/haptics', () => ({
  hapticLight: vi.fn(),
}));

describe('EViFab', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders a circular button with "eVi" text and aria-label', () => {
    render(<EViFab onOpen={vi.fn()} isOpen={false} />);
    const button = screen.getByRole('button', { name: 'Mở trợ lý eVi' });
    expect(button).toBeInTheDocument();
    expect(button).toHaveTextContent('eVi');
    expect(button.className).toMatch(/rounded-full/);
  });

  it('is hidden on desktop via lg:hidden class', () => {
    render(<EViFab onOpen={vi.fn()} isOpen={false} />);
    const button = screen.getByRole('button');
    expect(button.className).toMatch(/lg:hidden/);
  });

  it('calls onOpen when clicked', () => {
    const onOpen = vi.fn();
    render(<EViFab onOpen={onOpen} isOpen={false} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('is hidden when isOpen is true', () => {
    render(<EViFab onOpen={vi.fn()} isOpen={true} />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/trip/EViFab.test.tsx`
Expected: FAIL with `Cannot find module './EViFab'`.

- [ ] **Step 3: Add the locale key (needed for test mock alignment with real component)**

This step pre-creates the locale key the component reads. Edit `src/locales/vi.json` — find the spot where `tab_evi` is currently defined and add `evi_fab_label` nearby (don't delete `tab_evi` yet — that happens in Task 4):

```json
"evi_fab_label": "Mở trợ lý eVi",
```

Edit `src/locales/en.json`:

```json
"evi_fab_label": "Open eVi assistant",
```

- [ ] **Step 4: Write minimal `EViFab.tsx` to pass tests**

Create `src/components/trip/EViFab.tsx`:

```tsx
'use client';

import { useLocale } from '@/lib/locale';
import { hapticLight } from '@/lib/haptics';

interface EViFabProps {
  readonly onOpen: () => void;
  readonly isOpen: boolean;
}

export default function EViFab({ onOpen, isOpen }: EViFabProps) {
  const { t } = useLocale();

  if (isOpen) return null;

  return (
    <button
      type="button"
      onClick={() => { hapticLight(); onOpen(); }}
      aria-label={t('evi_fab_label')}
      className="fixed right-3 bottom-[calc(55vh+64px)] lg:hidden z-[750] w-14 h-14 rounded-full bg-[var(--color-accent)] text-[var(--color-background)] font-semibold text-base shadow-lg shadow-black/40 flex items-center justify-center active:scale-[0.96] transition-transform"
    >
      eVi
    </button>
  );
}
```

- [ ] **Step 5: Run tests to verify pass**

Run: `npx vitest run src/components/trip/EViFab.test.tsx`
Expected: PASS — 4/4 tests.

- [ ] **Step 6: Commit**

```bash
git add src/components/trip/EViFab.tsx src/components/trip/EViFab.test.tsx src/locales/en.json src/locales/vi.json
git commit -m "feat(trip): add EViFab — mobile-only floating action button for eVi"
```

---

## Task 2 — Create `EViMobileSheet` component (TDD)

**Files:**
- Create: `src/components/trip/EViMobileSheet.test.tsx`
- Create: `src/components/trip/EViMobileSheet.tsx`

The sheet must keep its child unmounted-resistant: when `isOpen` flips false, the `<EVi>` content stays rendered (CSS hidden), preserving chat state.

- [ ] **Step 1: Write the failing test**

Create `src/components/trip/EViMobileSheet.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import EViMobileSheet from './EViMobileSheet';

vi.mock('@/lib/locale', () => ({
  useLocale: () => ({
    t: (key: string) =>
      key === 'evi_sheet_close' ? 'Đóng' :
      key === 'evi_sheet_title' ? 'eVi' :
      key,
  }),
}));

// Stub the EVi component — we are not testing its internals here, just
// that the sheet renders it and doesn't unmount it across open/close.
vi.mock('@/components/EVi', () => ({
  default: () => <div data-testid="evi-stub">eVi content</div>,
}));

describe('EViMobileSheet', () => {
  beforeEach(() => vi.clearAllMocks());

  const props = {
    onClose: vi.fn(),
    onTripParsed: vi.fn(),
    onPlanTrip: vi.fn(),
    onFindNearbyStations: vi.fn(),
    isPlanning: false,
  };

  it('renders the EVi child component when open', () => {
    render(<EViMobileSheet isOpen={true} {...props} />);
    expect(screen.getByTestId('evi-stub')).toBeInTheDocument();
  });

  it('hides the sheet via class (does not unmount child) when closed', () => {
    render(<EViMobileSheet isOpen={false} {...props} />);
    // Child still mounted — testId resolves
    expect(screen.getByTestId('evi-stub')).toBeInTheDocument();
    // But container has hidden class
    const container = screen.getByTestId('evi-stub').closest('[role="dialog"]');
    expect(container?.className).toMatch(/hidden/);
  });

  it('calls onClose when close button clicked', () => {
    const onClose = vi.fn();
    render(<EViMobileSheet {...props} isOpen={true} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Đóng' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose on Escape keypress when open', () => {
    const onClose = vi.fn();
    render(<EViMobileSheet {...props} isOpen={true} onClose={onClose} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does NOT call onClose on Escape when closed', () => {
    const onClose = vi.fn();
    render(<EViMobileSheet {...props} isOpen={false} onClose={onClose} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/trip/EViMobileSheet.test.tsx`
Expected: FAIL with `Cannot find module './EViMobileSheet'`.

- [ ] **Step 3: Add locale keys for sheet header/close**

Edit `src/locales/vi.json`:

```json
"evi_sheet_title": "eVi",
"evi_sheet_close": "Đóng",
```

Edit `src/locales/en.json`:

```json
"evi_sheet_title": "eVi",
"evi_sheet_close": "Close",
```

- [ ] **Step 4: Write minimal `EViMobileSheet.tsx`**

Create `src/components/trip/EViMobileSheet.tsx`:

```tsx
'use client';

import { useEffect } from 'react';
import { useLocale } from '@/lib/locale';
import { hapticLight } from '@/lib/haptics';
import EVi from '@/components/EVi';
import type { EViTripParams } from '@/lib/evi/types';

interface EViMobileSheetProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly onTripParsed: (params: EViTripParams) => void;
  readonly onPlanTrip: (params: EViTripParams) => void;
  readonly onFindNearbyStations: () => void;
  readonly isPlanning: boolean;
}

export default function EViMobileSheet({
  isOpen,
  onClose,
  onTripParsed,
  onPlanTrip,
  onFindNearbyStations,
  isPlanning,
}: EViMobileSheetProps) {
  const { t } = useLocale();

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('evi_sheet_title')}
      className={`${isOpen ? 'flex' : 'hidden'} fixed inset-0 z-[800] flex-col bg-[var(--color-surface)] lg:hidden`}
    >
      <header className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-surface-hover)] min-h-[52px]">
        <h2 className="font-[family-name:var(--font-heading)] font-semibold text-base text-[var(--color-foreground)]">
          {t('evi_sheet_title')}
        </h2>
        <button
          type="button"
          onClick={() => { hapticLight(); onClose(); }}
          aria-label={t('evi_sheet_close')}
          className="px-3 py-1.5 rounded-md text-sm text-[var(--color-muted)] hover:text-[var(--color-foreground)] hover:bg-[var(--color-surface-hover)] transition-colors"
        >
          {t('evi_sheet_close')}
        </button>
      </header>
      <div className="flex-1 min-h-0 flex flex-col">
        <EVi
          onTripParsed={onTripParsed}
          onPlanTrip={onPlanTrip}
          onFindNearbyStations={onFindNearbyStations}
          isPlanning={isPlanning}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Run tests to verify pass**

Run: `npx vitest run src/components/trip/EViMobileSheet.test.tsx`
Expected: PASS — 5/5 tests.

- [ ] **Step 6: Commit**

```bash
git add src/components/trip/EViMobileSheet.tsx src/components/trip/EViMobileSheet.test.tsx src/locales/en.json src/locales/vi.json
git commit -m "feat(trip): add EViMobileSheet — fullscreen overlay hosting eVi chat"
```

---

## Task 3 — Refactor `MobileTabBar` to 4 equal-width segments

**Files:**
- Modify: `src/components/layout/MobileTabBar.tsx`
- Create: `src/components/layout/MobileTabBar.test.tsx`

This task removes the `evi` member of `MobileTab` — which will create TypeScript errors in `plan/page.tsx`. We accept that compile breakage temporarily; Task 5 fixes it. Tests for `MobileTabBar` itself will still run because vitest doesn't require a clean compile of unrelated files.

- [ ] **Step 1: Write the failing test**

Create `src/components/layout/MobileTabBar.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import MobileTabBar from './MobileTabBar';
import vi_dict from '@/locales/vi.json';
import en_dict from '@/locales/en.json';

let mockLocale: 'vi' | 'en' = 'vi';
const dicts = { vi: vi_dict, en: en_dict } as const;

vi.mock('@/lib/locale', () => ({
  useLocale: () => ({
    locale: mockLocale,
    t: (key: string) => (dicts[mockLocale] as Record<string, string>)[key] ?? key,
  }),
}));

vi.mock('@/lib/haptics', () => ({
  hapticLight: vi.fn(),
}));

describe('MobileTabBar', () => {
  beforeEach(() => {
    mockLocale = 'vi';
    vi.clearAllMocks();
  });

  it('renders exactly 4 tabs (no eVi)', () => {
    render(
      <MobileTabBar
        activeTab="route"
        onTabChange={vi.fn()}
        hasVehicle={false}
        hasRoute={false}
      />,
    );
    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(4);
    const labels = tabs.map(t => t.textContent?.trim());
    expect(labels).toEqual(['Tuyến đường', 'Xe', 'Pin', 'Trạm sạc']);
  });

  it('does not render an eVi tab', () => {
    render(
      <MobileTabBar
        activeTab="route"
        onTabChange={vi.fn()}
        hasVehicle={false}
        hasRoute={false}
      />,
    );
    expect(screen.queryByRole('tab', { name: /eVi/i })).toBeNull();
  });

  it('marks the active tab with aria-selected and accent underline class', () => {
    render(
      <MobileTabBar
        activeTab="vehicle"
        onTabChange={vi.fn()}
        hasVehicle={false}
        hasRoute={false}
      />,
    );
    const active = screen.getByRole('tab', { selected: true });
    expect(active.textContent?.trim()).toBe('Xe');
    expect(active.className).toMatch(/border-b-2/);
  });

  it('uses flex-1 layout (no horizontal scroll)', () => {
    const { container } = render(
      <MobileTabBar
        activeTab="route"
        onTabChange={vi.fn()}
        hasVehicle={false}
        hasRoute={false}
      />,
    );
    const list = container.querySelector('[role="tablist"]');
    expect(list?.className).not.toMatch(/overflow-x-auto/);
    const firstTab = screen.getAllByRole('tab')[0];
    expect(firstTab.className).toMatch(/flex-1/);
  });

  it('calls onTabChange with the right tab id when clicked', () => {
    const onTabChange = vi.fn();
    render(
      <MobileTabBar
        activeTab="route"
        onTabChange={onTabChange}
        hasVehicle={false}
        hasRoute={false}
      />,
    );
    fireEvent.click(screen.getByRole('tab', { name: 'Pin' }));
    expect(onTabChange).toHaveBeenCalledWith('battery');
  });

  it('shows notification dot on route tab when hasRoute=true and not active', () => {
    const { container } = render(
      <MobileTabBar
        activeTab="vehicle"
        onTabChange={vi.fn()}
        hasVehicle={false}
        hasRoute={true}
      />,
    );
    const routeTab = screen.getByRole('tab', { name: /Tuyến đường/ });
    expect(routeTab.querySelector('span.rounded-full')).toBeInTheDocument();
    // Active vehicle tab should NOT show its dot since it's active
    const vehicleTab = container.querySelector('[aria-selected="true"]');
    expect(vehicleTab?.querySelector('span.rounded-full')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/layout/MobileTabBar.test.tsx`
Expected: FAIL — most assertions fail because the current bar still has 5 tabs / heavy active style / overflow-x-auto.

- [ ] **Step 3: Refactor `MobileTabBar.tsx`**

Replace the entire contents of `src/components/layout/MobileTabBar.tsx`:

```tsx
'use client';

import { useLocale } from '@/lib/locale';
import { hapticLight } from '@/lib/haptics';

export type MobileTab = 'route' | 'vehicle' | 'battery' | 'stations';

interface MobileTabBarProps {
  readonly activeTab: MobileTab;
  readonly onTabChange: (tab: MobileTab) => void;
  readonly hasVehicle: boolean;
  readonly hasRoute: boolean;
}

const TABS = [
  { id: 'route' as const, labelKey: 'tab_route' as const },
  { id: 'vehicle' as const, labelKey: 'tab_vehicle' as const },
  { id: 'battery' as const, labelKey: 'tab_battery' as const },
  { id: 'stations' as const, labelKey: 'tab_stations' as const },
] as const;

export default function MobileTabBar({
  activeTab,
  onTabChange,
  hasVehicle,
  hasRoute,
}: MobileTabBarProps) {
  const { t } = useLocale();

  return (
    <div
      className="flex p-0.5 bg-[var(--color-background)] rounded-xl mb-1"
      role="tablist"
      aria-label="Trip planner tabs"
    >
      {TABS.map(({ id, labelKey }) => {
        const isActive = activeTab === id;
        const showDot =
          (id === 'route' && hasRoute) ||
          (id === 'vehicle' && hasVehicle);

        return (
          <button
            key={id}
            role="tab"
            id={`tab-${id}`}
            aria-selected={isActive}
            aria-controls={`tabpanel-${id}`}
            onClick={() => { hapticLight(); onTabChange(id); }}
            className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-2.5 text-[13px] transition-colors whitespace-nowrap min-h-[40px] ${
              isActive
                ? 'text-[var(--color-foreground)] font-semibold border-b-2 border-[var(--color-accent)]'
                : 'text-[var(--color-muted)] font-medium border-b-2 border-transparent hover:text-[var(--color-foreground)]'
            }`}
          >
            {t(labelKey)}
            {showDot && !isActive && (
              <span className="w-[5px] h-[5px] rounded-full bg-[var(--color-accent)]" />
            )}
          </button>
        );
      })}
    </div>
  );
}
```

Note: removed `useRef`/`useEffect`/`scrollActiveIntoView` because the bar no longer scrolls.

- [ ] **Step 4: Run MobileTabBar tests to verify pass**

Run: `npx vitest run src/components/layout/MobileTabBar.test.tsx`
Expected: PASS — 6/6 tests.

- [ ] **Step 5: Verify no other test regressions in this file's import graph (skip page-level tests for now)**

Run: `npx vitest run src/components/layout/`
Expected: PASS for all tests under `layout/`. The breakage in `plan/page.tsx` is a TypeScript error, not a test failure.

- [ ] **Step 6: Commit**

```bash
git add src/components/layout/MobileTabBar.tsx src/components/layout/MobileTabBar.test.tsx
git commit -m "refactor(layout): MobileTabBar — 4 equal-width segments, underline active state"
```

---

## Task 4 — Locale cleanup: remove `tab_evi`

**Files:**
- Modify: `src/locales/en.json`
- Modify: `src/locales/vi.json`

- [ ] **Step 1: Remove `tab_evi` from `src/locales/vi.json`**

Find the line `"tab_evi": "eVi",` and delete it. Other `tab_*` keys stay.

- [ ] **Step 2: Remove `tab_evi` from `src/locales/en.json`**

Find the line `"tab_evi": "eVi",` and delete it.

- [ ] **Step 3: Verify the locale-keys test still passes**

Run: `npx vitest run src/lib/__tests__/locale-keys.test.ts`
Expected: PASS — confirms en/vi key sets match (both removed `tab_evi`).

- [ ] **Step 4: Verify no remaining code references**

Run: `grep -rn "tab_evi" src/ e2e/ 2>/dev/null`
Expected: zero matches.

- [ ] **Step 5: Commit**

```bash
git add src/locales/en.json src/locales/vi.json
git commit -m "chore(i18n): remove unused tab_evi locale key"
```

---

## Task 5 — Integrate in `src/app/plan/page.tsx`

**Files:**
- Modify: `src/app/plan/page.tsx`

This is the biggest task. We split state, replace 8 call sites, fix the keyboard cycle, replace inline render with FAB+sheet.

- [ ] **Step 1: Add new imports**

In `src/app/plan/page.tsx`, near the existing import for `EVi` (line 23) and `MobileTabBar` (line 31), add:

```tsx
import EViFab from '@/components/trip/EViFab';
import EViMobileSheet from '@/components/trip/EViMobileSheet';
```

Remove the now-unused direct `import EVi from '@/components/EVi';` if it's only used in the inline render path. **Verify** with `grep -n "EVi[^a-zA-Z]" src/app/plan/page.tsx` — if `EVi` is referenced elsewhere (e.g., desktop sidebar), keep the import.

- [ ] **Step 2: Update state initialization (line ~68)**

Find:

```tsx
const [activeTab, setActiveTab] = useState<MobileTab>('evi');
```

Replace with:

```tsx
const [activeTab, setActiveTab] = useState<MobileTab>('route');
const [isEViOpen, setIsEViOpen] = useState(false);
```

- [ ] **Step 3: Replace `handleOpenEviFromNudge` (lines ~241-246)**

Find:

```tsx
const handleOpenEviFromNudge = useCallback(() => {
  setShowEviNudge(false);
  setActiveTab('evi');
  handleDesktopTabChange('evi');
  setBottomSheetSnap({ point: 'full', trigger: Date.now() });
}, [handleDesktopTabChange]);
```

Replace with:

```tsx
const handleOpenEviFromNudge = useCallback(() => {
  setShowEviNudge(false);
  setIsEViOpen(true);
  handleDesktopTabChange('evi');
}, [handleDesktopTabChange]);
```

(Removed mobile snap since the sheet itself is fullscreen.)

- [ ] **Step 4: Replace `handleBackToChat` (lines ~289-293)**

Find:

```tsx
const handleBackToChat = useCallback(() => {
  setActiveTab('evi'); // Mobile: switch tab
  handleDesktopTabChange('evi'); // Desktop: switch sidebar back to EVi chat
  setBottomSheetSnap({ point: 'full', trigger: Date.now() });
}, []);
```

Replace with:

```tsx
const handleBackToChat = useCallback(() => {
  setIsEViOpen(true);
  handleDesktopTabChange('evi');
}, [handleDesktopTabChange]);
```

- [ ] **Step 5: Update keyboard cycle (lines ~364, 369)**

Find the forward cycle (line ~364):

```tsx
setActiveTab(prev => prev === 'evi' ? 'route' : prev === 'route' ? 'vehicle' : prev === 'vehicle' ? 'battery' : prev === 'battery' ? 'stations' : prev);
```

Replace with:

```tsx
setActiveTab(prev => prev === 'route' ? 'vehicle' : prev === 'vehicle' ? 'battery' : prev === 'battery' ? 'stations' : prev);
```

Find the reverse cycle (line ~369):

```tsx
setActiveTab(prev => prev === 'stations' ? 'battery' : prev === 'battery' ? 'vehicle' : prev === 'vehicle' ? 'route' : prev === 'route' ? 'evi' : prev);
```

Replace with:

```tsx
setActiveTab(prev => prev === 'stations' ? 'battery' : prev === 'battery' ? 'vehicle' : prev === 'vehicle' ? 'route' : prev);
```

- [ ] **Step 6: Update `onSwitchToEVi` callback site (line ~692)**

Find:

```tsx
onSwitchToEVi={() => { setActiveTab('evi'); handleDesktopTabChange('evi'); }}
```

Replace with:

```tsx
onSwitchToEVi={() => { setIsEViOpen(true); handleDesktopTabChange('evi'); }}
```

- [ ] **Step 7: Remove inline `<EVi>` render from tabpanel (lines ~740-742)**

Find:

```tsx
<div className={`flex-1 min-h-0 ${activeTab === 'evi' ? 'flex flex-col' : 'overflow-y-auto'}`} role="tabpanel" id={`tabpanel-${activeTab}`} aria-labelledby={`tab-${activeTab}`}>
  {activeTab === 'evi' && (
    <EVi onTripParsed={handleTripParsed} onPlanTrip={handleEViPlanTrip} onFindNearbyStations={handleFindNearbyStations} isPlanning={isPlanning} />
  )}
```

Replace the wrapper line and remove the `evi` block:

```tsx
<div className="flex-1 min-h-0 overflow-y-auto" role="tabpanel" id={`tabpanel-${activeTab}`} aria-labelledby={`tab-${activeTab}`}>
```

(Delete the entire `{activeTab === 'evi' && (...)}` block. The other `activeTab === '...'` panels for route/vehicle/battery/stations remain unchanged.)

- [ ] **Step 8: Strip `evi` from planButton/errorDisplay/timeoutBanner conditions (lines ~809-811)**

Find:

```tsx
{activeTab !== 'stations' && activeTab !== 'evi' && planButton}
{activeTab !== 'stations' && activeTab !== 'evi' && errorDisplay}
{activeTab !== 'stations' && activeTab !== 'evi' && timeoutBanner}
```

Replace with:

```tsx
{activeTab !== 'stations' && planButton}
{activeTab !== 'stations' && errorDisplay}
{activeTab !== 'stations' && timeoutBanner}
```

- [ ] **Step 9: Render `EViFab` and `EViMobileSheet`**

Find the existing `<FeedbackFAB />` render near line ~816 (mobile branch). Add the FAB and sheet **before** it. Result around that area:

```tsx
<EViFab onOpen={() => setIsEViOpen(true)} isOpen={isEViOpen} />
<EViMobileSheet
  isOpen={isEViOpen}
  onClose={() => setIsEViOpen(false)}
  onTripParsed={handleTripParsed}
  onPlanTrip={handleEViPlanTrip}
  onFindNearbyStations={handleFindNearbyStations}
  isPlanning={isPlanning}
/>
<FeedbackFAB />
```

The desktop `<FeedbackFAB />` near line ~924 stays untouched (FAB and sheet are mobile-only via `lg:hidden`).

- [ ] **Step 10: Remove the `setBottomSheetSnap` import / unused state if applicable**

Check whether `setBottomSheetSnap` is still used elsewhere in the file:

Run: `grep -n "setBottomSheetSnap\|bottomSheetSnap" src/app/plan/page.tsx`

If it's still referenced by other handlers (e.g., `handleTripParsed`, `handleEViPlanTrip`, `handleFindNearbyStations`), leave it. Only remove if the grep shows zero remaining references.

- [ ] **Step 11: Verify type compilation**

Run: `npx tsc --noEmit`
Expected: zero errors. If there's an error like `Type '"evi"' is not assignable to type 'MobileTab'`, find and fix the missed call site.

- [ ] **Step 12: Run the full test suite**

Run: `npm test`
Expected: all tests pass (existing 813+ plus the 3 new test files added in Tasks 1–3).

- [ ] **Step 13: Run the build**

Run: `npx next build`
Expected: build succeeds with no TypeScript errors and no React Compiler warnings.

- [ ] **Step 14: Commit**

```bash
git add src/app/plan/page.tsx
git commit -m "feat(plan): split mobile tab state — eVi opens via FAB, 4 tabs in bottom sheet"
```

---

## Task 6 — Reposition `EViNudge` above the new FAB

**Files:**
- Modify: `src/components/trip/EViNudge.tsx`

- [ ] **Step 1: Update the className on line 65**

Find:

```tsx
className="fixed bottom-[calc(55vh+64px)] right-3 lg:bottom-36 lg:right-6 z-[700] max-w-xs w-[calc(100vw-1.5rem)] sm:w-auto rounded-lg p-3 shadow-lg shadow-black/40 border border-[var(--color-accent-dim)] bg-[var(--color-surface)] animate-fadeIn"
```

Replace with:

```tsx
className="fixed bottom-[calc(55vh+132px)] right-3 lg:bottom-36 lg:right-6 z-[700] max-w-xs w-[calc(100vw-1.5rem)] sm:w-auto rounded-lg p-3 shadow-lg shadow-black/40 border border-[var(--color-accent-dim)] bg-[var(--color-surface)] animate-fadeIn"
```

Only the mobile bottom value changed: `+64px` → `+132px`. Desktop classes (`lg:bottom-36 lg:right-6`) untouched.

- [ ] **Step 2: Run existing EViNudge test to verify no regression**

Run: `npx vitest run src/components/trip/EViNudge.test.tsx`
Expected: PASS — the test asserts behavior, not exact pixel position.

- [ ] **Step 3: Commit**

```bash
git add src/components/trip/EViNudge.tsx
git commit -m "fix(trip): reposition EViNudge above eVi FAB on mobile"
```

---

## Task 7 — Update E2E if it depended on the eVi tab

**Files:**
- Possibly modify: `e2e/bilingual.spec.ts` (and any other spec that clicked the tab)

- [ ] **Step 1: Search for E2E references to the eVi tab**

Run: `grep -rn "tab_evi\|eVi\|tab-evi" e2e/`

If a spec opens eVi by clicking the tab text or `tab-evi` element, that selector no longer exists.

- [ ] **Step 2: If matches found, update selectors to target the FAB**

Replace tab clicks:

```ts
// Before
await page.getByRole('tab', { name: /eVi/i }).click();

// After
await page.getByRole('button', { name: /Mở trợ lý eVi|Open eVi assistant/ }).click();
```

If no matches, skip this task.

- [ ] **Step 3: Run E2E suite to verify**

Run: `npx playwright test --project="Desktop Chrome"`
Expected: all 18 E2E tests still green.

- [ ] **Step 4: Commit (skip if no changes)**

```bash
git add e2e/
git commit -m "test(e2e): update eVi entry point selector to FAB"
```

---

## Task 8 — Final verification

- [ ] **Step 1: Confirm no leftover `'evi'` strings in MobileTab logic**

Run: `grep -n "setActiveTab('evi')\|activeTab === 'evi'\|activeTab !== 'evi'" src/`
Expected: zero matches.

- [ ] **Step 2: Run full test suite**

Run: `npm test`
Expected: PASS, count ≥ 816 (was 813, +3 new test files: EViFab, EViMobileSheet, MobileTabBar).

- [ ] **Step 3: Build production bundle**

Run: `npx next build`
Expected: success.

- [ ] **Step 4: Manual visual QA on mobile**

Start dev server: `npm run dev`. Open `http://localhost:3000/plan` in browser. Resize to 390px width (Chrome DevTools mobile emulation). Verify:

- [ ] 4 tabs visible (Tuyến đường / Xe / Pin / Trạm sạc), no horizontal scroll.
- [ ] Active tab shows underline (no filled green pill).
- [ ] eVi FAB visible bottom-right, "eVi" text inside.
- [ ] Tap FAB → fullscreen eVi sheet opens.
- [ ] Type a message in eVi, then tap close.
- [ ] Tap FAB again → message draft / chat history still there.
- [ ] FeedbackFAB still accessible below eVi FAB.
- [ ] Resize to 1024px → eVi FAB hidden, desktop sidebar shows eVi tab as before.

- [ ] **Step 5: Commit any remaining changes (if visual QA surfaced an adjustment)**

If everything passes cleanly, no commit needed.

---

## Summary

8 tasks. ~30 commits worst case (TDD red/green/commit per file). Each task produces a self-contained, testable increment. Tasks 1–4 are independent and can be parallelized; Task 5 depends on 1, 2, 3, 4. Task 6 depends on 5. Task 7 may be a no-op. Task 8 is verification.
