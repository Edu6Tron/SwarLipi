# Activate SwarLipi GitHub Sign-In

SwarLipi’s GitHub account flow uses GitHub’s **Device Flow**. You create one GitHub App for SwarLipi, then users sign in directly through GitHub. The app receives a short-lived user token only on the signed-in device or browser. It never asks for a GitHub password and never sends readable SwarLipi text to GitHub.

## Create the GitHub App

Open [GitHub App settings](https://github.com/settings/apps/new) while signed in to the GitHub account that owns SwarLipi, then use the following values.

| Field | Value |
|---|---|
| GitHub App name | `SwarLipi Private Sync` |
| Homepage URL | `https://edu6tron.github.io/SwarLipi/` |
| Webhook | Uncheck **Active**; SwarLipi does not require a webhook. |
| Device Flow | Enable **Device Flow**. |
| Repository permission | **Contents: Read and write** only. |
| Account permissions | Leave all account permissions at **No access**. |
| Where can this GitHub App be installed? | **Only on this account** for a personal release, or **Any account** if other people will use SwarLipi. |

For the Edu6Tron release, the configured display name is **SwarLipi Secure Sync Edu6Tron** and the homepage is `https://edu6tron.github.io/SwarLipi/`.

> The live GitHub form separates **Device Flow**, webhook delivery, repository permissions, organization permissions, and account permissions. For SwarLipi, enable Device Flow, keep webhooks inactive, select only repository **Contents: Read and write**, and leave every other permission at **No access**.

The live form initially has Device Flow disabled and webhook delivery enabled. SwarLipi requires the inverse: Device Flow enabled and webhooks disabled.

The SwarLipi App form has now been configured with **Device Flow enabled** and **webhook delivery disabled**. The remaining required form setting is repository **Contents: Read and write**.

Repository **Contents** has been set to **Read and write**. No other repository, organization, account, or enterprise permission has been selected.

## Registered App

The GitHub App is registered under the slug `swarlipi-secure-sync-edu6tron`. Its public Client ID is `Iv23li7xRW1HbwedSG4u`. A Client ID is safe to publish in the Android and web builds; it is not a credential. GitHub reports that a private key is only needed when the app itself must request installation access tokens. SwarLipi’s device-login path uses the GitHub user token and does not place any private key in the client application.

The installation has been scoped to **Only select repositories**, with `Edu6Tron/SwarLipi` as the single selected repository. GitHub confirms this grants metadata read access and code/Contents read-write access only for that repository.

The app was installed successfully on August 22, 2026. No other Edu6Tron repository is included in the installation.

After creating the app, record its **Client ID** and the app’s URL slug. Do not create or share a client secret: the Device Flow used by SwarLipi does not need one.

## Activate the GitHub Pages build

In Termux, set the two public build variables for the SwarLipi repository. Replace the example values with the Client ID and slug shown in your GitHub App settings.

```sh
gh variable set SWARLIPI_GITHUB_APP_CLIENT_ID --repo Edu6Tron/SwarLipi --body 'YOUR_CLIENT_ID'
gh variable set SWARLIPI_GITHUB_APP_SLUG --repo Edu6Tron/SwarLipi --body 'swarlipi-private-sync'
```

Then run the **Pages** workflow again from the repository’s Actions page, or make the next normal SwarLipi source update. The static web build reads these public identifiers; they are not secrets.

## First user sync

1. In SwarLipi Settings, open **GitHub encrypted sync** and select **Sign in with GitHub**.
2. Open GitHub confirmation, enter the displayed device code, and approve the app.
3. On GitHub, install the app on one new private repository such as `SwarLipi-Backups`.
4. Return to SwarLipi, enter `your-handle/SwarLipi-Backups`, and select it.
5. Enter a 12-character-or-longer backup passphrase, then select **Sync encrypted library now**.
6. On another browser or Android device, sign in to the same GitHub account, choose the same repository, enter the same passphrase, then select **Prepare encrypted restore** and confirm only after reviewing the warning.

The encryption passphrase is not stored by SwarLipi or GitHub. Losing it means the encrypted copy cannot be recovered.

## References

1. [GitHub: Generating a user access token for a GitHub App](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app)
2. [GitHub: Choosing permissions for a GitHub App](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/choosing-permissions-for-a-github-app)
