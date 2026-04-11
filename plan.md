# RallyRiot — Sprint 1 Implementation Plan

## PROJECT NAME
RallyRiot — Volleyball Club Management System

## PRODUCT CONTEXT
RallyRiot is a volleyball-first club management platform that helps clubs run operations for:
- Members and teams
- Scheduling and calendar
- Registrations and payments
- Attendance and RSVP
- Communication and notifications

### Target Users
- Club admins/owners
- Coaches
- Players
- Parents/guardians

### Main Problem Being Solved
Many clubs currently operate using scattered tools like WhatsApp, spreadsheets, and paper forms. This creates scheduling conflicts, missed payments, unclear attendance, and communication overload. RallyRiot centralizes these processes into one platform.

---

## IMPORTANT SCOPE RULE
Implement ONLY Sprint 1.
Do NOT implement Sprint 2 items such as:
- AI chat assistant
- Community hub
- Recurring scheduling exceptions
- Discounts/installments
- Attendance summaries
- Automated reminders
- Password reset
- Deployment/CI/monitoring/optimization features beyond what is strictly needed for Sprint 1

---

## GOAL OF SPRINT 1
Build the core MVP so that:
1. Admin can create users and assign roles.
2. Admin can create teams and assign coaches.
3. Parent can be linked to child.
4. Coach can create events (practice, match, tryout).
5. System prevents overlapping bookings.
6. Players can view filtered calendar.
7. Parents can view their child's schedule.
8. Admin can create registration forms.
9. Parent can register and upload waiver.
10. System automatically generates invoice after registration.
11. Parent can view balance and due dates.
12. Player or parent can RSVP for events.
13. Coach can mark attendance.
14. Coach can post team announcements.
15. Players receive schedule change notifications.
16. Core security, validation, and testing are implemented.

---

## SPRINT 1 ISSUES TO IMPLEMENT

### Core Foundation
- SCRUM-48 Design database schema
- SCRUM-49 Implement authentication (login/logout)
- SCRUM-56 Add input validation and error handling
- SCRUM-57 Implement RBAC middleware security

### Member + Team Management
- SCRUM-13 Admin creates accounts
- SCRUM-14 Admin assigns roles (RBAC)
- SCRUM-15 Parent links account to child
- SCRUM-16 Admin creates teams and assigns coaches

### Scheduling
- SCRUM-51 Develop scheduling module APIs
- SCRUM-18 Coach creates practice sessions, matches, and tryouts
- SCRUM-20 Prevent overlapping bookings (courts/teams/coaches)
- SCRUM-21 Player filters calendar by team
- SCRUM-22 Parent views child schedule

### Registration + Payments
- SCRUM-52 Develop payments module APIs
- SCRUM-23 Admin creates registration forms
- SCRUM-24 Parent uploads waiver
- SCRUM-25 Auto-generate invoice after registration
- SCRUM-27 Parent views balance and due dates

### Notifications + Attendance
- SCRUM-53 Implement notification service (email/SMS or in-app abstraction)
- SCRUM-28 Player RSVPs to practice/match
- SCRUM-29 Parent RSVPs for child
- SCRUM-30 Coach marks attendance
- SCRUM-33 Coach posts team announcements
- SCRUM-36 Player receives schedule change notifications

### Quality
- SCRUM-60 Unit and integration testing

---

## IMPLEMENTATION ORDER

### PHASE 0 — Project Setup
1. Inspect the existing repo and preserve its structure where reasonable.
2. Create a clear modular structure for backend, models, services, routes/controllers, middleware, validation, and tests.
3. Add environment configuration and sample seed data.
4. Document how to run the project locally.

### PHASE 1 — Database and Security Foundation
1. SCRUM-48 Design database schema
2. SCRUM-49 Implement authentication
3. SCRUM-56 Add input validation and error handling
4. SCRUM-57 Implement RBAC middleware security

### PHASE 2 — User and Team Management
5. SCRUM-13 Admin creates accounts
6. SCRUM-14 Admin assigns roles
7. SCRUM-16 Admin creates teams and assigns coaches
8. SCRUM-15 Parent links account to child

### PHASE 3 — Scheduling Core
9. SCRUM-51 Develop scheduling module APIs
10. SCRUM-18 Coach creates practice sessions, matches, and tryouts
11. SCRUM-20 Prevent overlapping bookings
12. SCRUM-21 Player filters calendar by team
13. SCRUM-22 Parent views child schedule

### PHASE 4 — Registration and Payments Core
14. SCRUM-52 Develop payments module APIs
15. SCRUM-23 Admin creates registration forms
16. SCRUM-24 Parent uploads waiver
17. SCRUM-25 Auto-generate invoice after registration
18. SCRUM-27 Parent views balance and due dates

### PHASE 5 — Notification Infrastructure
19. SCRUM-53 Implement notification service

### PHASE 6 — RSVP and Attendance
20. SCRUM-28 Player RSVPs to practice/match
21. SCRUM-29 Parent RSVPs for child
22. SCRUM-30 Coach marks attendance

### PHASE 7 — Communication
23. SCRUM-33 Coach posts team announcements
24. SCRUM-36 Player receives schedule change notifications

### PHASE 8 — Testing and Finish
25. SCRUM-60 Unit and integration testing

---

## TECHNICAL EXPECTATIONS
Use the existing stack in the repo if one already exists. If parts are missing, choose a clean, production-style architecture that fits the current codebase. Favor maintainable code, clear naming, and modular design.

## GENERAL ENGINEERING REQUIREMENTS
- Clean project structure
- Reusable services
- Clear separation of concerns
- Strong validation
- RBAC enforced server-side
- Consistent API response format
- Meaningful error messages
- Safe database relations and constraints
- Seed data for testing/demo
- Tests for critical flows

---

## DATA MODEL REQUIREMENTS

### 1. User
- id, full_name, email, password_hash, role (admin, coach, player, parent), is_active, created_at, updated_at

### 2. ParentChildLink
- id, parent_user_id, child_user_id, created_at

### 3. Team
- id, name, age_group, division, created_at, updated_at

### 4. TeamCoach
- id, team_id, coach_user_id

### 5. TeamPlayer (Roster)
- id, team_id, player_user_id

### 6. Event
- id, team_id, created_by_user_id, event_type (practice, match, tryout), title, description, court_name/location, start_time, end_time, created_at, updated_at

### 7. RegistrationForm
- id, title, description, team_id, is_active, created_by_user_id, created_at

### 8. Registration
- id, registration_form_id, player_user_id, parent_user_id, submitted_at, status

### 9. WaiverFile
- id, registration_id, file_url/file_path, uploaded_at

### 10. Invoice
- id, registration_id, parent_user_id, player_user_id, amount_total, amount_due, due_date, status (unpaid, partial, paid), created_at, updated_at

### 11. RSVP
- id, event_id, player_user_id, responded_by_user_id, status (attending, not_attending, maybe), updated_at

### 12. AttendanceRecord
- id, event_id, player_user_id, marked_by_user_id, status (present, absent), recorded_at

### 13. Announcement
- id, team_id, created_by_user_id, title, body, created_at

### 14. Notification
- id, user_id, type, title, body, metadata_json, is_read, created_at

---

## AUTHENTICATION REQUIREMENTS
- Login, logout, current authenticated user endpoint
- Passwords hashed securely
- Authenticated routes protected
- User role included in auth context
- No role checks only on frontend; all role restrictions must be server-side

## RBAC REQUIREMENTS
- Admin: create users, assign roles, create teams, assign coaches, create registration forms
- Coach: create/manage events for assigned teams, mark attendance, post announcements
- Parent: view and act for linked child only
- Player: view and act on own team/events only
- Unauthorized access returns proper 403 responses

## VALIDATION AND ERROR HANDLING
- Request validation for all endpoints
- Consistent error responses: invalid input, unauthorized, forbidden, not found, conflict/overlap, file upload errors, server errors

---

## REQUIRED API/FEATURE BEHAVIOR (Demo Flow)
1. Admin logs in.
2. Admin creates coach, parent, and player accounts.
3. Admin assigns roles.
4. Admin creates a team and assigns a coach.
5. Parent is linked to child.
6. Coach creates a practice event.
7. If a conflicting event is attempted, system rejects it.
8. Player sees filtered calendar for their team.
9. Parent sees the linked child schedule.
10. Admin creates a registration form.
11. Parent registers child and uploads waiver.
12. System auto-generates invoice.
13. Parent views balance and due date.
14. Player or parent submits RSVP.
15. Coach marks attendance.
16. Coach posts announcement to team.
17. If event time/location changes, affected members receive notifications.

---

## DELIVERABLES
1. Code changes across backend
2. Migrations/schema updates
3. Seed data
4. Validation and middleware
5. Tests
6. Updated README

---

## WORK STYLE REQUIREMENTS
- Work phase by phase
- Keep commits/changes logically grouped
- Do not skip foundational phases
- Do not overbuild Sprint 2 features
- Prefer simple, clean, working implementations over unnecessary complexity
- Leave extension points where helpful, but finish Sprint 1 first
