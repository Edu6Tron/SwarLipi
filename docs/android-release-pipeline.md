# Android release pipeline

SwarLipi's Android release automation runs for every push to the `main` branch and may also be started manually from the **Android APK Release** workflow page. Each release uses the GitHub Actions run number as a monotonic build identifier, so a run numbered `42` produces the version name `1.0.42`, Android version code `42`, and GitHub release tag `v1.0.42`.

| Item | Release behaviour |
| --- | --- |
| Source validation | TypeScript validation and deterministic tests run before the APK build. |
| Signing | A persistent Android keystore is decoded from protected GitHub Actions secrets only inside the release runner. |
| APK | The workflow creates a signed `SwarLipi-1.0.<run>-release.apk` file. |
| Integrity | The GitHub Release also includes a `.sha256` checksum file. |
| Notes | Each release description records the version, Git commit, workflow run, offline-first scope, and real-device test reminder. |

The signing key must stay stable across releases. Changing it prevents Android from installing a later version over an existing copy; the old app would need to be removed first. The release workflow uses repository secrets named `SWARLIPI_ANDROID_KEYSTORE_BASE64`, `SWARLIPI_ANDROID_KEY_ALIAS`, `SWARLIPI_ANDROID_KEYSTORE_PASSWORD`, and `SWARLIPI_ANDROID_KEY_PASSWORD`. They are intentionally excluded from source control.

For a Realme Narzo 70 Turbo, download the APK from the repository's **Releases** page, permit the browser or file manager to install unknown apps when Android requests it, install the current version, and then disable that permission again. Before relying on uninstall-and-reinstall restoration, enable Android backup and test it with the same signed application package.
