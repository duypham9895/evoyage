// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom';
import { fireEvent, render, screen, within } from '@testing-library/react';
import PrivacyPolicyContent from './PrivacyPolicyContent';
import en from '@/locales/en.json';
import viLocale from '@/locales/vi.json';

class MockIntersectionObserver implements IntersectionObserver {
  readonly root = null;
  readonly rootMargin = '';
  readonly thresholds = [];
  disconnect() {}
  observe() {}
  takeRecords(): IntersectionObserverEntry[] { return []; }
  unobserve() {}
}

const PROCESSOR_SLUGS = [
  'posthog',
  'supabase',
  'vercel',
  'resend',
  'openai',
  'minimax',
  'groq',
  'mapbox',
  'openstreetmap',
  'osrm',
  'upstash',
  'google',
  'vinfast',
] as const;

function clickEnToggle() {
  fireEvent.click(screen.getAllByRole('button', { name: /EN/ })[0]!);
}

describe('<PrivacyPolicyContent />', () => {
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

  it('renders in Vietnamese by default: heading, draft banner and the abroad sentence', () => {
    render(<PrivacyPolicyContent />);
    const content = screen.getByTestId('privacy-content');
    expect(within(content).getByText(viLocale.privacy_heading)).toBeInTheDocument();
    expect(within(content).getByText(viLocale.privacy_draft_banner)).toBeInTheDocument();
    expect(within(content).getByText(viLocale.privacy_abroad)).toBeInTheDocument();
  });

  it('switches to English when the EN toggle is clicked', () => {
    render(<PrivacyPolicyContent />);
    clickEnToggle();
    const content = screen.getByTestId('privacy-content');
    expect(within(content).getByText(en.privacy_heading)).toBeInTheDocument();
    expect(within(content).getByText(en.privacy_abroad)).toBeInTheDocument();
  });

  it('the privacy-content test id sits on <main>, below the navbar (navbar logo is outside it)', () => {
    render(<PrivacyPolicyContent />);
    const content = screen.getByTestId('privacy-content');
    expect(content.tagName).toBe('MAIN');
    const logo = screen.getByLabelText('eVoyage home');
    expect(content.contains(logo)).toBe(false);
  });

  describe('content checks (3a-3h)', () => {
    it('3a: every processor test id exists and names its company', () => {
      render(<PrivacyPolicyContent />);
      for (const slug of PROCESSOR_SLUGS) {
        const el = screen.getByTestId(`privacy-processor-${slug}`);
        const nameKey = `privacy_processor_${slug}_name` as keyof typeof viLocale;
        expect(within(el).getByText(viLocale[nameKey] as string)).toBeInTheDocument();
      }
    });

    it('3b: the trip-planning-to-AI sentence includes "even if you never open eVi" (and the vi equivalent)', () => {
      render(<PrivacyPolicyContent />);
      const openaiVi = screen.getByTestId('privacy-processor-openai');
      expect(within(openaiVi).getByText(/ngay cả khi bạn chưa mở eVi/)).toBeInTheDocument();

      clickEnToggle();
      const openaiEn = screen.getByTestId('privacy-processor-openai');
      expect(within(openaiEn).getByText(/even if you never open eVi/)).toBeInTheDocument();
    });

    it('3c: the supabase entry contains "Singapore"', () => {
      render(<PrivacyPolicyContent />);
      const supabase = screen.getByTestId('privacy-processor-supabase');
      expect(within(supabase).getByText(/Singapore/)).toBeInTheDocument();
    });

    it('3d: the posthog entry contains "United States" / "Hoa Kỳ"', () => {
      render(<PrivacyPolicyContent />);
      const posthogVi = screen.getByTestId('privacy-processor-posthog');
      expect(within(posthogVi).getByText(/Hoa Kỳ/)).toBeInTheDocument();

      clickEnToggle();
      const posthogEn = screen.getByTestId('privacy-processor-posthog');
      expect(within(posthogEn).getByText(/United States/)).toBeInTheDocument();
    });

    it('3e: the vercel entry says region not set, mentions location, and never claims a US region', () => {
      render(<PrivacyPolicyContent />);
      const vercelVi = screen.getByTestId('privacy-processor-vercel');
      expect(within(vercelVi).getByText(/vị trí/)).toBeInTheDocument();
      expect(within(vercelVi).getByText(/chưa được thiết lập/)).toBeInTheDocument();
      expect(vercelVi.textContent).not.toMatch(/Hoa Kỳ/);

      clickEnToggle();
      const vercelEn = screen.getByTestId('privacy-processor-vercel');
      expect(within(vercelEn).getByText(/location/)).toBeInTheDocument();
      expect(within(vercelEn).getByText(/region is not set/)).toBeInTheDocument();
      expect(vercelEn.textContent).not.toMatch(/United States/);
    });

    it('3f: the posthog entry never calls the events "anonymous" / "ẩn danh"', () => {
      render(<PrivacyPolicyContent />);
      const posthogVi = screen.getByTestId('privacy-processor-posthog');
      expect(posthogVi.textContent).not.toMatch(/ẩn danh/i);

      clickEnToggle();
      const posthogEn = screen.getByTestId('privacy-processor-posthog');
      expect(posthogEn.textContent).not.toMatch(/anonymous/i);
    });

    it('3g: the openstreetmap entry says the browser sends GPS directly, before eVi opens, on phones/tablets/narrow windows — both languages', () => {
      render(<PrivacyPolicyContent />);
      const osmVi = screen.getByTestId('privacy-processor-openstreetmap');
      expect(osmVi.textContent).toMatch(/trước cả khi bạn mở eVi/);
      expect(osmVi.textContent).toMatch(/điện thoại, máy tính bảng và cửa sổ trình duyệt hẹp/);

      clickEnToggle();
      const osmEn = screen.getByTestId('privacy-processor-openstreetmap');
      expect(osmEn.textContent).toMatch(/before you ever open eVi/);
      expect(osmEn.textContent).toMatch(/phones, tablets and narrow browser windows/);
    });

    it('3h: the posthog entry contains the pseudonymous daily-ID sentence — both languages', () => {
      render(<PrivacyPolicyContent />);
      const posthogVi = screen.getByTestId('privacy-processor-posthog');
      expect(posthogVi.textContent).toMatch(/mã định danh thay thế/);
      expect(posthogVi.textContent).toMatch(/thay đổi/);

      clickEnToggle();
      const posthogEn = screen.getByTestId('privacy-processor-posthog');
      expect(posthogEn.textContent).toMatch(/pseudonymous/);
      expect(posthogEn.textContent).toMatch(/changing daily/);
    });
  });

  it('the google entry names the real "open in Google Maps" button label, not an invented one — both languages', () => {
    render(<PrivacyPolicyContent />);
    const googleVi = screen.getByTestId('privacy-processor-google');
    expect(googleVi.textContent).toContain(viLocale.open_in_google_maps);

    clickEnToggle();
    const googleEn = screen.getByTestId('privacy-processor-google');
    expect(googleEn.textContent).toContain(en.open_in_google_maps);
  });

  it('4: "not defined yet" / "chưa được xác định" is present in both languages', () => {
    render(<PrivacyPolicyContent />);
    const content = screen.getByTestId('privacy-content');
    expect(content.textContent).toMatch(/chưa được xác định/);

    clickEnToggle();
    const contentEn = screen.getByTestId('privacy-content');
    expect(contentEn.textContent).toMatch(/not defined yet/);
  });

  it('5: contact gives the planner route first, uses the real feedback locale values, says to leave an email, and links to GitHub issues with a public warning', () => {
    render(<PrivacyPolicyContent />);
    const contact = screen.getByTestId('privacy-contact');

    // The planner route is named, and both rendered locale values appear —
    // not hard-coded English strings (revision 6.1 B-1 fix).
    expect(contact.textContent).toMatch(/lên kế hoạch chuyến đi/);
    expect(within(contact).getByText(new RegExp(viLocale.feedback_title))).toBeInTheDocument();
    expect(within(contact).getByText(new RegExp(viLocale.feedback_cat_contact_support))).toBeInTheDocument();
    expect(contact.textContent).toMatch(/để lại email/);

    const githubLink = within(contact).getByRole('link', {
      name: new RegExp(viLocale.privacy_contact_github.slice(0, 10)),
    });
    expect(githubLink).toHaveAttribute('href', 'https://github.com/duypham9895/evoyage/issues');
    expect(contact.textContent).toMatch(/công khai/);
  });

  it('6: no svg or img inside privacy-content', () => {
    render(<PrivacyPolicyContent />);
    const content = screen.getByTestId('privacy-content');
    expect(content.querySelector('svg')).toBeNull();
    expect(content.querySelector('img')).toBeNull();
  });
});
