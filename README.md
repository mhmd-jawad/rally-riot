# 🏐 RallyRiot — Volleyball Club Management System

**Sprint 1 MVP** — A full-stack platform that centralizes volleyball club operations including member/team management, scheduling, registrations, payments, attendance, RSVP, and notifications.

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

---

## Features

### Sprint 1 Implemented

- ✅ **Authentication** — JWT-based login/logout with secure password hashing
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
python -m venv venv
source venv/bin/activate      # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Copy environment variables
cp ../.env.example .env

# Seed the database
python seed.py

# Start the server
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

The seed script creates:
- 5 user accounts (admin, coach, player, parent, player2)
- 1 parent-child link
- 2 teams with coach/player assignments
- 2 sample events
- 1 registration form

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
| GET    | `/api/events`                           | Auth         | List events (filter ?team_id) |
| GET    | `/api/events/:id`                       | Auth         | Get single event           |
| PUT    | `/api/events/:id`                       | Coach/Admin  | Update event               |
| DELETE | `/api/events/:id`                       | Coach/Admin  | Delete event               |
| GET    | `/api/events/my/calendar`               | Player       | Player's team calendar     |
| GET    | `/api/events/child/:childId/calendar`   | Parent       | Child's schedule           |

### Registrations
| Method | Endpoint                                    | Role         | Description             |
|--------|---------------------------------------------|--------------|-------------------------|
| POST   | `/api/registrations/forms`                  | Admin        | Create registration form|
| GET    | `/api/registrations/forms`                  | Auth         | List forms              |
| PATCH  | `/api/registrations/forms/:id`              | Admin        | Toggle form active      |
| POST   | `/api/registrations`                        | Parent       | Register child          |
| POST   | `/api/registrations/:registrationId/waiver` | Parent/Admin | Upload waiver file      |

### Invoices / Payments
| Method | Endpoint            | Role         | Description            |
|--------|---------------------|--------------|------------------------|
| GET    | `/api/invoices`     | Parent/Admin | View invoices + balance|
| GET    | `/api/invoices/:id` | Parent/Admin | View single invoice    |

### RSVP
| Method | Endpoint            | Role   | Description              |
|--------|---------------------|--------|--------------------------|
| POST   | `/api/rsvps`        | Player | Player RSVP to event     |
| POST   | `/api/rsvps/parent` | Parent | Parent RSVP for child    |

### Attendance
| Method | Endpoint                    | Role        | Description           |
|--------|----------------------------|-------------|-----------------------|
| POST   | `/api/attendance/:eventId` | Coach/Admin | Mark attendance       |
| GET    | `/api/attendance/:eventId` | Coach/Admin | Get event attendance  |

### Announcements
| Method | Endpoint              | Role        | Description              |
|--------|-----------------------|-------------|--------------------------|
| POST   | `/api/announcements`  | Coach/Admin | Post team announcement   |
| GET    | `/api/announcements`  | Auth        | List (filter ?team_id)   |

### Notifications
| Method | Endpoint                        | Role | Description             |
|--------|---------------------------------|------|-------------------------|
| GET    | `/api/notifications`            | Auth | Get my notifications    |
| PATCH  | `/api/notifications/:id/read`   | Auth | Mark as read            |
| PATCH  | `/api/notifications/read-all`   | Auth | Mark all as read        |

---

## Demo Accounts

| Role    | Email                  | Password    |
|---------|------------------------|-------------|
| Admin   | admin@rallyriot.com    | admin123    |
| Coach   | coach@rallyriot.com    | coach123    |
| Player  | player@rallyriot.com   | player123   |
| Parent  | parent@rallyriot.com   | parent123   |
| Player2 | player2@rallyriot.com  | player123   |

**Pre-configured relationships:**
- Parent (Paula) is linked to Player (Peter)
- Coach (Carlos) is assigned to Team "Thunder U16"
- Player (Peter) is on Team "Thunder U16"
- Player2 (Sara) is on Team "Lightning U18"

---

## Demo Flow

The following end-to-end flow works with the seeded data:

1. **Admin logs in** → `POST /api/auth/login`
2. **Admin creates accounts** → `POST /api/users`
3. **Admin assigns roles** → `PATCH /api/users/:id/role`
4. **Admin creates team + assigns coach** → `POST /api/teams` + `POST /api/teams/:id/coaches`
5. **Parent links to child** → `POST /api/parent-child`
6. **Coach creates practice** → `POST /api/events`
7. **Conflicting event rejected** → `POST /api/events` returns 409
8. **Player views calendar** → `GET /api/events/my/calendar`
9. **Parent views child schedule** → `GET /api/events/child/:childId/calendar`
10. **Admin creates registration form** → `POST /api/registrations/forms`
11. **Parent registers child + uploads waiver** → `POST /api/registrations` + `POST /api/registrations/:id/waiver`
12. **Invoice auto-generated** → included in registration response
13. **Parent views balance** → `GET /api/invoices`
14. **Player/Parent RSVP** → `POST /api/rsvps` or `POST /api/rsvps/parent`
15. **Coach marks attendance** → `POST /api/attendance/:eventId`
16. **Coach posts announcement** → `POST /api/announcements`
17. **Event update triggers notifications** → `PUT /api/events/:id` → `GET /api/notifications`

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
