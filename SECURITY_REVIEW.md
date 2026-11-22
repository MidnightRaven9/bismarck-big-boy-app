# Security review

Reviewed on 2026-11-22. Scope included the PWA, data validation, navigation and external links, local storage, service worker, development dependencies, Facebook refresh script, and GitHub Actions and Android packaging source.

## Changes

| Area | Finding and correction |
| --- | --- |
| Menu and navigation | Menu indexes and category groups accepted inherited object keys. Data lookups now use dictionaries without prototypes, and only known screen identifiers can change the active view. |
| Embedded pages | The frame policy now requires HTTPS, a default port, and no URL credentials in addition to the approved map and delivery hosts. The HTML policy and iframe sandbox continue to apply. |
| Offline shell | Offline navigation now serves the hash-verified `index.html`. The root response had been cached separately and could take priority without its bytes being covered by the shell hash. Same-origin paths outside the application scope are left to the network. |
| Android packaging | Cloud response reads have size limits. Archive paths, declared expansion size, and artifact types are checked before extraction. Exactly one regular APK and one regular AAB are extracted into a private temporary directory. Reading the selected entries verifies their ZIP integrity. |

## Controls reviewed

- Dynamic menu and Facebook text is escaped at HTML insertion. Data validation constrains identifiers and image URLs, and the deals refresh validates the payload before updating the repository.
- The app has a restrictive HTML Content Security Policy and uses sandboxed frames for supported map and delivery views. External ordering, loyalty, and social links open in a separate tab with opener and referrer isolation.
- Offline code and data use a versioned cache. Failed installs leave the previous shell in place. Malformed network data can fall back to a validated cached copy.
- Favorites and alert preferences stay in local browser storage. The app has no account system or first-party analytics. Photos, fonts, maps, and other external services can still receive ordinary network request metadata.
- Workflow actions and development dependencies are pinned. The validation workflow uses read-only repository permissions. Release and deal-writing jobs are restricted to the canonical repository’s default branch.

## Remaining boundaries

- GitHub Pages enforces HTTPS, and the deployed response returned HSTS when checked. The HTML policy cannot provide HTTP-only protections such as `frame-ancestors`. Those controls require a hosting or proxy configuration that sets response headers.
- Android packaging sends the signing material to the configured CloudAPK provider and uploads release artifacts through GitHub Actions. This review exercised local ZIP fixtures and did not submit a signing job, inspect private secret values, or publish an APK.
- The scheduled release workflow uses the committed shell hash as its packaging marker. A matching shell hash committed with a web-only update can skip Android repackaging. This is existing release behavior.
- Third-party pages and a signed native wrapper are outside the source audit. The review did not include a penetration test, physical-device validation, or live checkout.
