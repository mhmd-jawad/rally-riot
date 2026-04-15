# RallyRiot Demo Guide

## Quick Start

### Docker

```bash
docker compose up --build
```

- Frontend: `http://localhost:8080`
- Backend health: `http://localhost:5000/api/health`

### Local Dev

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp ../.env.example .env
python app.py
```

```bash
cd frontend/rally-club-hub-main
npm install
npm run dev
```

- Frontend: `http://localhost:8080`
- Backend: `http://localhost:5000`

The backend auto-seeds the demo database on first startup when the DB is empty.

## Seeded Logins

All demo accounts use password `Password1!`.

| Role | Name | Email |
|------|------|-------|
| Admin | Admin User | `admin@rallyriot.com` |
| Coach | Coach Williams | `coach@rallyriot.com` |
| Coach | Coach Johnson | `coach2@rallyriot.com` |
| Parent | Parent Kim | `parent1@rallyriot.com` |
| Parent | Parent Sam | `parent2@rallyriot.com` |
| Player | Player Alex | `player1@rallyriot.com` |
| Player | Player Jordan | `player2@rallyriot.com` |
| Player | Player Casey | `player3@rallyriot.com` |

## 5-Minute Demo Flow

1. Log in as `admin@rallyriot.com` and show Users, Teams, Links, Registration Forms, and Finance.
2. Open Admin Registration Forms and confirm there is an active form for a team.
3. Log in as `parent1@rallyriot.com`, open Child Schedule, then register `Player Alex` for a form and upload a waiver if required.
4. Stay as the parent and open Payments to show the generated invoice and current balance.
5. Log in as `player1@rallyriot.com` and open My Schedule to view team events and RSVP.
6. Log in as `coach@rallyriot.com`, create or edit an event for Thunder U14, then show Attendance and Announcements.
7. Return to the parent or player account and open Notifications to show schedule-change and announcement alerts.

## Demo Relationships

- `parent1@rallyriot.com` is linked to `player1@rallyriot.com`
- `parent2@rallyriot.com` is linked to `player2@rallyriot.com`
- `coach@rallyriot.com` coaches `Thunder U14`
- `coach2@rallyriot.com` coaches `Lightning U16`

## Reset Demo Data

### Docker

```bash
docker compose down -v
docker compose up --build
```

### Local Dev

Delete `backend/data/rallyriot.sqlite`, then restart `python app.py`.
