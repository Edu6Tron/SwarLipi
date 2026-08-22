# SwarLipi Private GitHub Backup Service

This small service is deliberately separate from the public GitHub Pages web application. Its only role is to keep the GitHub App client secret and access token out of browser-delivered JavaScript, while receiving **already encrypted** backup envelopes from SwarLipi.

## What it stores

The service stores a short-lived GitHub user access token and the selected repository name in a KV namespace. It never receives a readable SwarLipi text, title, annotation, or backup passphrase. The browser encrypts the library before it sends the backup envelope to this service.

## One-time setup

Create a GitHub App with **Contents: Read and write** repository permission only. Allow users to install it on selected repositories, configure the callback URL as `https://YOUR-WORKER.workers.dev/auth/github/callback`, and generate a client secret. Do not add the client secret to this repository.

Create a free Cloudflare Worker and KV namespace, copy the namespace ID into `wrangler.toml`, then set `ALLOWED_ORIGIN`, `GITHUB_APP_CLIENT_ID`, and `GITHUB_APP_CLIENT_SECRET` as deployment secrets or environment variables. The allowed origin for this repository’s Pages site is `https://edu6tron.github.io`.

After deployment, set `EXPO_PUBLIC_GITHUB_BACKUP_SERVICE_URL` to the Worker URL before exporting the web build. The app then shows **Connect private repository**. A user manually chooses or creates a separate private `SwarLipi-Backups` repository and installs the GitHub App only there.

## Security notes

GitHub App user tokens expire by default. This scaffold intentionally does not persist refresh tokens, so reconnecting is required after token expiry. That keeps the zero-cost first version simpler and limits long-lived authorization material. The Worker uses a secure HttpOnly session cookie; browser privacy settings can block third-party cookies on a `workers.dev` domain, so a future custom domain may improve compatibility but is not required for the local encrypted download feature.

## References

- [GitHub App web application flow](https://docs.github.com/en/apps/creating-github-apps/writing-code-for-a-github-app/building-a-login-with-github-button-with-a-github-app)
- [GitHub App user access tokens](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app)
- [GitHub App permissions](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/choosing-permissions-for-a-github-app)
