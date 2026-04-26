# 🏐 RallyRiot — Volleyball Club Management System

**Sprint 1 MVP** — A full-stack platform that centralizes volleyball club operations including member/team management, scheduling, registrations, payments, attendance, RSVP, and notifications.

For a short presenter-friendly walkthrough, see [DEMO_GUIDE.md](./DEMO_GUIDE.md).

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Setup & Installation](#setup--installation)
- [Environment Variables](#environment-variables)
- [Database Seeding](#database-seeding)
- [Running the Server](#running-the-server)
- [Running Tests](#running-tests)
- [API Overview](#api-overview)
- [Demo Accounts](#demo-accounts)
- [Demo Flow](#demo-flow)
- [Compact Demo Guide](#compact-demo-guide)

---

## Features

### Sprint 1 Implemented

- ✅ **Authentication** — JWT-based login/logout with secure password hashing
- ✅ **Admin-Managed Access** — Demo accounts are created by admins; public sign-up is disabled
- ✅ **RBAC** — Server-side role-based access control (admin, coach, player, parent)
- ✅ **User Management** — Admin creates accounts and assigns roles
- ✅ **Team Management** — Admin creates teams, assigns coaches and players
- ✅ **Parent-Child Linking** — Parents link to player children
- ✅ **Scheduling** — Coaches create practice, match, and tryout events
- ✅ **Overlap Prevention** — System rejects conflicting court/team/coach bookings (409)
- ✅ **Calendar Views** — Players filter by team; parents view child's schedule
- ✅ **Registration Forms** — Admin creates/manages registration forms
- ✅ **Waiver Upload** — Parents upload PDF/image waivers
- ✅ **Auto Invoice Generation** — Invoice created automatically on registration
- ✅ **Balance & Due Dates** — Parents view outstanding balances
- ✅ **Player RSVP** — Players RSVP for events (attending/not_attending/maybe)
- ✅ **Parent RSVP** — Parents RSVP on behalf of linked child
- ✅ **Attendance Marking** — Coaches mark player attendance per event
- ✅ **Team Announcements** — Coaches post announcements to teams
- ✅ **Schedule Change Notifications** — Event updates trigger in-app notifications
- ✅ **Input Validation** — All endpoints validated server-side
- ✅ **Consistent Error Handling** — Standardized API response format
- ✅ **Comprehensive Testing** — Integration tests covering all critical flows
- ✅ **React Frontend** — Role-aware UI with dashboards for each user type
- ✅ **Docker Compose** — One-command full-stack deployment

---

## Tech Stack

### Backend
| Layer        | Technology           |
|--------------|---------------------|
| Language     | Python 3             |
| Framework    | Flask                |
| ORM          | SQLAlchemy           |
| Database     | SQLite               |
| Auth         | JWT (PyJWT) + bcrypt |
| File Upload  | Flask built-in       |
| Testing      | pytest               |

### Frontend
| Layer        | Technology           |
|--------------|---------------------|
| Framework    | React + TypeScript   |
| Build Tool   | Vite                 |
| Styling      | Tailwind CSS         |
| UI Components| shadcn/ui            |

---

## Project Structure

```
rally-riot/
├── backend/                  # Python/Flask REST API
│   ├── app.py                # Flask application factory
│   ├── models.py             # SQLAlchemy models
│   ├── auth.py               # JWT authentication helpers
│   ├── services.py           # Business logic (invoices, notifications, overlap)
│   ├── extensions.py         # Flask extensions (db, etc.)
│   ├── config.py             # Environment configuration
│   ├── seed.py               # Database seed script
│   ├── api_response.py       # Consistent response helpers
│   ├── routes/               # Blueprint route definitions
│   │   ├── auth_routes.py
│   │   ├── user_routes.py
│   │   ├── team_routes.py
│   │   ├── event_routes.py
│   │   ├── registration_routes.py
│   │   ├── invoice_routes.py
│   │   ├── rsvp_attendance_routes.py
│   │   ├── announcement_routes.py
│   │   ├── notification_routes.py
│   │   └── parent_child_routes.py
│   ├── tests/                # pytest integration tests
│   │   ├── conftest.py
│   │   └── test_api.py
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   └── rally-club-hub-main/  # React + Vite frontend
├── docker-compose.yml        # Full-stack Docker deployment
├── .env.example              # Example environment variables
├── plan.md                   # Sprint 1 implementation plan
└── README.md                 # This file
```

---

## Setup & Installation

### Option A — Docker (Recommended)

```bash
# 1. Clone the repository
git clone https://github.com/mhmd-jawad/rally-riot.git
cd rally-riot

# 2. Start everything
docker compose up --build
```

- Backend API: `http://localhost:5000`
- Frontend: `http://localhost:8080`

### Option B — Local Development

#### Backend (Python)

```bash
cd backend

# Create and activate virtual environment
python -m venv .venv
source .venv/bin/activate      # Windows: .venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Copy environment variables
cp ../.env.example .env

# Start the server (auto-seeds on first run if the DB is empty)
python app.py
```

#### Frontend (Node.js)

```bash
cd frontend/rally-club-hub-main

npm install
npm run dev
```

---

## Environment Variables

| Variable           | Default                                      | Description                  |
|--------------------|----------------------------------------------|------------------------------|
| `PORT`             | `5000`                                       | Backend server port          |
| `JWT_SECRET_KEY`   | `rallyriot-super-secret-dev-key-2025`        | JWT signing secret           |
| `DB_STORAGE`       | `./data/rallyriot.sqlite`                    | SQLite database file path    |
| `UPLOAD_DIR`       | `./uploads`                                  | Directory for file uploads   |
| `MAX_FILE_SIZE`    | `5242880`                                    | Max upload size (bytes)      |

---

## Database Seeding

```bash
cd backend
python seed.py
```

The seed script creates background club data to make the demo feel real:
- 1 admin account + 3 parent accounts (all loginable)
- 3 teams (Thunder U16, Lightning U14, Storm Beginners)
- 7 events (2 past with attendance history, 5 upcoming)
- 3 registration forms with discounts
- 4 registrations + invoices (paid, installment, pending, overdue)
- Attendance records, RSVPs, announcements, community posts

**Coaches and players are not pre-seeded as login accounts.** They are created live during the demo by the admin, which demonstrates the account creation and role assignment flow. Sample historical data (events, attendance, registrations) references internal placeholder records so the club looks active from day one.

`python app.py` also runs the seed routine automatically when the database is empty.

---

## Running the Server

```bash
# With Docker
docker compose up

# Without Docker
cd backend && python app.py
```

Backend starts at: `http://localhost:5000`

Health check: `GET http://localhost:5000/api/health`

---

## Running Tests

```bash
cd backend
pytest tests/ -v
```

```bash
cd frontend/rally-club-hub-main
npm run build
npm test
```

**Test suite covers:**
- Login success/failure and auth protection
- RBAC access rules for all roles
- Admin user creation and role assignment
- Team creation and coach/player assignment
- Parent-child linking
- Event creation (practice, match, tryout)
- Overlap prevention (court, team, coach)
- Player calendar filtering
- Parent child schedule viewing
- Registration form management
- Registration submission + auto invoice generation
- Waiver file upload
- Balance and due date retrieval
- Player RSVP
- Parent RSVP for child
- Coach attendance marking
- Coach announcements
- Schedule change notification generation
- Edge cases (404, invalid tokens, health check)

---

## API Overview

### Authentication
| Method | Endpoint            | Role  | Description             |
|--------|---------------------|-------|-------------------------|
| POST   | `/api/auth/login`   | Any   | Login (returns JWT)     |
| GET    | `/api/auth/me`      | Auth  | Get current user        |
| POST   | `/api/auth/logout`  | Auth  | Logout (client-side)    |

Public sign-up is disabled in the functional demo build. Admins create accounts through `/api/users`.

### Users (Admin Only)
| Method | Endpoint              | Description           |
|--------|-----------------------|-----------------------|
| POST   | `/api/users`          | Create user account   |
| GET    | `/api/users`          | List all users        |
| GET    | `/api/users/:id`      | Get single user       |
| PATCH  | `/api/users/:id/role` | Assign/change role    |

### Teams
| Method | Endpoint                       | Role   | Description              |
|--------|--------------------------------|--------|--------------------------|
| POST   | `/api/teams`                   | Admin  | Create team              |
| GET    | `/api/teams`                   | Auth   | List all teams           |
| GET    | `/api/teams/:id`               | Auth   | Get team with roster     |
| POST   | `/api/teams/:teamId/coaches`   | Admin  | Assign coach to team     |
| POST   | `/api/teams/:teamId/players`   | Admin  | Assign player to team    |

### Parent-Child
| Method | Endpoint             | Role          | Description           |
|--------|----------------------|---------------|-----------------------|
| POST   | `/api/parent-child`  | Parent/Admin  | Link parent to child  |
| GET    | `/api/parent-child`  | Parent/Admin  | Get linked children   |

### Events / Scheduling
| Method | Endpoint                                | Role         | Description                |
|--------|-----------------------------------------|--------------|----------------------------|
| POST   | `/api/events`                           | Coach/Admin  | Create event               |
| GET    | `/api/events`                           | Auth         | List visible events (filter `?team_id`) |
| GET    | `/api/events/:id`                       | Auth         | Get a visible event        |
| PUT    | `/api/events/:id`                       | Coach/Admin  | Update event               |
| DELETE | `/api/events/:id`                       | Coach/Admin  | Delete event               |
| GET    | `/api/events/my/calendar`               | Auth         | Scoped calendar view       |
| GET    | `/api/events/child/:childId/schedule`   | Parent/Admin | Child's schedule           |

### Registrations
| Method | Endpoint                                    | Role         | Description             |
|--------|---------------------------------------------|--------------|-------------------------|
| POST   | `/api/registrations/forms`                  | Admin        | Create registration form|
| GET    | `/api/registrations/forms`                  | Auth         | List forms              |
| GET    | `/api/registrations/forms/:id`              | Auth         | Get single form         |
| PATCH  | `/api/registrations/forms/:id`              | Admin        | Update form fields      |
| POST   | `/api/registrations`                        | Parent       | Register child          |
| GET    | `/api/registrations`                        | Parent/Admin | List registrations      |
| GET    | `/api/registrations/:id`                    | Parent/Admin | Get registration        |
| PATCH  | `/api/registrations/:id/status`             | Admin        | Approve/reject registration |
| POST   | `/api/registrations/:registrationId/waivers`| Parent/Admin | Upload waiver file      |
| GET    | `/api/registrations/:registrationId/waivers`| Parent/Admin | List waiver files       |

### Invoices / Payments
| Method | Endpoint            | Role         | Description            |
|--------|---------------------|--------------|------------------------|
| GET    | `/api/invoices`     | Parent/Admin | View invoices + balance|
| GET    | `/api/invoices/:id` | Parent/Admin | View single invoice    |
| PATCH  | `/api/invoices/:id/pay` | Parent/Admin | Mark invoice as paid |

### RSVP
| Method | Endpoint            | Role   | Description              |
|--------|---------------------|--------|--------------------------|
| POST   | `/api/rsvps`        | Player/Parent | RSVP to event     |
| GET    | `/api/rsvps/event/:id` | Coach/Admin | View event RSVPs |

### Attendance
| Method | Endpoint                    | Role        | Description           |
|--------|----------------------------|-------------|-----------------------|
| POST   | `/api/attendance`          | Coach/Admin | Mark attendance       |
| GET    | `/api/attendance/event/:eventId` | Coach/Admin | Get event attendance  |

### Announcements
| Method | Endpoint              | Role        | Description              |
|--------|-----------------------|-------------|--------------------------|
| POST   | `/api/announcements`  | Coach/Admin | Post team announcement   |
| GET    | `/api/announcements`  | Auth        | List (filter ?team_id)   |
| GET    | `/api/announcements/:id` | Auth     | Get visible announcement |

### Notifications
| Method | Endpoint                        | Role | Description             |
|--------|---------------------------------|------|-------------------------|
| GET    | `/api/notifications`            | Auth | Get my notifications    |
| PATCH  | `/api/notifications/:id/read`   | Auth | Mark as read            |
| PATCH  | `/api/notifications/read-all`   | Auth | Mark all as read        |

---

## Demo Accounts

These accounts are ready to log in immediately after seeding:

| Role   | Name              | Email                 | Password   |
|--------|-------------------|-----------------------|------------|
| Admin  | Mohammad Al-Admin | admin@rallyriot.com   | Password1! |
| Parent | Ahmad Al-Rashid   | ahmad@rallyriot.com   | Password1! |
| Parent | Fatima Khalil     | fatima@rallyriot.com  | Password1! |
| Parent | Nour Mansour      | nour@rallyriot.com    | Password1! |

**Coaches and players are created live during the demo** via Admin → Users. Suggested credentials to use during the demo:

| Role   | Suggested email          | Password   |
|--------|--------------------------|------------|
| Coach  | coach@rallyriot.com      | Password1! |
| Player | player@rallyriot.com     | Password1! |

**Pre-configured relationships:**
- Ahmad is linked to two sample players (Omar + Ziad) — paid invoice + pending invoice
- Fatima is linked to a sample player (Sara) — installment plan, 1 payment due
- Nour is linked to a sample player (Karim) — overdue invoice

---

## Demo Flow

### Step 1 — Admin sets the scene
- Log in as `admin@rallyriot.com`
- Show the dashboard: teams, upcoming events, finance summary, community posts all exist as background data

### Step 2 — Create a Coach (live)
- Admin → Users → Create account (e.g. `coach@rallyriot.com`, role: Coach)
- Admin → Teams → Assign the new coach to **Thunder U16**

### Step 3 — Log in as the new Coach
- Show My Teams → Thunder U16 roster and priority level
- Create a new practice event → demonstrate conflict detection if the court is already booked
- Post an announcement to the team

### Step 4 — Create a Player (live)
- Log back in as admin
- Admin → Users → Create account (e.g. `player@rallyriot.com`, role: Player)
- Admin → Teams → Assign the new player to **Thunder U16**

### Step 5 — Log in as the new Player
- Show My Schedule and Calendar → Thunder U16 events appear immediately
- RSVP to an upcoming practice
- Check Court Calendar → see court reservations

### Step 6 — Show Parent experience
- Log in as `ahmad@rallyriot.com`
- Show child schedules (Omar + Ziad), RSVP on behalf of child
- Show Payments → paid invoice, pending invoice, overdue invoice with installment breakdown

### Step 7 — Back to Admin
- Registrations → approve/reject pending registration
- Finance → Send Payment Reminders
- Dashboard → Send Event Reminders
- Attendance summary per player
16. **Coach posts announcement** → `POST /api/announcements`
17. **Event update triggers notifications** → `PUT /api/events/:id` → `GET /api/notifications`

---

## Compact Demo Guide

Use [DEMO_GUIDE.md](./DEMO_GUIDE.md) for a short startup + login + walkthrough script you can use in a live demo.

---

## API Response Format

All endpoints follow a consistent response format:

### Success
```json
{
  "success": true,
  "message": "Description of result",
  "data": { ... }
}
```

### Error
```json
{
  "success": false,
  "message": "Error description",
  "errors": [
    { "field": "email", "message": "Valid email is required." }
  ]
}
```

### HTTP Status Codes Used
| Code | Meaning                        |
|------|--------------------------------|
| 200  | Success                        |
| 201  | Created                        |
| 400  | Bad Request (validation error) |
| 401  | Unauthorized (not logged in)   |
| 403  | Forbidden (insufficient role)  |
| 404  | Not Found                      |
| 409  | Conflict (overlap/duplicate)   |
| 500  | Internal Server Error          |

---

## License

Apache 2.0 — see [LICENSE](LICENSE)
