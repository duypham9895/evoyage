import { redirect } from 'next/navigation';
import { resolveShortUrl, incrementAccessCount, type ResolveShortUrlResult } from '@/lib/short-url';

interface ShortUrlPageProps {
  readonly params: Promise<{ code: string }>;
}

export default async function ShortUrlRedirect({ params }: ShortUrlPageProps) {
  const { code } = await params;

  // Validate code format: 7 chars, base62
  if (!/^[A-Za-z0-9]{7}$/.test(code)) {
    redirect('/plan?error=link-not-found');
  }

  let result: ResolveShortUrlResult | null = null;

  try {
    result = await resolveShortUrl(code);
  } catch (err) {
    console.error(`[short-url] Resolution failed for code "${code}":`, err);
    redirect('/plan?error=link-unavailable');
  }

  if (result.status === 'expired') {
    redirect('/plan?error=link-expired');
  }

  if (result.status === 'not-found') {
    redirect('/plan?error=link-not-found');
  }

  // Fire-and-forget: increment access counter without blocking redirect
  incrementAccessCount(code);

  // 307 Temporary Redirect to the plan page with full params
  redirect(`/plan?${result.params}`);
}
