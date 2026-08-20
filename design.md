# SwarLipi Mobile Interface Design

## Product direction

SwarLipi is a private, offline-first reading space for saving words that matter. The visual language takes its cue from a calm music player rather than a conventional notes utility: dense ink-black surfaces, glowing saffron and rose gradients, generous typography, layered depth, and focused motion. The product must be exceptionally usable with one hand in a portrait 9:16 context. The immersive reading screen is a deliberate visual echo of the supplied player reference, translated into a typography-first experience.

## Screen list

| Screen | Primary content and functionality |
| --- | --- |
| Library | A header that greets the reader, a search field, language filters, a recent-item shelf, and a performant virtualized list of text cards. Each card exposes title, language, an excerpt, annotation count, and updated time. A floating add action opens the composer. |
| Composer | A distraction-free title, language selector, body editor, and save action. It supports Marathi, Hindi, English, Awadhi, Sanskrit, and a custom language label. |
| Text detail | A compact management sheet for text metadata, edit, delete, and quick annotation access. It is reached from the library card's overflow action. |
| Immersive reader | A fullscreen, richly colored reading surface with the title and language at top, readable multilingual type, an annotation affordance, and a bottom playback-inspired control cluster. The scrolling-speed control includes a horizontal slider, numeric rate, and play/pause control. |
| Annotation sheet | A bottom sheet that shows annotations for the open text and lets the reader add a concise note. Selecting an annotation returns to its saved position in the text. |
| Settings | A small, local-only preferences surface for reader size and local-data status, with clear language describing platform-supported automatic backup behavior. |

## Key user flows

| Flow | Steps |
| --- | --- |
| Save a text | Tap the floating add button → enter title and text → choose a language → tap Save → return to the library with a success haptic and the item placed at the top. |
| Read a text | Tap a library card → reader expands to fullscreen → read manually or tap play → adjust scrolling speed from the bottom control → pause or drag the progress track to move through the text. |
| Add an annotation | In the reader, tap the annotation icon → type a note in the annotation sheet → save → a subtle marker appears at the current reading position. |
| Edit or delete | Long press a library card or tap its overflow action → choose Edit or Delete → save changes or confirm deletion → update local library immediately. |
| Restore device data | The app persists its library locally after each change. On Android, the native configuration requests OS-managed automatic backup for eligible app data, allowing a compatible Android restore flow when the device has such backup available. No account or server is required. |

## Information model

| Entity | Fields |
| --- | --- |
| SavedText | `id`, `title`, `language`, `body`, `createdAt`, `updatedAt`, `lastReadOffset`, `readerTheme` |
| Annotation | `id`, `textId`, `body`, `anchorOffset`, `createdAt` |
| ReaderPreferences | `fontScale`, `scrollRate`, `keepScreenAwake`, `theme` |

## Visual system

The primary palette is **Obsidian #101014**, **Ink #1A1720**, **Saffron #FFB95D**, **Rose #E95F8B**, **Mulberry #64233A**, and **Porcelain #FFF8F2**. The library uses a dark editorial surface with warm gradient accents that identify each language. The reader uses a deep mulberry-to-black gradient inspired by the user-supplied player reference, with high-contrast porcelain typography. Cards use a 22 px radius; bottom controls use soft glass surfaces; primary touch targets are at least 44 px high.

Motion is purposeful and restrained: cards enter with a 180 ms fade-and-rise, primary taps scale to 0.97 over 90 ms, the reader opens in a 280 ms crossfade/slide, and saved-state feedback resolves in 200 ms. The scrolling loop uses native animation scheduling and only updates lightweight progress state at a controlled interval, keeping list rendering independent from reader motion.

## Persistence and backup approach

The app uses local AsyncStorage for its library, annotations, and preferences; all ordinary actions remain available without a network connection. Data persistence is immediate and intentionally avoids a server or account system. Uninstalling an application normally removes its local sandbox, so a fully offline application cannot independently promise restoration after removal. To meet the intent as far as the operating system allows, the Android configuration will opt in to the platform's automatic backup path for eligible app data. Restoration depends on the device's backup configuration, Android version, and reinstall conditions, and the Settings screen will state this clearly rather than overpromise.

## Accessibility and multilingual typography

The reader preserves text exactly as entered and uses generous line height and left alignment appropriate for Devanagari and Latin scripts. Dynamic text scaling is respected; all icon actions have labels; color is never the only indicator of meaning; and the reader's auto-scroll can be paused instantly. The visual design remains legible in low-light conditions while preserving a striking first impression.
