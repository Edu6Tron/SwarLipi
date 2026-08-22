# SwarLipi Web Edition Design

## Design intent

The web edition should feel like a private reading studio rather than a desktop form. It keeps SwarLipi’s obsidian, saffron, and rose identity while using the wider browser canvas to make the user’s library calmer, more navigable, and visibly personal. The phone experience remains compact and one-handed; wider screens gain space, hierarchy, and useful status without becoming a dashboard full of controls.

## Responsive layout

| Viewport | Layout | Primary behavior |
|---|---|---|
| Phone, under 700 px | Existing single-column library with a floating new-text action | Fast reading and capture with touch-sized controls. |
| Tablet, 700–1099 px | Centered library column with expanded hero and larger text cards | Comfortable browsing and composing. |
| Desktop, 1100 px and above | Two-column studio: library at left; a calm private-space panel at right | The right panel presents account/backup safety, total words, and guidance without blocking reading. |

## Screen and flow

The library remains the home screen. The top header displays the SwarLipi mark, compact status such as **Saved locally**, and Settings. The hero has an editorial headline, library statistics, and a fine translucent grain effect. Search and language filters stay immediately below. The reading overlay remains immersive and full screen, but web controls become mouse-friendly while preserving the smooth drag-slider behavior already used on Android.

The Settings sheet gains a **Your library, yours to keep** section. It describes local browser saving today, GitHub backup availability, encryption status, latest backup time, and a direct manual backup action. A future sign-in is deliberately optional: SwarLipi should remain useful without any account.

## Visual language

The browser UI uses a near-black page canvas, warm border lines, large softly glowing color fields, readable serif-like rhythm through line-height, and restrained motion. Cards have clear hover elevation on web but keep the existing tap feedback on touch devices. Saffron remains reserved for decisive actions, rose identifies the reader atmosphere, and muted lavender-blue is used for sync/backup status. The layout avoids bright white panels, sharp shadows, or generic dashboard widgets.

## Accessibility and performance

Keyboard focus must be visible on web, hover must never be required to access actions, and all interactions must retain accessible labels. The large-library list remains virtualized. Backup processing never blocks typing or reader animation; encryption runs only after an explicit action or after a debounced backup interval while the page is active.
