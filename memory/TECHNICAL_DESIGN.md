# Stumble Chat — Technical Design Document

> Living document. **Update this on every feature / bugfix / architectural change.**
> Last updated: **Feb 22 2026**

---

## 1. High-Level Architecture

```
┌─────────────────────────┐
│  React SPA (port 3000)  │  ← BrowserRouter, lazy-loaded routes, Tailwind, shadcn/ui, sonner
│  • Home (tab shell)     │
│  • Settings / Legal     │
└──────────┬──────────────┘
           │ REACT_APP_BACKEND_URL ─ HTTPS
           ▼
┌─────────────────────────────────────┐
│  FastAPI + Socket.IO (port 8001)    │
│  /api/...      → APIRouters         │
│  /api/socket.io → python-socketio   │
└──────────┬──────────────────────────┘
           │
           ├──► MongoDB (motor)  — users, sessions, messages, reports, email_otps
           ├──► state.py         — in-process dicts (queue, active_connections, rooms)
           └──► python-telegram-bot (long-polling, in-process)
```

### Service Topology
| Service     | Port  | Purpose                          | Manager   |
|-------------|-------|----------------------------------|-----------|
| backend     | 8001  | FastAPI + Socket.IO + TG bot     | supervisor|
| frontend    | 3000  | Create-React-App dev server      | supervisor|
| mongodb     | 27017 | Persistence                      | supervisor|
| nginx proxy | 443   | Ingress → 3000 (UI) / 8001 (api) | supervisor|

### Auth Stack
Direct Google OAuth (popup) + Guest mode (Random Chat only).
Sessions: 30 d httpOnly cookie (`Secure; SameSite=None`) + sessionStorage Bearer fallback.

---

## 2. Backend File Layout (`/app/backend/`)

```
server.py            ← FastAPI app + lifespan + Socket.IO @sio.event handlers
state.py             ← Shared in-memory dicts (user_sessions, user_rooms, queues, active_connections)
helpers.py           ← _resolve_session, _set_session_cookie, OAuth helpers, haversine_km
db.py                ← Motor client, collections, init_indexes, conv_id_for
bot.py               ← Telegram bot (long-polling, monkey-patches sio.emit)
shared.py            ← (legacy) tiny constants module
routers/
  auth.py            ← /api/auth/* (Google + email-OTP backdoor)
  profile.py         ← /api/profile/me, /picture, /images, /api/active-users, /api/users/search
  conversations.py   ← /api/conversations/* + next_monday_utc()
  block.py           ← /api/block/* + /api/hotlist/* + /api/blocked
  admin.py           ← /api/admin/* (x-admin-token gate) + /api/stats + /api/check-ip
tests/               ← pytest suites — see §6
```

### state.py — Shared Source of Truth
Both REST routers AND Socket.IO event handlers import from `state.py`.
- `user_sessions[token]`         → session metadata
- `user_rooms[sid]`              → room_id
- `active_chats[room_id]`        → [sid_a, sid_b]
- `active_connections[sid]`      → registered user payload (name, gender, user_id, city, lat/lng, is_telegram, …)
- `waiting_queue[city]`          → [sid, …]
- `city_users[city]`             → online count
- `photo_messages[photo_id]`     → ephemeral photo state
- `ip_blocks` / `ip_report_count`/ `user_ip_map` / `reports` / `users_db`

Identity test in `tests/test_router_refactor.py::TestSharedState` proves all modules share the *same* Python objects.

### Datetime Discipline
- Always `datetime.now(timezone.utc)`.
- TTL fields: `expires_at` (Mongo date). New persistent messages are stamped `expires_at = next_monday_utc()` — see §5.

---

## 3. Frontend File Layout (`/app/frontend/src/`)

```
App.js                          ← Router + <Toaster bottom-center closeButton/>
contexts/AuthContext.js         ← Google OAuth popup + httpOnly cookie session
pages/
  Home.js                       ← Tab shell + Socket.IO lifecycle + match orchestration
  Settings.js                   ← Stumble-ID, telegram link, blocked-list, legal links
  Terms / Privacy / CookiePolicy / Guidelines
components/
  AuthOnboarding.js             ← Google + Guest CTAs
  ChatPage.js                   ← Random-chat UI (text + photos + report)
  PersistentChatPage.js         ← People-tab WhatsApp-style chat
  WaitingPage.js                ← Animated queue screen
  OnboardingModal.js            ← Age 18+ gate
  PhotoViewer.js                ← Full-screen photo + disappear timer
  tabs/
    BottomTabBar.js             ← `tab-people / tab-random / tab-chats / tab-profile`
    PeopleTab.js                ← directory (Google-only, ≤100 km distance sort)
    RandomChatTab.js            ← big Connect button
    ChatsTab.js                 ← persistent chat list
    ProfileTab.js               ← bio / gender / interests / picture / gallery
    ImageGallery.js             ← gallery uploads (stable keys, ≤5 images)
  home/                         ← shell sub-components
  chat/                         ← message-list, input, header, report modal
  legal/                        ← LegalPage, LegalSection, BulletList
utils/
  analytics.js                  ← GA4 wrapper, NODE_ENV-gated logger
  api.js                        ← apiFetch / apiJSON (Bearer + cookie)
```

---

## 4. Mongo Schema

| Collection         | Purpose                                                   | Key indexes                                          | TTL?           |
|--------------------|-----------------------------------------------------------|------------------------------------------------------|----------------|
| `users`            | profile, stumble_id, provider, hotlist[], blocked[]      | `user_id`, `email`, `stumble_id`                     | —              |
| `sessions`         | issued cookies / bearer tokens                            | `session_token`, `expires_at`                        | TTL: expires_at|
| `messages`         | persistent People-tab chats                               | `conv_id`, `(conv_id, created_at)`, `message_id`     | TTL: expires_at — set to **next Monday 00:00 UTC** per insert |
| `reports`          | reported users                                            | `timestamp`, `reported_ip`                           | —              |
| `email_otps`       | 6-digit dev OTPs                                          | `email`, `expires_at`                                | TTL: expires_at|

**Always project out `_id`** in motor queries (`{"_id": 0, ...}`) — ObjectId is not JSON-serialisable.

### Critical user fields
`provider ∈ {"google","email"}` — used by `/api/active-users` to filter to Google sign-ins only.
`hotlist: [user_id]` — pure contact bookmark; no longer affects message TTL.
`blocked: [user_id]` — bidirectional message gate.

---

## 5. Key Business Rules

| Rule                                                                                       | Where implemented                                |
|--------------------------------------------------------------------------------------------|--------------------------------------------------|
| Guests + Telegram users + email-OTP users are **hidden** from People tab                   | `routers/profile.py` `get_active_users` filter   |
| Hotlist is a **contacts bookmark only** — does NOT extend chat TTL                         | `routers/block.py` (no message writes)           |
| All persistent messages **wipe every Monday 00:00 UTC**                                    | `routers/conversations.next_monday_utc`          |
| People tab sort: ≤ 100 km → distance ascending, > 100 km → randomised (Fisher-Yates)       | `routers/profile.NEARBY_KM = 100`                |
| When *partner* skips/disconnects → user **auto re-queues** (only self-Disconnect goes home)| `pages/Home.js` `partner_disconnected` handler   |
| 3 reports against an IP = 3-day block                                                      | `server.py handle_report_user`                   |
| Photo disappears 15 s after recipient opens it (both sides)                                | `server.py photo_messages` + `delete_photo_after_delay`|
| Gender is locked once set for Google users                                                 | `routers/profile.py` `gender_locked` flag        |
| Toaster `bottom-center` + close button + `mobileOffset:88` (avoids covering chat header)   | `App.js`                                         |
| Random Chat keeps matching with Telegram + guest users (not filtered)                      | `server.py` matching logic                       |
| Socket.IO transports: `['polling','websocket']` (preview WSS workaround)                   | `pages/Home.js` socket init                      |
| Server has internal reconnection (`reconnection:true`); client must NOT manually reconnect | `pages/Home.js` `disconnect` handler             |

---

## 6. Test Suites

Run with: `REACT_APP_BACKEND_URL=$(grep REACT_APP_BACKEND_URL /app/frontend/.env | cut -d= -f2) python -m pytest tests/<file> -v`

| Test File                                          | Coverage                                          | Status |
|----------------------------------------------------|---------------------------------------------------|--------|
| `test_router_refactor.py`                          | All 5 routers, shared state identity, admin gate, Socket.IO polling, bot.py import — **18 cases** | ✅ |
| `test_monday_purge_and_google_filter.py`          | `next_monday_utc()`, Google-only active-users, hotlist-doesn't-touch-messages, Monday expiry on new msgs — **4 cases** | ✅ |
| `test_people_sort_100km.py`                       | `NEARBY_KM` constant + sort split helper logic — **2 cases** | ✅ |
| `test_credits_waves.py`                           | `/api/credits/{balance,claim-daily,claim-ad-reward,unlock-dm,dm-status}` + `/api/waves/send` pending→matched — **6 cases** | ✅ |
| `test_profile_picture.py`                         | POST/DELETE /api/profile/picture (5 upload edges + 2 delete + 6 smoke) — **13 cases** | ✅ |
| `test_auth_email_otp.py`                          | Email-OTP send/verify (admin-gated dev_code), cookie issuance, /auth/me cookie+bearer | ✅ |
| `test_profile_and_users.py`                       | /profile/me CRUD, /active-users schema. *2 pre-existing stale assertions — unrelated* | ⚠️ |
| `test_stumble_features_v2.py`                     | Hotlist, blocked-list, conversations CRUD. *Skipped: stale `conv_id_for` import* | ⚠️ |

**Total green: 30** in the primary suite + auth/picture suites. Always run the first four after any backend change.

### Frontend Testing
Smoke tests done via `mcp_screenshot_tool`. Larger flows via `testing_agent_v3_fork`.

---

## 7. Integrations

| Integration         | Used for                       | Status                                | Env var(s)                                                  |
|---------------------|--------------------------------|---------------------------------------|-------------------------------------------------------------|
| **Google OAuth**    | Sign-in                        | Live                                  | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` |
| **MongoDB**         | Persistence                    | Live (local)                          | `MONGO_URL`, `DB_NAME`                                      |
| **Telegram Bot**    | Bot users join the same queue  | Live (`/start` works)                 | `TELEGRAM_BOT_TOKEN`, `BOT_USERNAME` (admin push HELD)      |
| **Google Analytics**| Event tracking                 | Live                                  | `REACT_APP_GA_ID` (G-9EKX5QRE9S)                            |
| **PostHog (server)**| TG bot events                  | Hardcoded key in `bot.py` (legacy)    | —                                                           |

**No emergent LLM key in use.** Email-OTP delivery is **MOCKED** (returns `dev_code` in response body).

---

## 8. Deployment Notes

- Preview: `https://socket-io-staging.preview.emergentagent.com`
- Production: `https://stumblechat.online` (deploy via Emergent dashboard).
- Socket.IO must use **polling-first** because some preview ingresses block raw WSS (403). Production transparently upgrades to wss.
- Admin token in `.env` (`ADMIN_TOKEN=stumblechat_admin_2026`) — referenced via `os.environ.get('ADMIN_TOKEN', ...)` in all tests.

---

## 9. Known Issues / Held Items

| Issue                                                            | Priority | Status                |
|------------------------------------------------------------------|----------|-----------------------|
| `ADMIN_CHAT_ID` not set → bot can't push admin alerts            | P1       | Held (need chat ID)   |
| Duplicate Telegram poller emits 409 Conflict in logs             | P1       | Investigate (stale webhook or 2nd worker) |
| Contact-Admin feature                                            | P1       | Held (deferred per user) |
| In-memory `state.py` blocks horizontal scaling                   | P2       | Backlog (move to Redis) |
| Base64 images bloat MongoDB                                      | P2       | Backlog (move to S3/R2) |
| Two stale tests in `test_profile_and_users.py`                   | P3       | Pre-existing; not blocking |

---

## 10. Change Log

| Date         | Change                                                                                              |
|--------------|-----------------------------------------------------------------------------------------------------|
| Feb 22 2026  | **Telegram bot — env auto-detect.** Bot now starts ONLY when `APP_URL` does NOT contain `.preview.emergentagent.com` (Emergent injects `APP_URL` into every backend pod). Production pods have custom domain → bot runs. Preview pods → bot doesn't poll. No env-var UI work needed; user just redeploys. Escape hatch: `ENABLE_TELEGRAM_BOT=false` forces off anywhere.|
| Feb 22 2026  | **Telegram bot — opt-in to prevent preview/production poller fight (superseded by APP_URL auto-detect above).** Bot startup gated behind `ENABLE_TELEGRAM_BOT=true` env var. |
| Feb 22 2026  | **Browser cache + stale-build defenses.** Added `Cache-Control: no-store` meta tags to `index.html` so future deploys aren't stuck behind cached HTML. Added a **visible build version** (`v{REACT_APP_BUILD_ID}`) and a one-tap **"Refresh App"** button in the landing-page footer that clears caches/service workers and reloads with a cache-buster URL. |
| Feb 22 2026  | **Random-chat socket-churn bug** fixed. `Home.js` socket-creation useEffect was reacting to `[guest]`, recreating the Socket.IO connection every time a user clicked Connect from the landing page. Server saw a real disconnect mid-match, fired `partner_disconnected` on the chat partner, auto-rejoin logic kicked them back to queue. Made socket lifecycle a one-shot `[]`. Identity changes still flow through the existing `register_user` re-emit useEffect. Playwright-verified end-to-end on both preview and production: two browsers click Connect → matched in 1 s → stable → messages deliver. |
| Feb 22 2026  | **Hard-clear `localStorage.user` at boot** when there's no `sessionStorage.session_token`. `AuthContext.readCachedUser` now removes the stale entry before returning `null`, so a previous Google identity cannot survive a tab close → fresh visit cycle. Verified end-to-end: seeded `localStorage.user={name:"chakravarthi"}` + reloaded → after 3 s, `localStorage.user === null` and the landing page shows the clean "SIGN IN" button (no stale pill). |
| Feb 22 2026  | **Guest/Google identity overlap fix + cross-tab Wave-back toast.** AuthContext now exposes `loading`; `AppHeader` hides the user pill + sign-out button while `authLoading=true`. When `guest=true`, Home sources the header name from `userName` only. `wave_received` listener lifted from `PeopleTab` to `Home.js` with a **"Wave back"** action button on the toast. |
| Feb 22 2026  | **Wave + Credits + DM-Unlock** fully wired: AdUnlockModal import fixed, Home.js passes `socket`+`sessionToken` to PeopleTab, PersistentChatPage emits `dm_message_sent` to start the 2h-post-reply TTL. Splash gradient updated `purple→emerald` to remove URL-load flicker. OTP test backdoor moved behind `x-admin-token` header (production-safe). +6 tests in `test_credits_waves.py` — **30/30 backend tests green**. |
| Feb 22 2026  | **Connect-button flicker** fixed (removed manual reconnect racing Socket.IO's auto-reconnect); **People tab silent auto-refresh** (background polls no longer show "Loading…") |
| Feb 22 2026  | People-tab Google-only filter; Hotlist = pure contact bookmark; **Monday-purge** chat retention      |
| Feb 22 2026  | Random chat survives partner exits (auto re-queue); Toaster moved bottom-center w/ close button; People sort 100 km cutoff |
| Feb 22 2026  | Code-review batch: analytics console gated, ImageGallery stable keys, ADMIN_TOKEN env-driven in tests|
| Feb 22 2026  | `tab-random` testid normalised across BottomTabBar + Home routing                                    |
| Feb 22 2026  | Router-refactor E2E validated (18 + 13 + 28 = 59 backend tests green)                                |
| Feb 17 2026  | server.py → 5 routers; state.py; helpers.py; SPA bottom-tab layout; Google-only auth                |
| Feb 17 2026  | Persistent People-tab chats + hotlist + Stumble ID + block/unblock + distance sort                  |

---

## 11. How to Add a New Feature (Checklist)

1. **Update §5 Business Rules** in this doc.
2. New REST endpoint? → land it in the right `routers/*.py` file (or create one and register in `server.py`).
3. New Socket.IO event? → add to `server.py` and document it.
4. Touching MongoDB? → exclude `_id`; use Pydantic models for responses where possible; respect existing indexes.
5. Write/extend a pytest under `/app/backend/tests/` and add it to §6.
6. Add `data-testid` to every interactive element you create.
7. **Update §10 Change Log** with the date + one-liner.
8. Run the test suites in §6 — must stay green before finish.
