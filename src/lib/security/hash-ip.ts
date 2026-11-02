import { createHash, createHmac } from 'crypto';

let missingSecretWarned = false;

/**
 * Hash a client IP for storage — never store raw IPs.
 *
 * HMAC-SHA256 keyed by IP_HASH_SECRET, so the hash cannot be reversed by
 * hashing all 2^32 IPv4 addresses. Without the secret it falls back to plain
 * SHA-256 (reversible) and warns once, rather than breaking the request.
 */
export function hashIp(ip: string): string {
  const secret = process.env.IP_HASH_SECRET;
  if (secret) {
    return createHmac('sha256', secret).update(ip).digest('hex');
  }
  if (!missingSecretWarned) {
    missingSecretWarned = true;
    console.warn(
      '[SECURITY] IP_HASH_SECRET is not set; ipHash falls back to unsalted SHA-256, ' +
        'which can be reversed to the IP. Set IP_HASH_SECRET (openssl rand -hex 32).',
    );
  }
  return createHash('sha256').update(ip).digest('hex');
}
