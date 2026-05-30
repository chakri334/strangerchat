# Stumble Chat - Product Requirements Document

## Original Problem Statement
Build a full-stack anonymous stranger chat web app named "Stumble Chat" with real-time text chat (audio CANCELLED), disappearing-photo sharing, Google OAuth + email OTP sign-in, user reporting with IP banning, Telegram admin bot, GA4 analytics, and persistent user/report storage in MongoDB.

## Recent Changes (Feb 2026)
- **4-Tab SPA redesign (Feb 17 2026 — based on user-uploaded `stumbleChat002-main` mockup):**
  - New layout: AppHeader (sticky top, brand pill + live badge + settings/logout) + main content + BottomTabBar (fixed bottom).
  - 4 tabs: **People** (live directory of online users with interest chips + direct-connect), **Random Chat** (existing connect→queue→match flow), **Chats** (empty-state for now), **Profile** (editable bio/gender/interested-in/interests).
  - Visual refresh: slate-950 base + emerald-400 accents, kept purple #7c5cfc as secondary brand accent.
  - Restyled AuthOnboarding to match mockup (Radio icon with sparkle, Privacy First panel, slate/emerald palette).
  - Brand name unchanged: **Stumble Chat**.
- **Backend additions (additive — random chat flow untouched):**
  - `GET /api/profile/me` and `PUT /api/profile/me` — full profile CRUD (bio, gender, interested_in, interests, images, name, picture).
  - `GET /api/active-users?interests=tag1,tag2` — filters online users by interest tags.
  - Socket.IO `register_user` now accepts and stores `interests[]`, `interested_in`, `bio` on `active_connections`.
  - `_resolve_session()` helper unifies cookie + Bearer token auth across endpoints.
  - Interest tags lowercased + deduplicated server-side; capped at 10. Bio capped at 280 chars. Images capped at 5.
  - Added data-testids to OnboardingModal (`age-agree-checkbox`, `age-confirm-btn`) for testability.
- **Comprehensive code-quality pass (Feb 17 2026):**
  - Backend: refactored `google_auth_callback` and `email_verify_otp` into small helpers (`_resolve_trusted_origin`, `_oauth_popup_success/_error`, `_exchange_code_for_profile`, `_upsert_user_from_google`, `_issue_session`, `_set_session_cookie`, `_validate_otp`, `_upsert_email_user`).
  - Backend: switched non-deterministic security choices to `secrets.choice` (emoji + random topic) in server.py and bot.py.
  - Backend: `_set_session_cookie` sets `HttpOnly; Secure; SameSite=None` cookie on Google OAuth + email OTP success. `/api/auth/me` accepts cookie or Bearer.
  - Backend: removed dead `audio_signal` Socket.IO handler (audio feature cancelled).
  - Frontend: deleted dead `ChatModal.js` and all SimplePeer/audio references.
  - Frontend: split `ChatPage.js` (642 → ~210 lines) into `chat/ChatHeader`, `chat/MessageList`, `chat/ChatInput`, `chat/ReportModal`, `chat/DisconnectedFooter`.
  - Frontend: split `Home.js` (594 → ~270 lines) into `home/HomeHeader`, `home/BlockedScreen`, `home/NearbyUsersPanel`, `home/ConnectHero`, `home/StatsBar`.
  - Frontend: fixed React hook deps using `useCallback` across `AuthContext`, `Home`, `ChatPage`; replaced stale `userCity` closure with `userCityRef`.
  - Frontend: migrated `session_token` from `localStorage` to `sessionStorage` (auth token never touches persistent storage; httpOnly cookie is primary).
  - Frontend: removed array-index keys in `Privacy.js`, `CookiePolicy.js`.
  - Frontend: replaced nested ternary in Connect button label with `buttonLabel()` helper.
- **MongoDB persistence (Feb 17 2026):** users, sessions, reports, email OTPs collections with proper indexes + TTL.
- **Email OTP backend endpoints:** `POST /api/auth/email/send-otp`, `POST /api/auth/email/verify-otp`. ⚠️ Email delivery still MOCKED (returns `dev_code`).
- **Admin endpoints:** `GET /api/admin/users`, `GET /api/admin/reports` protected by `x-admin-token`.

## Product Overview
Stumble Chat is an anonymous, real-time chat application that connects random users for conversation. The app prioritizes user privacy and safety while providing an engaging chat experience.

## Core Requirements

### Design
- Mobile-first, responsive dark theme
- Primary colors: Purple (#7c5cfc) and Pink (#fc5c7d)
- Fonts: Syne (headings), DM Sans (body)

### User Flow
1. **Home Page**: Minimal page with "Connect" button and stats
2. **Waiting Page**: Animated display while finding a match
3. **Chat Page**: Full-screen chat interface when matched
4. Return to Home after disconnect

### Features

#### Real-time Messaging
- Socket.IO with polling transport
- Auto-reconnection (10 attempts)
- Heartbeat (25s ping interval)

#### Photo Sharing
- Photos sent as clickable thumbnails
- Photo stays in chat until opened by recipient
- 15-second timer starts when photo is opened
- Photo disappears for BOTH users after timer
- Shows "Photo deleted" placeholder

#### Matchmaking
- Location-based matching (backend only, hidden from UI)
- 5-second city-based search, then global matching
- Self-matching prevention

#### User Safety
- Report button with optional comments
- Full chat history saved for review on report
- IP tracking and auto-blocking
- 3 reports = 3-day IP block

#### Audio Chat (WebRTC)
- Peer-to-peer audio via SimplePeer
- Toggle button for audio control

## Technical Stack
- **Frontend**: React, Socket.IO Client, TailwindCSS
- **Backend**: Python, FastAPI, python-socketio
- **Architecture**: Stateless, in-memory (no database)

## API Endpoints
- `GET /health` - Health check
- `GET /api/` - Server status
- `GET /api/stats` - Online users, chats, cities
- `GET /api/check-ip` - IP block status

## Socket.IO Events
### Client Emits
- `register_user` - Register with name, age, gender, city
- `join_queue` - Join matchmaking queue
- `send_message` - Send text message
- `send_photo` - Send photo
- `photo_opened` - Notify photo was viewed (starts timer)
- `skip_chat` - Skip current partner
- `disconnect_chat` - End current chat
- `report_user` - Report with comments and chat history
- `get_random_topic` - Get conversation starter

### Server Emits
- `registered` - Registration confirmed
- `match_found` - Match found with partner info
- `new_message` - Incoming message
- `new_photo` - Incoming photo
- `photo_sent` - Confirmation photo was sent
- `photo_timer_started` - Timer started (15s)
- `photo_deleted` - Photo expired for both users
- `partner_disconnected` - Partner left
- `chat_ended` - Chat session ended
- `blocked` - User IP blocked
- `report_submitted` - Report confirmation

## What's Been Implemented

### December 2025 (Latest)
- **Connection Stability**: Added reconnection logic (10 attempts), heartbeat (25s ping interval)
- **Connection Status Indicator**: Green dot shows connected state, yellow shows connecting
- **Photo sharing with 15-second disappearing logic** (stays until opened, then timer, disappears for both)
- **Report system** with chat history saving and optional comments
- **IP blocking** after 3 reports (3-day block)
- **Waiting page** with animated male/female illustration

### Testing Results (Verified)
- **5-User Test**: 5/5 connections, 5/5 registrations, 2 pairs matched, messages delivered 100%
- **100-Message Test**: 50 messages each direction - 100% delivery rate
- **Photo Test**: 5 photos each direction - 100% delivery rate
- **Connection Stability**: All users remained connected throughout testing

### Stability Fixes Applied (December 2025)
- Increased Socket.IO ping_timeout to 120s (from 60s)
- Increased max_http_buffer_size to 10MB (from 5MB)
- Added async_handlers and always_connect options
- Frontend: Reduced reconnection attempts, increased delays
- Added better error handling and logging for photos/messages
- Report button now visible after partner disconnects
- New animated waiting page with walking male/female silhouettes
- **Google Analytics 4 Integration** (G-9EKX5QRE9S) tracking:
  - User connections/disconnections
  - Queue joins and matches
  - Messages sent/received
  - Photos sent/received/viewed
  - Skip, disconnect, and report actions

## File Structure
```
/app/
├── backend/
│   ├── server.py         # FastAPI + Socket.IO server
│   ├── requirements.txt
│   └── tests/
│       ├── test_stumble_chat_api.py
│       └── test_socketio_realtime.py
├── frontend/
│   └── src/
│       ├── pages/
│       │   ├── Home.js         # Main page with Connect
│       │   └── Settings.js     # User settings
│       └── components/
│           ├── ChatPage.js     # Chat interface
│           ├── WaitingPage.js  # Waiting animation
│           ├── PhotoViewer.js  # Full-screen photo view
│           └── ui/             # Shadcn components
└── test_reports/
    └── iteration_2.json
```

## Backlog

### P1 (High Priority)
- None currently - core features complete

### P2 (Medium Priority)
- Consider Redis for persistence
- Refactor ChatPage.js into smaller components

### P3 (Low Priority)
- Admin dashboard for viewing reports
- Analytics dashboard
