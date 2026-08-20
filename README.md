# SwarLipi

**SwarLipi** is an offline-first mobile library for saving and revisiting texts in Marathi, Hindi, English, Awadhi, Sanskrit, and other languages. It is built as a native React Native application in **TypeScript** with Expo, not as a WebView wrapper. The project centres on a focused, immersive reading experience with a playback-inspired auto-scroll control.

## What it includes

| Area | Included capability |
| --- | --- |
| Local library | Create, search, filter, edit, and delete saved texts without a network connection. |
| Reading | Open a text in a fullscreen reader, pause or resume automatic scrolling, seek through the text, and adjust scrolling speed. |
| Annotation | Save position-aware notes against the current point in a text. |
| Device continuity | Library data is written to local app storage on every change. Android automatic backup is enabled for eligible local data; whether it restores after a reinstall depends on the device's backup settings. |
| Android readiness | Portrait-only layout, adaptive icon assets, package metadata, a `versionCode`, and a 24+ Android minimum SDK inherited from the Expo project configuration. |

## Run the project locally

Install Node.js 22 and pnpm, then run the following commands from the repository root.

```bash
pnpm install --frozen-lockfile
pnpm check
pnpm test
pnpm android
```

For a physical Android device, install Expo Go, place the device and development machine on the same network, then run `pnpm qr` and scan the code. A production APK should be generated through the project’s managed **Publish** workflow, which applies the configured Android package, icons, and build settings.

## Realme Narzo 70 Turbo testing

The app is designed for current Android phones, including the Realme Narzo 70 Turbo. Test the real device flow by saving a text, closing and reopening the app, entering the fullscreen reader, starting auto-scroll, changing its speed, adding an annotation, and editing the text. To check operating-system backup behaviour, ensure Android backup is enabled on the phone before uninstalling and reinstalling the same signed application; restore is controlled by Android and is not guaranteed by local storage alone.

## Project structure

| Location | Purpose |
| --- | --- |
| `app/(tabs)/index.tsx` | Main animated library, text composer, management sheet, fullscreen reader, and annotations. |
| `lib/swarlipi-store.tsx` | Offline local state provider and immediate AsyncStorage persistence. |
| `lib/swarlipi-storage.ts` | Stable local data model, sample library, and safe decoding helpers. |
| `assets/images/` | Native launcher, splash, adaptive foreground, and web icon assets. |
| `tests/swarlipi-storage.test.ts` | Deterministic tests for storage serialization and reader-control bounds. |

## Validation

The repository includes a GitHub Actions workflow that runs TypeScript validation and the deterministic test suite for every push and pull request. Before publishing a mobile build, test the primary reading and restore paths on an actual Android device.

## Automatic Android releases

Every push to `main` triggers the Android release workflow after source validation. The workflow derives a unique semantic version from the GitHub Actions run number, builds a signed release APK, produces a SHA-256 checksum, and creates a GitHub Release containing a concise build description and both artifacts. The release signing material remains in GitHub Actions secrets and is never committed to the repository. See [`docs/android-release-pipeline.md`](docs/android-release-pipeline.md) for the release convention and device-installation notes.

## Privacy and backup note

SwarLipi has no account, cloud sync, or network-required reading flow. Its text library lives in the app’s local storage. Android automatic backup may include eligible app data when the device and user backup configuration permit it; see Android’s official Auto Backup guidance for the operating-system rules.[1]

## License

This project is available under the MIT License. See [LICENSE](LICENSE).

## References

[1] [Android Auto Backup documentation](https://developer.android.com/identity/data/autobackup)
