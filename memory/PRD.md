# Stumble Chat - Product Requirements Document

## Original Problem Statement
Build a full-stack anonymous stranger chat web app named "Stumble Chat" with real-time text and audio chat capabilities, photo sharing with auto-disappearing feature, and user safety features.

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
