// @vitest-environment jsdom
/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import EVi from './EVi';
import type { EViTripParams } from '@/lib/evi/types';

// ── jsdom stubs ──
Element.prototype.scrollTo = vi.fn();

// ── Mocks ──

vi.mock('@/lib/locale', () => ({
  useLocale: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        evi_greeting_first: 'Hi! Tell me where you want to go!',
        evi_placeholder: 'E.g., Go to Da Lat, VF8, battery 85%',
        evi_from: 'From',
        evi_to: 'To',
        evi_vehicle: 'Vehicle',
        evi_battery: 'Battery',
        evi_plan_button: 'Plan Trip',
        evi_edit_button: 'Edit',
        evi_manual_link: 'Enter manually',
        evi_speak: 'Speak',
        evi_voice_beta: 'Beta',
        evi_listening: 'Listening...',
        evi_retry: 'Retry',
        evi_start_over: 'Start over',
        evi_location_prompt: 'Enter location',
        evi_greeting_morning: 'Good morning!',
        evi_greeting_evening: 'Good evening!',
        evi_greeting_return: 'Welcome back!',
      };
      return translations[key] ?? key;
    },
  }),
}));

vi.mock('@/lib/haptics', () => ({
  hapticLight: vi.fn(),
}));

vi.mock('@/hooks/useSpeechRecognition', () => ({
  useSpeechRecognition: () => ({
    isSupported: false,
    isListening: false,
    transcript: '',
    startListening: vi.fn(),
    stopListening: vi.fn(),
  }),
}));

// ── Shared test data ──

const mockTripParams: EViTripParams = {
  start: 'Hồ Chí Minh',
  startLat: 10.8,
  startLng: 106.6,
  startSource: 'geolocation',
  end: 'Đà Lạt',
  endLat: 11.9,
  endLng: 108.4,
  vehicleId: 'vf7-plus',
  vehicleName: 'VinFast VF 7 Plus',
  vehicleData: null,
  currentBattery: 60,
  minArrival: null,
  rangeSafetyFactor: null,
};

const completeResponse = {
  isComplete: true,
  followUpType: null,
  tripParams: mockTripParams,
  followUpQuestion: null,
  followUpCount: 0,
  maxFollowUps: 2,
  suggestedOptions: [],
  displayMessage: 'Lên kế hoạch HCM → Đà Lạt',
  error: null,
};

const followUpResponse = {
  isComplete: false,
  followUpType: 'free_text',
  tripParams: mockTripParams,
  followUpQuestion: 'Bạn đang lái xe gì?',
  followUpCount: 1,
  maxFollowUps: 2,
  suggestedOptions: [],
  displayMessage: 'Bạn đang lái xe gì?',
  error: null,
};

// ── Mock useEVi ──

const mockSendMessage = vi.fn();
const mockReset = vi.fn();

let mockUseEViReturn = {
  state: 'idle' as string,
  messages: [] as { role: 'user' | 'assistant'; content: string }[],
  lastResponse: null as typeof completeResponse | typeof followUpResponse | null,
  userLocation: null as { lat: number; lng: number; address: string } | null,
  isFirstVisit: true,
  sendMessage: mockSendMessage,
  reset: mockReset,
};

vi.mock('@/hooks/useEVi', () => ({
  useEVi: () => mockUseEViReturn,
}));

// ── Helpers ──

function setHookState(overrides: Partial<typeof mockUseEViReturn>) {
  mockUseEViReturn = { ...mockUseEViReturn, ...overrides };
}

beforeEach(() => {
  mockSendMessage.mockReset();
  mockReset.mockReset();
  setHookState({
    state: 'idle',
    messages: [],
    lastResponse: null,
    userLocation: null,
    isFirstVisit: true,
  });
});

// ── Tests ──

describe('EVi component', () => {
  describe('Plan Trip and Edit buttons', () => {
    it('shows Plan Trip and Edit buttons when state is complete with tripParams', () => {
      setHookState({
        state: 'complete',
        lastResponse: completeResponse,
        messages: [
          { role: 'user', content: 'Đi Đà Lạt' },
          { role: 'assistant', content: 'Lên kế hoạch HCM → Đà Lạt' },
        ],
      });

      render(<EVi onTripParsed={vi.fn()} />);

      expect(screen.getByText('Plan Trip')).toBeInTheDocument();
      expect(screen.getByText('Edit')).toBeInTheDocument();
    });

    it('does not show Plan Trip / Edit when state is not complete', () => {
      setHookState({
        state: 'follow_up',
        lastResponse: followUpResponse,
        messages: [
          { role: 'user', content: 'Đi Đà Lạt' },
          { role: 'assistant', content: 'Bạn đang lái xe gì?' },
        ],
      });

      render(<EVi onTripParsed={vi.fn()} />);

      expect(screen.queryByText('Plan Trip')).not.toBeInTheDocument();
    });

    it('Plan Trip calls onPlanTrip (not onTripParsed) when provided', () => {
      const onTripParsed = vi.fn();
      const onPlanTrip = vi.fn();

      setHookState({
        state: 'complete',
        lastResponse: completeResponse,
        messages: [
          { role: 'user', content: 'Đi Đà Lạt' },
          { role: 'assistant', content: 'Lên kế hoạch HCM → Đà Lạt' },
        ],
      });

      render(<EVi onTripParsed={onTripParsed} onPlanTrip={onPlanTrip} />);

      fireEvent.click(screen.getByText('Plan Trip'));

      expect(onPlanTrip).toHaveBeenCalledOnce();
      expect(onPlanTrip).toHaveBeenCalledWith(mockTripParams);
      expect(onTripParsed).not.toHaveBeenCalled();
    });

    it('Plan Trip falls back to onTripParsed when onPlanTrip is not provided', () => {
      const onTripParsed = vi.fn();

      setHookState({
        state: 'complete',
        lastResponse: completeResponse,
        messages: [
          { role: 'user', content: 'Đi Đà Lạt' },
          { role: 'assistant', content: 'Lên kế hoạch HCM → Đà Lạt' },
        ],
      });

      render(<EVi onTripParsed={onTripParsed} />);

      fireEvent.click(screen.getByText('Plan Trip'));

      expect(onTripParsed).toHaveBeenCalledOnce();
      expect(onTripParsed).toHaveBeenCalledWith(mockTripParams);
    });

    it('Edit always calls onTripParsed (not onPlanTrip)', () => {
      const onTripParsed = vi.fn();
      const onPlanTrip = vi.fn();

      setHookState({
        state: 'complete',
        lastResponse: completeResponse,
        messages: [
          { role: 'user', content: 'Đi Đà Lạt' },
          { role: 'assistant', content: 'Lên kế hoạch HCM → Đà Lạt' },
        ],
      });

      render(<EVi onTripParsed={onTripParsed} onPlanTrip={onPlanTrip} />);

      // The "Edit" button inside the result card (not the manual link)
      const editButtons = screen.getAllByText('Edit');
      fireEvent.click(editButtons[0]);

      expect(onTripParsed).toHaveBeenCalledOnce();
      expect(onTripParsed).toHaveBeenCalledWith(mockTripParams);
      expect(onPlanTrip).not.toHaveBeenCalled();
    });

    it('displays parsed trip details in the result card', () => {
      setHookState({
        state: 'complete',
        lastResponse: completeResponse,
        messages: [
          { role: 'user', content: 'Đi Đà Lạt' },
          { role: 'assistant', content: 'Lên kế hoạch HCM → Đà Lạt' },
        ],
      });

      render(<EVi onTripParsed={vi.fn()} />);

      expect(screen.getByText('Hồ Chí Minh')).toBeInTheDocument();
      expect(screen.getByText('Đà Lạt')).toBeInTheDocument();
      expect(screen.getByText('VinFast VF 7 Plus')).toBeInTheDocument();
      expect(screen.getByText('60%')).toBeInTheDocument();
    });
  });

  describe('result card field visibility', () => {
    it('hides fields that are null in tripParams', () => {
      const sparseParams: EViTripParams = {
        ...mockTripParams,
        start: null,
        vehicleName: null,
        currentBattery: null,
      };

      setHookState({
        state: 'complete',
        lastResponse: { ...completeResponse, tripParams: sparseParams },
        messages: [
          { role: 'user', content: 'Đi Đà Lạt' },
          { role: 'assistant', content: 'Lên kế hoạch → Đà Lạt' },
        ],
      });

      render(<EVi onTripParsed={vi.fn()} />);

      // "From" label should not appear since start is null
      expect(screen.queryByText('From')).not.toBeInTheDocument();
      // "To" label should still appear
      expect(screen.getByText('Đà Lạt')).toBeInTheDocument();
      // Vehicle and battery labels should not appear
      expect(screen.queryByText('Vehicle')).not.toBeInTheDocument();
      expect(screen.queryByText('Battery')).not.toBeInTheDocument();
    });
  });

  describe('greeting and suggestions', () => {
    it('renders greeting message', () => {
      render(<EVi onTripParsed={vi.fn()} />);

      // Should show one of the greeting messages (depends on time of day)
      const greetings = [
        'Hi! Tell me where you want to go!',
        'Good morning!',
        'Good evening!',
        'Welcome back!',
      ];
      const found = greetings.some((g) => screen.queryByText(g));
      expect(found).toBe(true);
    });

    it('shows suggestion chips for first-time visitors when idle', () => {
      render(<EVi onTripParsed={vi.fn()} />);

      expect(screen.getByText('Đi Đà Lạt cuối tuần')).toBeInTheDocument();
      expect(screen.getByText('SG ra Vũng Tàu, VF5')).toBeInTheDocument();
    });

    it('hides suggestion chips when not first visit', () => {
      setHookState({ isFirstVisit: false });

      render(<EVi onTripParsed={vi.fn()} />);

      expect(screen.queryByText('Đi Đà Lạt cuối tuần')).not.toBeInTheDocument();
    });
  });

  describe('error recovery', () => {
    it('shows Retry and Start over buttons when state is error', () => {
      setHookState({
        state: 'error',
        messages: [
          { role: 'user', content: 'test' },
          { role: 'assistant', content: 'Lỗi xảy ra' },
        ],
      });

      render(<EVi onTripParsed={vi.fn()} />);

      expect(screen.getByText('Retry')).toBeInTheDocument();
      expect(screen.getByText('Start over')).toBeInTheDocument();
    });

    it('Start over calls reset', () => {
      setHookState({
        state: 'error',
        messages: [
          { role: 'user', content: 'test' },
          { role: 'assistant', content: 'Lỗi xảy ra' },
        ],
      });

      render(<EVi onTripParsed={vi.fn()} />);

      fireEvent.click(screen.getByText('Start over'));

      expect(mockReset).toHaveBeenCalledOnce();
    });
  });

  describe('text input and send', () => {
    it('sends message when send button is clicked', () => {
      render(<EVi onTripParsed={vi.fn()} />);

      const input = screen.getByPlaceholderText('E.g., Go to Da Lat, VF8, battery 85%');

      fireEvent.change(input, { target: { value: 'Đi Đà Lạt' } });
      fireEvent.click(screen.getByLabelText('Send'));

      expect(mockSendMessage).toHaveBeenCalledWith('Đi Đà Lạt');
    });

    it('sends message on Enter key press', () => {
      render(<EVi onTripParsed={vi.fn()} />);

      const input = screen.getByPlaceholderText('E.g., Go to Da Lat, VF8, battery 85%');

      fireEvent.change(input, { target: { value: 'Đi Đà Lạt' } });
      fireEvent.keyDown(input, { key: 'Enter' });

      expect(mockSendMessage).toHaveBeenCalledWith('Đi Đà Lạt');
    });

    it('does not send empty message', () => {
      render(<EVi onTripParsed={vi.fn()} />);

      fireEvent.click(screen.getByLabelText('Send'));

      expect(mockSendMessage).not.toHaveBeenCalled();
    });

    it('clears input after sending', () => {
      render(<EVi onTripParsed={vi.fn()} />);

      const input = screen.getByPlaceholderText('E.g., Go to Da Lat, VF8, battery 85%');

      fireEvent.change(input, { target: { value: 'Đi Đà Lạt' } });
      fireEvent.keyDown(input, { key: 'Enter' });

      expect(input).toHaveValue('');
    });
  });

  describe('location badge', () => {
    it('shows location badge when userLocation is available', () => {
      setHookState({
        userLocation: {
          lat: 10.8,
          lng: 106.6,
          address: 'Tô Hiến Thành, Quận 10, Hồ Chí Minh, Việt Nam',
        },
      });

      render(<EVi onTripParsed={vi.fn()} />);

      expect(screen.getByText('Tô Hiến Thành, Quận 10')).toBeInTheDocument();
    });

    it('does not show location badge when userLocation is null', () => {
      render(<EVi onTripParsed={vi.fn()} />);

      expect(screen.queryByText('📍')).not.toBeInTheDocument();
    });
  });
});
