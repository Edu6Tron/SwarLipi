# SwarLipi GitHub Account Sync Design

## Decision

SwarLipi will use a **GitHub App device authorization flow** for sign-in. This is appropriate for Android and browser use because the login client ID is safe to include in the app, while the user authorizes the account directly with GitHub. SwarLipi will request only **Contents: Read and write** access to a user-selected private backup repository.

The app never uploads readable text, titles, annotations, or the backup passphrase. It encrypts a complete local library on the device or browser first, then writes a single encrypted `latest.swarlipi.enc` snapshot to the selected private repository. The same GitHub account and passphrase can restore the encrypted library on another device or browser.

## Account lifecycle

| User action | SwarLipi behavior | What remains private |
|---|---|---|
| Sign in with GitHub | Shows GitHub’s device code and opens the GitHub confirmation page. | Password and GitHub login stay on GitHub. |
| Stay signed in | Keeps the user-approved GitHub token only on the current device. Android uses SecureStore; a browser uses its local profile by user choice. | The app does not place the token in the repository. |
| Choose private repository | Checks that the repository is private and accessible to the approved GitHub App. | No readable library data is checked during this step. |
| Sync encrypted copy | Encrypts local library with the passphrase, then replaces the remote encrypted snapshot. | GitHub receives ciphertext only. |
| Restore encrypted copy | Downloads ciphertext, requests the passphrase locally, and shows an explicit replace confirmation. | The passphrase is never sent to GitHub. |
| Log out | Removes the locally stored account token and account details. | The remote encrypted backup remains in the user’s private repository. |

## No-login behavior

Without a GitHub account, SwarLipi remains fully offline-first. Texts are stored on the device through the local library store immediately after an edit. Android automatic backup is enabled for eligible app data, but restoration depends on the device’s Google or ColorOS backup settings and should not be treated as cross-browser synchronization. The browser has its own local library until the user signs in and restores or synchronizes an encrypted GitHub copy.

## Required one-time owner configuration

The repository owner must create a GitHub App and enable Device Flow. It should request only **Repository contents: Read and write**, permit installation on selected repositories, and use no broad repository scope. The app’s public client ID and optional app slug will be injected into the SwarLipi build as public configuration values; no GitHub client secret is required for Device Flow.

## Safety rules

SwarLipi will never automatically overwrite a local library after sign-in. Restore is a deliberate action that asks for the encryption passphrase and explicit confirmation. A temporary local backup should be offered before replacement. If the same library changes on two devices, the user chooses whether to replace the local library with the remote snapshot or keep the local library and upload it as the new encrypted snapshot.

## References

1. [GitHub: Generating a user access token for a GitHub App](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app)
2. [GitHub: Repository contents REST API](https://docs.github.com/en/rest/repos/contents)
