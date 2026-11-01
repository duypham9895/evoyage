# AUTOMATION_PAT — token for the daily data-sync PRs

`crawl-stations.yml` and `crawl-energy-prices.yml` push to `automation/*` and open a PR that
auto-merges once the required **Deploy to Vercel** check passes.

They must use a personal access token, not `GITHUB_TOKEN`: GitHub runs no workflows for pushes or
PRs made with `GITHUB_TOKEN`, so the required check never appears and the PR stays `BLOCKED`
forever. That is how PR #48 sat open from 2026-06-02 to 2026-11-01. A merge made with the PAT is
an ordinary push to `main`, so it also triggers the production deploy.

## Create or rotate it

1. GitHub → Settings → Developer settings → **Fine-grained tokens** → Generate new token.
2. Name `evoyage-automation`. Expiration: up to 1 year — put the expiry date in your calendar.
3. Repository access: **Only select repositories** → `duypham9895/evoyage`.
4. Repository permissions: **Contents: Read and write**, **Pull requests: Read and write**.
   Nothing else. (No Workflows permission: the sync commits can only touch data files.)
5. Generate, then store it:

   ```bash
   gh secret set AUTOMATION_PAT --repo duypham9895/evoyage
   ```

## When it expires

Both workflows fail red at "Open … sync PR" with `AUTOMATION_PAT secret is not set` or an auth
error. Nothing goes stale silently. Rotate with the steps above.

## Guard rails

- The sync step only ever stages its data JSON and `README.md` (`git add` of those two paths).
- Checkout runs with `persist-credentials: false`; otherwise checkout v6+'s persisted
  `GITHUB_TOKEN` header wins over the PAT on push and the PR gets no CI again.
- Repo setting **Allow auto-merge** must stay on.
- `crawl-energy-prices.ts` exits non-zero when any source reused a previous value, so a broken
  source blocks the sync instead of re-stamping old prices with a new date.
