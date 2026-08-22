# GitHub Relay Validation Notes

The browser cannot directly read GitHub’s authorization-token endpoints from GitHub Pages, so SwarLipi’s browser flow uses a small server-side relay. GitHub’s current documentation recommends the web application flow for browser applications and requires an exact registered callback URL. The callback implemented for SwarLipi is `https://swarlipi-secure-sync.edutron78.workers.dev/auth/github/callback`.

GitHub documents that a GitHub App user access token is constrained by both the signed-in user’s access and the App’s granted permissions. The authenticated-user endpoint returns a `login` identifier when authorization succeeds; the relay now reports only the HTTP status and GitHub’s non-secret diagnostic message if that lookup fails. This does not include an access token, passphrase, or library content.

Live validation on 22 August 2026 confirmed that the published Pages control now reaches GitHub’s sign-in screen and sends the registered callback URL. The first authorization return reached the relay but did not complete the authenticated profile lookup. No library data was transmitted; the relay was redeployed with safe response-status diagnostics before the next authorization attempt.

Mobile browser validation then showed that the temporary cross-origin callback cookie was not returned consistently. The relay now uses a short-lived, HMAC-signed state parameter and its protected GitHub App client-secret exchange without relying on that cookie. The state still binds the approved return address and expires after ten minutes; the GitHub authorization code is single-use.

## References

[1] [Generating a user access token for a GitHub App](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app)

[2] [Get the authenticated user](https://docs.github.com/en/rest/users/users#get-the-authenticated-user)
