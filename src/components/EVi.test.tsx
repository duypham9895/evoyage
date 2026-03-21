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
  evi_find_stations: 'Find stations nearby',
  evi_mic_denied: 'Microphone access denied.',
  evi_mic_previously_denied: 'Microphone blocked. Change in browser settings.',
  evi_mic_unsupported: 'Browser doesn\'t support microphone.',
  evi_no_speech: 'No speech detected.',
  evi_speech_network_error: 'Network error during voice recognition.',
  evi_speech_error: 'Voice input failed.',
  evi_suggestions_loading: 'Loading suggestions...',
  evi_suggestions_label: 'Suggested follow-up questions',
};

vi.mock('@/lib/locale', () => ({
  useLocale: () => ({
    locale: 'vi',
    t: (key: string) => translations[key] ?? key,
  }),
}));

vi.mock('@/lib/haptics', () => ({
  hapticLight: vi.fn(),
}));

const mockStartListening = vi.fn();
const mockStopListening = vi.fn();

let mockSpeechReturn = {
  isSupported: false,
  isListening: false,
  isProcessing: false,
  transcript: '',
  error: null as string | null,
  startListening: mockStartListening,
  stopListening: mockStopListening,
};

vi.mock('@/hooks/useSpeechInput', () => ({
  useSpeechInput: () => mockSpeechReturn,
}));

function setSpeechState(overrides: Partial<typeof mockSpeechReturn>) {
  mockSpeechReturn = { ...mockSpeechReturn, ...overrides };
}

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
  recentTrips: [] as { start: string; end: string; vehicleName?: string | null }[],
  followUpSuggestions: [] as string[],
  isSuggestionsLoading: false,
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
  mockStartListening.mockReset();
  mockStopListening.mockReset();
  setHookState({
    state: 'idle',
    messages: [],
    lastResponse: null,
    userLocation: null,
    isFirstVisit: true,
    recentTrips: [],
    followUpSuggestions: [],
    isSuggestionsLoading: false,
  });
  setSpeechState({
    isSupported: false,
    isListening: false,
    transcript: '',
    error: null,
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

      expect(screen.queryByText('From')).not.toBeInTheDocument();
      expect(screen.getByText('Đà Lạt')).toBeInTheDocument();
      expect(screen.queryByText('Vehicle')).not.toBeInTheDocument();
      expect(screen.queryByText('Battery')).not.toBeInTheDocument();
    });
  });

  describe('greeting and suggestions', () => {
    it('renders greeting message', () => {
      render(<EVi onTripParsed={vi.fn()} />);

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

    it('shows contextual chips for returning users without trip history', () => {
      setHookState({ isFirstVisit: false, recentTrips: [] });

      render(<EVi onTripParsed={vi.fn()} />);

      // First-visit chips should NOT appear
      expect(screen.queryByText('SG ra Vũng Tàu, VF5')).not.toBeInTheDocument();

      // Should show some contextual chips (exact ones depend on time of day)
      const allContextual = [
        'Đi Đà Lạt cuối tuần', 'SG ra Vũng Tàu', 'Hà Nội đi Sa Pa',
        'SG đi Phan Thiết hôm nay', 'Đi Nha Trang, VF8', 'Hà Nội ra Hạ Long',
        'Kế hoạch đi Đà Lạt ngày mai', 'SG đi Cần Thơ', 'Đà Nẵng đi Huế',
        'SG đi Phan Thiết',
      ];
      const foundContextual = allContextual.some((c) => screen.queryByText(c));
      expect(foundContextual).toBe(true);

      // Quick action chip should always appear for returning users
      expect(screen.getByText('Find stations nearby')).toBeInTheDocument();
    });

    it('shows personalized chips from trip history', () => {
      setHookState({
        isFirstVisit: false,
        recentTrips: [
          { start: 'Hồ Chí Minh, Vietnam', end: 'Đà Lạt, Vietnam', vehicleName: 'VinFast VF 8' },
          { start: 'Hà Nội, Vietnam', end: 'Hải Phòng, Vietnam', vehicleName: null },
        ],
      });

      render(<EVi onTripParsed={vi.fn()} />);

      // Personalized chips from history (shortened format)
      expect(screen.getByText('Hồ Chí Minh → Đà Lạt, VF 8')).toBeInTheDocument();
      expect(screen.getByText('Hà Nội → Hải Phòng')).toBeInTheDocument();

      // Plus find stations chip
      expect(screen.getByText('Find stations nearby')).toBeInTheDocument();
    });

    it('deduplicates identical trips in suggestion chips', () => {
      setHookState({
        isFirstVisit: false,
        recentTrips: [
          { start: 'Hồ Chí Minh, Vietnam', end: 'Vũng Tàu, Vietnam', vehicleName: 'VinFast VF 5' },
          { start: 'Hồ Chí Minh, Vietnam', end: 'Vũng Tàu, Vietnam', vehicleName: 'VinFast VF 5' },
        ],
      });

      render(<EVi onTripParsed={vi.fn()} />);

      // Should only appear once despite two identical trips
      const chips = screen.getAllByText('Hồ Chí Minh → Vũng Tàu, VF 5');
      expect(chips).toHaveLength(1);
    });

    it('sends message when a trip suggestion chip is clicked', () => {
      render(<EVi onTripParsed={vi.fn()} />);

      fireEvent.click(screen.getByText('Đi Đà Lạt cuối tuần'));

      expect(mockSendMessage).toHaveBeenCalledWith('Đi Đà Lạt cuối tuần');
    });

    it('calls onFindNearbyStations when find-stations chip is clicked', () => {
      const onFindNearbyStations = vi.fn();
      setHookState({ isFirstVisit: false, recentTrips: [] });

      render(<EVi onTripParsed={vi.fn()} onFindNearbyStations={onFindNearbyStations} />);

      fireEvent.click(screen.getByText('Find stations nearby'));

      expect(onFindNearbyStations).toHaveBeenCalledOnce();
      expect(mockSendMessage).not.toHaveBeenCalled();
    });

    it('does not show find-stations chip for first-time visitors', () => {
      setHookState({ isFirstVisit: true });

      render(<EVi onTripParsed={vi.fn()} />);

      expect(screen.queryByText('Find stations nearby')).not.toBeInTheDocument();
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

      // No location badge rendered when userLocation is null
      expect(screen.queryByText('Tô Hiến Thành')).not.toBeInTheDocument();
    });
  });

  describe('voice input — mic button', () => {
    it('shows mic button when speech recognition is supported', () => {
      setSpeechState({ isSupported: true });

      render(<EVi onTripParsed={vi.fn()} />);

      expect(screen.getByLabelText('Speak')).toBeInTheDocument();
    });

    it('hides mic button when speech recognition is not supported', () => {
      setSpeechState({ isSupported: false });

      render(<EVi onTripParsed={vi.fn()} />);

      expect(screen.queryByLabelText('Speak')).not.toBeInTheDocument();
    });

    it('calls startListening when mic button is clicked', () => {
      setSpeechState({ isSupported: true });

      render(<EVi onTripParsed={vi.fn()} />);
      fireEvent.click(screen.getByLabelText('Speak'));

      expect(mockStartListening).toHaveBeenCalledOnce();
    });

    it('calls stopListening when mic button is clicked while listening', () => {
      setSpeechState({ isSupported: true, isListening: true });

      render(<EVi onTripParsed={vi.fn()} />);
      fireEvent.click(screen.getByLabelText('Speak'));

      expect(mockStopListening).toHaveBeenCalledOnce();
    });

    it('shows pulsing animation while listening', () => {
      setSpeechState({ isSupported: true, isListening: true });

      render(<EVi onTripParsed={vi.fn()} />);

      const micButton = screen.getByLabelText('Speak');
      expect(micButton.className).toContain('animate-pulse');
      expect(micButton.className).toContain('bg-[var(--color-danger)]');
    });

    it('shows "Listening..." status text while recording', () => {
      setSpeechState({ isSupported: true, isListening: true });

      render(<EVi onTripParsed={vi.fn()} />);

      expect(screen.getByText('Listening...')).toBeInTheDocument();
    });

    it('shows mic button as SVG icon without Beta badge', () => {
      setSpeechState({ isSupported: true });

      render(<EVi onTripParsed={vi.fn()} />);

      const micButton = screen.getByLabelText('Speak');
      expect(micButton.querySelector('svg')).toBeInTheDocument();
      expect(screen.queryByText('Beta')).not.toBeInTheDocument();
    });
  });

  describe('voice input — live transcript', () => {
    it('displays live transcript while listening', () => {
      setSpeechState({ isSupported: true, isListening: true, transcript: 'Đi Đà Lạt' });

      render(<EVi onTripParsed={vi.fn()} />);

      expect(screen.getByText('Đi Đà Lạt')).toBeInTheDocument();
    });

    it('does not display transcript when not listening', () => {
      setSpeechState({ isSupported: true, isListening: false, transcript: 'Đi Đà Lạt' });

      render(<EVi onTripParsed={vi.fn()} />);

      // The transcript bubble only shows when isListening is true
      // When not listening, it should not be in the live transcript area
      // (it may have been sent as a message already)
      const italicElements = document.querySelectorAll('.italic');
      expect(italicElements.length).toBe(0);
    });
  });

  describe('voice input — error feedback', () => {
    it('shows mic permission denied error message', () => {
      setSpeechState({ isSupported: true, error: 'not_allowed' });

      render(<EVi onTripParsed={vi.fn()} />);

      expect(screen.getByText('Microphone access denied.')).toBeInTheDocument();
    });

    it('shows no speech detected error message', () => {
      setSpeechState({ isSupported: true, error: 'no_speech' });

      render(<EVi onTripParsed={vi.fn()} />);

      expect(screen.getByText('No speech detected.')).toBeInTheDocument();
    });

    it('shows network error message', () => {
      setSpeechState({ isSupported: true, error: 'network' });

      render(<EVi onTripParsed={vi.fn()} />);

      expect(screen.getByText('Network error during voice recognition.')).toBeInTheDocument();
    });

    it('shows previously denied error with browser settings guidance', () => {
      setSpeechState({ isSupported: true, error: 'previously_denied' });

      render(<EVi onTripParsed={vi.fn()} />);

      expect(screen.getByText('Microphone blocked. Change in browser settings.')).toBeInTheDocument();
    });

    it('shows browser unsupported error message', () => {
      setSpeechState({ isSupported: true, error: 'browser_unsupported' });

      render(<EVi onTripParsed={vi.fn()} />);

      expect(screen.getByText("Browser doesn't support microphone.")).toBeInTheDocument();
    });

    it('shows generic speech error for unknown errors', () => {
      setSpeechState({ isSupported: true, error: 'recognition_failed' });

      render(<EVi onTripParsed={vi.fn()} />);

      expect(screen.getByText('Voice input failed.')).toBeInTheDocument();
    });

    it('does not show error while actively listening', () => {
      setSpeechState({ isSupported: true, isListening: true, error: 'no_speech' });

      render(<EVi onTripParsed={vi.fn()} />);

      expect(screen.queryByText('No speech detected.')).not.toBeInTheDocument();
    });

    it('does not show error when there is no error', () => {
      setSpeechState({ isSupported: true, error: null });

      render(<EVi onTripParsed={vi.fn()} />);

      expect(screen.queryByText('Microphone access denied.')).not.toBeInTheDocument();
      expect(screen.queryByText('No speech detected.')).not.toBeInTheDocument();
      expect(screen.queryByText('Network error during voice recognition.')).not.toBeInTheDocument();
      expect(screen.queryByText('Voice input failed.')).not.toBeInTheDocument();
    });
  });

  describe('AI follow-up suggestions', () => {
    it('shows loading skeleton when suggestions are being fetched', () => {
      setHookState({
        state: 'follow_up',
        lastResponse: followUpResponse,
        messages: [
          { role: 'user', content: 'Đi Đà Lạt' },
          { role: 'assistant', content: 'Bạn đang lái xe gì?' },
        ],
        isSuggestionsLoading: true,
        followUpSuggestions: [],
      });

      render(<EVi onTripParsed={vi.fn()} />);

      expect(screen.getByLabelText('Loading suggestions...')).toBeInTheDocument();
    });

    it('shows AI-generated suggestion chips when loaded', () => {
      setHookState({
        state: 'follow_up',
        lastResponse: followUpResponse,
        messages: [
          { role: 'user', content: 'Đi Đà Lạt' },
          { role: 'assistant', content: 'Bạn đang lái xe gì?' },
        ],
        isSuggestionsLoading: false,
        followUpSuggestions: ['VF 8 Plus', 'VF 5 Plus', 'VF e34'],
      });

      render(<EVi onTripParsed={vi.fn()} />);

      expect(screen.getByText('VF 8 Plus')).toBeInTheDocument();
      expect(screen.getByText('VF 5 Plus')).toBeInTheDocument();
      expect(screen.getByText('VF e34')).toBeInTheDocument();
    });

    it('sends suggestion as message when clicked', () => {
      setHookState({
        state: 'follow_up',
        lastResponse: followUpResponse,
        messages: [
          { role: 'user', content: 'Đi Đà Lạt' },
          { role: 'assistant', content: 'Bạn đang lái xe gì?' },
        ],
        isSuggestionsLoading: false,
        followUpSuggestions: ['VF 8 Plus', 'VF 5 Plus', 'VF e34'],
      });

      render(<EVi onTripParsed={vi.fn()} />);

      fireEvent.click(screen.getByText('VF 8 Plus'));

      expect(mockSendMessage).toHaveBeenCalledWith('VF 8 Plus');
    });

    it('does not show suggestions when state is complete', () => {
      setHookState({
        state: 'complete',
        lastResponse: completeResponse,
        messages: [
          { role: 'user', content: 'Đi Đà Lạt VF8 pin 80' },
          { role: 'assistant', content: 'Lên kế hoạch HCM → Đà Lạt' },
        ],
        followUpSuggestions: ['Some suggestion'],
      });

      render(<EVi onTripParsed={vi.fn()} />);

      expect(screen.queryByText('Some suggestion')).not.toBeInTheDocument();
    });

    it('does not show suggestions when state is processing', () => {
      setHookState({
        state: 'processing',
        messages: [
          { role: 'user', content: 'Đi Đà Lạt' },
        ],
        followUpSuggestions: ['Some suggestion'],
      });

      render(<EVi onTripParsed={vi.fn()} />);

      expect(screen.queryByText('Some suggestion')).not.toBeInTheDocument();
    });

    it('does not show suggestion chips when empty and not loading', () => {
      setHookState({
        state: 'follow_up',
        lastResponse: followUpResponse,
        messages: [
          { role: 'user', content: 'Đi Đà Lạt' },
          { role: 'assistant', content: 'Bạn đang lái xe gì?' },
        ],
        isSuggestionsLoading: false,
        followUpSuggestions: [],
      });

      render(<EVi onTripParsed={vi.fn()} />);

      expect(screen.queryByLabelText('Suggested follow-up questions')).not.toBeInTheDocument();
      expect(screen.queryByLabelText('Loading suggestions...')).not.toBeInTheDocument();
    });
  });
});
