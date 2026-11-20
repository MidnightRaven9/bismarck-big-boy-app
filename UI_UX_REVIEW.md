# UI / UX Review

Scope: Home, Menu, Favorites, Rewards, Info, Delivery and the external-browser overlay. The visual identity was preserved: red/charcoal palette, vintage drive-in typography, existing photos, card shapes and tab layout were not replaced.

## Verified problems and improvements

| Area | Before | After |
|---|---|---|
| Open/closed badge | Used the visitor's clock; could say "Closed" while the restaurant was open. Wrong "TODAY" row for travellers. | Uses Bismarck time with DST; "Opens 10:30 AM", "Closes 9:00 PM" and holiday overrides all come from one source. Live region announces changes. |
| Hours summary | Hardcoded in two places, could drift from the status logic. | Generated from the same source, with `(CT)` label; changes automatically with overrides. |
| Menu data | Inlined in the HTML; no duplicate-ID check. | Loaded from `menu.json`, validated on load; identical item IDs and prices so favorites and existing screenshots still match. |
| Deals cards | Raw truncated scraped text with no context. | Same expandable cards and original post links, plus length limits and a "Details may change — confirm on the original post" note. |
| External links | Every http(s) link opened an in-app overlay, including loyalty sign-up and checkout. | Map and Food Dudes still embed; payments, ordering, accounts and social links hand off directly to the browser/app with no opener. |
| IAB dialog | Could be opened with no focus management; keyboard focus escaped to the page behind it. | Focus moves into the dialog, is trapped while open, and returns to the triggering button on close. Escape still works. |
| Tab bar | `aria-label` only; no selected state for assistive tech. Safe-area padding was cancelled by a later `padding` rule. | `aria-current="page"` follows the active tab; safe-area padding now wins, so the bar clears the home indicator on notched phones. |
| General accessibility | No explicit focus-visible styling; animations ignored reduced-motion preferences. | Clear yellow focus outline, reduced-motion media query, visible status live region. |
| Failure states | A failed shell install was invisible; malformed deals fell back silently. | Observable `appNotice` with Retry; explicit "unavailable" copy for menu and deals failures. |
| Small screens | Header status badge overflowed the 320px viewport by a few pixels. | Small-screen media query tightens header, logo and status spacing; 320px and 360px reflow now pass. |

## Brand / design notes

- No new hero art, gradients, animations, icons or template sections were introduced.
- Existing Wix food photography, category chips, price chips, reward cards and the sticky order bar are unchanged.
- The new caveat text and notice use the existing charcoal/paper colors and existing yellow accent.
- Screenshots were not overwritten; the visual diff is limited to the status copy, tab state, safe-area spacing and the new small notice/caveat text.

## Limitations

Screenshot binaries could not be visually inspected in this environment. A rendered before/after comparison on a real phone is still required; see `TEST_REPORT.md`.
