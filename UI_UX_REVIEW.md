# UI / UX Review

Scope: Home, Menu, Favorites, Delivery, Rewards, Info and the external-browser overlay. This pass completed a modern-retro redesign while keeping the original Bismarck Big Boy identity: the existing logo and mascot, all existing Wix photography, and the signature red/cream/charcoal/yellow palette.

## Design system

- Warm cream canvas, white cards, charcoal typography, Big Boy red as the primary action color and yellow as the accent.
- Subtle 1950s checkerboard accents on the top strip, hero, delivery cards and reward hero — no generic restaurant art.
- Bebas Neue display headings paired with Inter body copy; both were already allowed by the CSP.
- 8px spacing rhythm, 16px card radii (24px for feature panels), 44px minimum touch targets, consistent shadows, borders and SVG iconography.
- Safe-area-aware six-tab bottom navigation with visible labels: Home, Menu, Favorites, Rewards, Delivery and Info.
- Smooth screen fades and micro-interactions, with a global `prefers-reduced-motion` override.

## Screen-by-screen changes

| Screen | Redesign |
|---|---|
| Home | Branded hero with the original mascot, large View Menu and Order Delivery buttons, prominent Bismarck-time status and hours summary, six useful shortcuts, redesigned specials, delivery promo, hours, awards, seating note and alerts. |
| Menu | cleaner search field, image-enhanced category chips, larger rounded food cards, clearer size pills and price chips, and a more intuitive favorite heart. All 56 items, categories, prices and photos are unchanged. |
| Favorites | Uses the same upgraded item cards and a polished illustrated empty state that links back to the menu. `localStorage` behavior is unchanged. |
| Delivery | New dedicated screen and tab with branded partner cards for Uber Eats, DoorDash and Food Dudes, explicit external-checkout messaging, a Toast pickup card and practical delivery notes. No in-app checkout was invented. |
| Rewards | Red checkerboard hero plus redesigned cards for loyalty, eGift cards, the Big Boy shop and online ordering. Every original link is preserved. |
| Info | Timeline-based local history, refined mission/vision/owner quote, improved contact rows, Facebook panel, deals list, socials and website CTA. All links and verified copy are unchanged. |
| In-app browser / handoff | Restyled bar, handoff card and buttons while keeping the existing iframe allowlist, sandbox, focus trap and return behavior. |

## Verified functional improvements retained

| Area | Before | After |
|---|---|---|
| Open/closed badge | Used the visitor's clock; could say "Closed" while the restaurant was open. Wrong "TODAY" row for travellers. | Uses Bismarck time with DST; "Opens 10:30 AM", "Closes 9:00 PM" and holiday overrides all come from one source. Live region announces changes. |
| Hours summary | Hardcoded in two places, could drift from the status logic. | Generated from the same source, with `(CT)` label; changes automatically with overrides. |
| Menu data | Inlined in the HTML; no duplicate-ID check. | Loaded from `menu.json`, validated on load; identical item IDs and prices so favorites and existing data still match. |
| Deals cards | Raw truncated scraped text with no context. | Expandable cards and original post links, plus length limits and a "Details may change — confirm on the original post" note. |
| External links | Every http(s) link opened an in-app overlay, including loyalty sign-up and checkout. | Map and Food Dudes still embed; payments, ordering, accounts and social links hand off directly to the browser/app with no opener. |
| IAB dialog | Could be opened with no focus management; keyboard focus escaped to the page behind it. | Focus moves into the dialog, is trapped while open, and returns to the triggering element on close. Escape still works. |
| Tab bar | Five icon-only tabs with no visible labels; no selected state for assistive tech. | Six labeled tabs, `aria-current="page"` follows the active tab, and safe-area padding clears the home indicator. |
| General accessibility | No explicit focus-visible styling; animations ignored reduced-motion preferences. | Clear yellow focus outline, real 0s reduced-motion overrides, visible status live region, 44px touch targets. |
| Failure states | A failed shell install was invisible; malformed deals fell back silently. | Observable `appNotice` with Retry; explicit "unavailable" copy for menu and deals failures. |
| Small screens | Header status badge overflowed the 320px viewport by a few pixels. | Small-screen media queries tighten the header, hero, cards and labels; 320px, 360px and 195px reflow now pass. |

## Brand / design notes

- No new hero art, generated imagery, gradients-heavy treatment, glassmorphism or template sections were introduced.
- Original Wix food photography, the original logo/mascot, category chips, price chips, reward cards and the sticky order bar remain in place.
- No runtime dependencies, frameworks, build step, analytics or backend were added.
- The app shell hash was regenerated from the 12 canonical inputs after the redesign.

## Limitations

- Screenshot binaries in `assets/screenshots/` were regenerated from the redesigned local build at 390×844.
- Automated checks and local screenshots were used; a rendered comparison on a real phone is still required; see `TEST_REPORT.md`.
