# GitHub Relay Validation Notes

The browser cannot directly read GitHub’s authorization-token endpoints from GitHub Pages, so SwarLipi’s browser flow uses a small server-side relay. GitHub’s current documentation recommends the web application flow for browser applications and requires an exact registered callback URL. The callback implemented for SwarLipi is `https://swarlipi-secure-sync.edutron78.workers.dev/auth/github/callback`.

GitHub documents that a GitHub App user access token is constrained by both the signed-in user’s access and the App’s granted permissions. The authenticated-user endpoint returns a `login` identifier when authorization succeeds; the relay now reports only the HTTP status and GitHub’s non-secret diagnostic message if that lookup fails. This does not include an access token, passphrase, or library content.

Live validation on 22 August 2026 confirmed that the published Pages control now reaches GitHub’s sign-in screen and sends the registered callback URL. The first authorization return reached the relay but did not complete the authenticated profile lookup. No library data was transmitted; the relay was redeployed with safe response-status diagnostics before the next authorization attempt.

Mobile browser validation then showed that the temporary cross-origin callback cookie was not returned consistently. The relay now uses a short-lived, HMAC-signed state parameter and its protected GitHub App client-secret exchange without relying on that cookie. The state still binds the approved return address and expires after ten minutes; the GitHub authorization code is single-use.

The callback rejection was traced to the missing callback cookie rather than a failed GitHub account selection. The cookie-free relay version was deployed successfully on 22 August 2026 and awaits the final end-to-end authorization return test.

The cookie-free callback completed GitHub approval but returned `403` during `GET /user`. GitHub documents that this response can reflect insufficient App permissions and provides the `X-Accepted-GitHub-Permissions` response header for determining the exact required permission. The relay now shows that non-secret header in its diagnostic before any permission expansion is proposed.

The final diagnosis was non-permission related: the relay did not send a `User-Agent` header to GitHub’s REST API. GitHub requires a valid `User-Agent` on every REST request and rejects missing or invalid values with `403 Forbidden`. The relay now sends the descriptive `SwarLipi-Secure-Sync` value. The GitHub App’s permissions, repository scope, and disabled webhooks remain unchanged.

After the profile lookup succeeded, the return fragment still required a client-side correction: the stay-signed-in choice is now carried inside the signed relay state and returned as its own fragment field rather than relying on a query marker that could be interpreted as part of the encrypted relay session.

## References

[1] [Generating a user access token for a GitHub App](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app)

[2] [Get the authenticated user](https://docs.github.com/en/rest/users/users#get-the-authenticated-user)
