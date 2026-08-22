# GitHub Relay Validation Notes

The browser cannot directly read GitHub’s authorization-token endpoints from GitHub Pages, so SwarLipi’s browser flow uses a small server-side relay. GitHub’s current documentation recommends the web application flow for browser applications and requires an exact registered callback URL. The callback implemented for SwarLipi is `https://swarlipi-secure-sync.edutron78.workers.dev/auth/github/callback`.

GitHub documents that a GitHub App user access token is constrained by both the signed-in user’s access and the App’s granted permissions. The authenticated-user endpoint returns a `login` identifier when authorization succeeds; the relay now reports only the HTTP status and GitHub’s non-secret diagnostic message if that lookup fails. This does not include an access token, passphrase, or library content.

## References

[1] [Generating a user access token for a GitHub App](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app)

[2] [Get the authenticated user](https://docs.github.com/en/rest/users/users#get-the-authenticated-user)
