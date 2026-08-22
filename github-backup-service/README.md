# SwarLipi Secure GitHub Relay

This small Cloudflare Worker repairs the browser sign-in boundary that GitHub Pages cannot handle directly. It exchanges the GitHub App authorization code without exposing the GitHub App client secret to the public website.

## Privacy boundary

The library is encrypted in SwarLipi before it is sent to the relay. The relay never receives the backup passphrase or readable titles, annotations, or text. It stores no database records and no session namespace: the browser holds an opaque, AES-GCM-encrypted relay session which only this Worker can decrypt. The GitHub App remains restricted to repository **Contents: Read and write** and requires no webhooks.

## Deployment

Deployment runs on GitHub Actions, not on Android Termux. Add these repository secrets from the account owner’s Termux session:

| Secret | Purpose |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Cloudflare token scoped to the selected account with Workers Scripts Write. |
| `CLOUDFLARE_ACCOUNT_ID` | The non-secret Cloudflare account identifier. |
| `SWARLIPI_GITHUB_APP_CLIENT_SECRET` | The GitHub App client secret, provided to the Worker only as a protected runtime secret. |

After the workflow deploys, set the public Worker URL in the browser app’s build configuration as `EXPO_PUBLIC_GITHUB_BACKUP_SERVICE_URL`. The Worker URL is public; the protected values above are not.
