// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { useState } from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import FeedbackImageUpload from './FeedbackImageUpload';

vi.mock('@/lib/locale', () => ({
  useLocale: () => ({ t: (key: string) => key }),
}));

const BLOB_URL = 'https://abc123.public.blob.vercel-storage.com/feedback/x.jpg';

function Harness({ onChange }: { readonly onChange: (url: string | null) => void }) {
  const [value, setValue] = useState<string | null>(null);
  return (
    <FeedbackImageUpload
      value={value}
      onChange={(url) => {
        onChange(url);
        setValue(url);
      }}
    />
  );
}

describe('FeedbackImageUpload preview', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  // BUG(p2-feedback-form-failures): the CSP img-src does not allow the Vercel Blob host, so the
  // preview must come from a local object URL (blob:), not from the uploaded URL.
  // See docs/bugs/2026-11-01-p2-feedback-form-failures.md
  it('previews from a local blob: object URL and still reports the uploaded URL, then revokes it on remove', async () => {
    const createObjectURL = vi.fn(() => 'blob:http://localhost/preview-1');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL, revokeObjectURL }));
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ url: BLOB_URL }),
    }) as unknown as typeof fetch;
    const onChange = vi.fn();

    const { container } = render(<Harness onChange={onChange} />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['x'], 'x.jpg', { type: 'image/jpeg' });
    fireEvent.change(input, { target: { files: [file] } });

    const img = await screen.findByAltText('feedback_upload_preview_alt');
    expect(img.getAttribute('src')).toMatch(/^blob:/);
    expect(onChange).toHaveBeenCalledWith(BLOB_URL);
    expect(createObjectURL).toHaveBeenCalledWith(file);

    fireEvent.click(screen.getByRole('button', { name: 'feedback_upload_remove' }));
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:http://localhost/preview-1');
    vi.unstubAllGlobals();
  });
});
