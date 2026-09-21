# Website acquisition prompts

The game details page (`/g/<id>`) includes an optional “More ways to play” card. It never appears during gameplay, on `/play` routes, or when the shell is framed. The current placement is directly below the game hero and Play button, so play remains the primary action.

Frequency: once per mounted shell and at most once per 24 hours across visits. “Not now” suppresses it for seven days. Storage holds only a suppression deadline. If storage is unavailable, the in-memory session cap still works.

Links point to Backbone's download and controller pages with static campaign tags: `utm_source=akeru`, `utm_medium=web`, `utm_campaign=open_games`, and `utm_content=app|controller`. No incoming query parameters, identifiers, save data, or credentials are copied into these links. These tags alone do not prove an installation or purchase.

A trusted host can supply `acquisitionConsent` and `acquisitionSink` to `mountCatalog`. Events contain only `{type:'acquisition', action:'shown'|'click'|'dismiss', kind:'app'|'controller'|'both'}`. Consent defaults to false, and no reporting endpoint or third-party SDK is enabled. Sink failures cannot interrupt play or navigation. A consent integration must re-evaluate consent for each event, including revocation.

## Remaining acceptance evidence

- Product review of placement and frequency.
- Approved install attribution destination and reporting integration; the ordinary download page is a functional fallback, not verified deferred attribution.
- Approved analytics/consent integration for the host event sink.
- Verify campaign propagation through download/store/install and Shopify checkout/order reporting using approved test flows; do not assume UTMs survive these boundaries.
- Confirm reporting in the team's analytics destination, including consent denial/revocation.

Until those integrations and tests are complete, end-to-end install/purchase attribution is not delivered.

Discover includes permanent app/controller links in its top side card. These navigational links remain available after dismissal of the optional detail-page prompt and share its consent-gated click hook.
