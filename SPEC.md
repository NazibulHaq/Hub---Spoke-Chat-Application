# Technical Specification: Hub-and-Spoke Chat Application

## 1. Architecture Overview
- **Pattern:** Hub-and-Spoke (Star Topology).
- **Hub:** Admin (Role: `ADMIN`).
- **Spoke:** User (Role: `USER`).
- **Communication:** Real-time WebSockets (Socket.io) + REST API.

## 2. Data Model (Prisma)
See `SCHEMA.prisma` for exact definitions.
- **User:** `id`, `email`, `password_hash`, `role`, `createdAt`, `lastLogin`.
- **Conversation:** `id`, `userId` (The Spoke), `adminId` (The Hub - optional if any admin can reply, but strictly 1:1 mapping implies User <-> System/Admin).
    - *Refinement:* Since any Admin can reply, the Conversation is essentially "User's Support Thread". We might not need a strict `adminId` if multiple admins share the load, but the prompt implies "The Admin" (singular concept, maybe multiple accounts). We will model it as `User` has one active `Conversation`.
- **Message:** `id`, `conversationId`, `senderId`, `content`, `createdAt`, `isRead`.

## 3. API Endpoints (REST)
Base URL: `/api/v1`

### Auth
- `POST /auth/login`: Returns JWT (HttpOnly cookie).
- `POST /auth/logout`: Clears cookie.
- `GET /auth/me`: Returns current user profile.

### Users (Admin Only)
- `GET /users`: List all users. **(RBAC: ADMIN only)**
- `GET /users/:id`: Get specific user details. **(RBAC: ADMIN only)**

### Conversations
- `GET /conversations`:
    - **Admin:** Returns list of all active conversations (users with recent messages).
    - **User:** Returns *their own* conversation (create if not exists).
- `GET /conversations/:id/messages`: Get history.
    - **Admin:** Can access any.
    - **User:** Can ONLY access their own conversation ID.

## 4. WebSocket Events (Socket.io)

### Namespaces / Rooms
- **Global:** `/`
- **Rooms:**
    - `admin-room`: All online admins join this.
    - `user-{userId}`: The specific user joins this. Admins also join this to listen/talk.

### Client -> Server Events
- `join`: Auth handshake.
- `send_message`: `{ content: string }`. Server infers `senderId` from socket auth.
- `typing`: `{ isTyping: boolean }`.

### Server -> Client Events
- `message_received`: `{ id, content, senderId, timestamp }`.
- `user_status`: (Admin only) `{ userId, status: 'online' | 'offline' }`.
- `typing_status`: `{ userId, isTyping }`.

## 5. Security & RBAC
- **Middleware:** Verify JWT on every request/socket connection.
- **Role Check:**
    - `Roles.ADMIN`: Can access all data.
    - `Roles.USER`: Can access ONLY `me` and `my_conversation`.
- **Sanitization:** Strip sensitive fields (password_hash) from responses.

## 6. Frontend Requirements
- **Admin:**
    - Sidebar: "Active" (sorted by last message), "All".
    - Main: Chat window.
    - Right Panel: User Info.
- **User:**
    - Full screen chat.
    - Header: "Support".
