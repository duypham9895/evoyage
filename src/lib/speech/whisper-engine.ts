import type { SpeechEngine, SpeechEngineCallbacks } from './types';
import {
  LOCALE_TO_SPEECH_LANG,
  MIN_AUDIO_BLOB_SIZE,
  MAX_RECORDING_DURATION_MS,
  SILENCE_RMS_THRESHOLD,
  SILENCE_DURATION_MS,
} from './types';

/** Check if MediaRecorder + getUserMedia are available */
export function isWhisperSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    typeof MediaRecorder !== 'undefined' &&
    typeof navigator?.mediaDevices?.getUserMedia === 'function'
  );
}

/** Negotiate the best audio MIME type for MediaRecorder */
function getRecordingMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return 'audio/webm';
  // Safari: audio/mp4, Chrome/Firefox: audio/webm;codecs=opus
  if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) return 'audio/webm;codecs=opus';
  if (MediaRecorder.isTypeSupported('audio/webm')) return 'audio/webm';
  if (MediaRecorder.isTypeSupported('audio/mp4')) return 'audio/mp4';
  return 'audio/webm';
}

/** Options for dependency injection (testing) */
export interface WhisperEngineOptions {
  readonly getUserMedia?: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
  readonly createAudioContext?: () => AudioContext;
}

/**
 * Creates a Whisper engine that records audio via MediaRecorder
 * and sends it to /api/transcribe for server-side transcription.
 *
 * Critical iOS constraint: getUserMedia MUST be called synchronously
 * within the user tap handler. No await before the getUserMedia call.
 * AudioContext must also be created in the same gesture context.
 */
export function createWhisperEngine(
  callbacks: SpeechEngineCallbacks,
  options: WhisperEngineOptions = {},
): SpeechEngine {
  let mediaRecorder: MediaRecorder | null = null;
  let audioStream: MediaStream | null = null;
  let audioContext: AudioContext | null = null;
  let analyserNode: AnalyserNode | null = null;
  let silenceCheckInterval: ReturnType<typeof setInterval> | null = null;
  let maxDurationTimeout: ReturnType<typeof setTimeout> | null = null;
  let chunks: Blob[] = [];
  let silenceStart: number | null = null;
  let currentLocale = 'vi';

  function cleanup() {
    if (silenceCheckInterval) {
      clearInterval(silenceCheckInterval);
      silenceCheckInterval = null;
    }
    if (maxDurationTimeout) {
      clearTimeout(maxDurationTimeout);
      maxDurationTimeout = null;
    }
    if (audioStream) {
      audioStream.getTracks().forEach(t => t.stop());
      audioStream = null;
    }
    if (audioContext) {
      audioContext.close().catch(() => {});
      audioContext = null;
    }
    analyserNode = null;
    mediaRecorder = null;
    chunks = [];
    silenceStart = null;
  }

  const getMediaFn = options.getUserMedia ?? navigator.mediaDevices?.getUserMedia?.bind(navigator.mediaDevices);
  const createCtx = options.createAudioContext ?? (() => new AudioContext());

  function startSilenceDetection(stream: MediaStream) {
    audioContext = createCtx();
    const source = audioContext.createMediaStreamSource(stream);
    analyserNode = audioContext.createAnalyser();
    analyserNode.fftSize = 2048;
    source.connect(analyserNode);

    const dataArray = new Float32Array(analyserNode.fftSize);

    silenceCheckInterval = setInterval(() => {
      if (!analyserNode) return;
      analyserNode.getFloatTimeDomainData(dataArray);

      // Calculate RMS amplitude
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i] * dataArray[i];
      }
      const rms = Math.sqrt(sum / dataArray.length);

      if (rms < SILENCE_RMS_THRESHOLD) {
        if (silenceStart === null) {
          silenceStart = Date.now();
        } else if (Date.now() - silenceStart >= SILENCE_DURATION_MS) {
          // 2 seconds of silence — auto-stop
          mediaRecorder?.stop();
        }
      } else {
        silenceStart = null;
      }
    }, 200);
  }

  async function uploadAndTranscribe(blob: Blob, locale: string): Promise<void> {
    if (blob.size < MIN_AUDIO_BLOB_SIZE) {
      callbacks.onError('no_speech');
      return;
    }

    const formData = new FormData();
    const extension = blob.type.includes('mp4') ? 'mp4' : 'webm';
    formData.append('audio', blob, `recording.${extension}`);
    formData.append('locale', LOCALE_TO_SPEECH_LANG[locale] ?? 'vi-VN');

    try {
      const response = await fetch('/api/transcribe', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorType = (errorData as { error?: string }).error;
        if (errorType === 'transcription_failed' || errorType === 'provider_unavailable') {
          callbacks.onError('transcription_failed');
        } else {
          callbacks.onError('upload_failed');
        }
        return;
      }

      const data = await response.json() as { text: string };
      const text = data.text?.trim();

      if (!text) {
        callbacks.onError('no_speech');
        return;
      }

      callbacks.onTranscript(text, true);
    } catch {
      callbacks.onError('network');
    }
  }

  return {
    name: 'whisper',
    get isSupported() {
      return isWhisperSupported();
    },

    start(locale: string) {
      currentLocale = locale;
      chunks = [];

      if (!isWhisperSupported()) {
        callbacks.onError('browser_unsupported');
        return;
      }

      // getUserMedia MUST be called synchronously in the tap handler (iOS gesture chain).
      // Do NOT add any await before this call.
      const gum = getMediaFn;
      if (!gum) {
        callbacks.onError('browser_unsupported');
        callbacks.onEnd();
        return;
      }
      gum({ audio: true })
        .then(stream => {
          audioStream = stream;

          // Start silence detection — AudioContext created here, still in gesture context
          startSilenceDetection(stream);

          const mimeType = getRecordingMimeType();
          mediaRecorder = new MediaRecorder(stream, { mimeType });

          mediaRecorder.ondataavailable = (event: BlobEvent) => {
            if (event.data.size > 0) {
              chunks.push(event.data);
            }
          };

          mediaRecorder.onstop = () => {
            const blob = new Blob(chunks, { type: mimeType });
            // Clean up recording resources before async upload
            if (silenceCheckInterval) {
              clearInterval(silenceCheckInterval);
              silenceCheckInterval = null;
            }
            if (maxDurationTimeout) {
              clearTimeout(maxDurationTimeout);
              maxDurationTimeout = null;
            }
            if (audioStream) {
              audioStream.getTracks().forEach(t => t.stop());
              audioStream = null;
            }
            if (audioContext) {
              audioContext.close().catch(() => {});
              audioContext = null;
            }

            // Recording stopped, upload starting — UI shows transcribing indicator
            callbacks.onProcessingStart?.();
            uploadAndTranscribe(blob, currentLocale).finally(() => {
              callbacks.onEnd();
            });
          };

          mediaRecorder.onerror = () => {
            callbacks.onError('recognition_failed');
            cleanup();
            callbacks.onEnd();
          };

          mediaRecorder.start(1000); // 1s timeslice for chunk granularity

          // Max duration hard stop
          maxDurationTimeout = setTimeout(() => {
            if (mediaRecorder?.state === 'recording') {
              mediaRecorder.stop();
            }
          }, MAX_RECORDING_DURATION_MS);
        })
        .catch(() => {
          callbacks.onError('not_allowed');
          callbacks.onEnd();
        });
    },

    stop() {
      if (mediaRecorder?.state === 'recording') {
        mediaRecorder.stop();
      }
    },

    destroy() {
      cleanup();
    },
  };
}
