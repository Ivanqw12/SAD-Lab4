# Facility Reservation & Approval System — SAD Lab 4 Section B

Role-Based Facility Reservation and Approval System built with **HTML + CSS + JS**, deployable to **GitHub Pages**, with **Supabase (PostgreSQL)** as optional cloud backend and **browser localStorage Demo Mode** as default (zero-setup, works offline).

## Demo accounts

| Username | Password | Role |
|---|---|---|
| `admin` | `admin123` | Administrator |
| `staff` | `staff123` | Facility Staff |
| `requester` | `requester123` | Requester |
| `requester2` | `requester123` | Requester (for TC-B4-07) |
| `security` | `security123` | Security (FR-07 + CR-01 dual approval) |
| `manager` | `manager123` | Management (FR-08 reports) |

New in this release: FR-01 availability search, FR-04 per-facility approval policy, participant counts + capacity check, CR-01 dual approval for &gt;100 pax (Admin + Security → Partially Approved → Approved), FR-06 No-show, FR-07 after-hours auth list, FR-08 utilization reports + CSV, FR-09 in-app notifications, expanded RBAC (Security/Management).

Open `index.html` → login → role-based navigation appears.

## Features mapped to requirements

### III. Roles
| Role | Permitted functions (enforced in UI + `changeStatus()`/`submitReservation()`) |
|---|---|
| Administrator | Manage facilities & users; approve/reject; view service, reports, audit logs |
| Facility Staff | View reservations; confirm usage (→ In Use); record completion (→ Completed); create service requests; update facility condition |
| Requester | View facilities; submit requests (→ Pending); view status/history; cancel own eligible; edit own Pending only |

### IV. Workflow
`Submitted → Pending → Administrator Review → Approved / Rejected → (if Approved) Scheduled → In Use → Completed`
Statuses implemented: `Pending, Approved, Rejected, Scheduled, In Use, Completed, Cancelled`. Terminal: Rejected/Completed/Cancelled. Transition map in `app.js` → `TRANSITIONS`.

### V. Business rules (BR-B4-01..10)
| ID | Rule | Enforcement |
|---|---|---|
| BR-B4-01 | Only active facilities may be reserved | `submitReservation()` blocks non-Active |
| BR-B4-02 | Start must precede end | `start >= end` rejected |
| BR-B4-03 | Overlapping approved schedules prohibited | `isOverlapping()` vs Approved/Scheduled/In Use |
| BR-B4-04 | Only Administrator may approve | role check in `changeStatus()` |
| BR-B4-05 | Rejected cannot become Scheduled | `TRANSITIONS.Rejected = []` + explicit block |
| BR-B4-06 | Approved reserves the time slot | Approved/Scheduled/In Use included in overlap set |
| BR-B4-07 | Completed cannot be edited | edit + status-change blocked |
| BR-B4-08 | Maintenance cannot be reserved | same gate as BR-01 with explicit message |
| BR-B4-09 | Requesters modify only own Pending | owner + Pending check |
| BR-B4-10 | Approval/status changes logged | `logAudit()` on every critical action |

### VI. Audit trail
`audit_logs` (actor, role, action, details, reservation_id, timestamp). Actions: LOGIN, RESERVATION_SUBMIT/EDIT, APPROVAL, REJECTION, CANCELLATION, STATUS_CHANGE, FACILITY_CREATE/UPDATE/DELETE, SERVICE_CREATE/UPDATE, USER_CREATE/UPDATE, TEST_RUN. View: Admin → Audit Logs → Export CSV. Screenshot this table for submission #7.

### VII. Testing (TC-B4-01..10)
In-app: **Test Checklist** tab → manual steps + PASS/FAIL selects + **Run Automated Rule Checks** + Export CSV.
| ID | Scenario | Expected | How |
|---|---|---|---|
| TC-B4-01 | Requester submits | Pending | requester → Reservations → submit |
| TC-B4-02 | Overlapping schedule | Blocked | same facility + overlapping Approved/Scheduled |
| TC-B4-03 | Admin approves | Approved/Scheduled | admin → Approve → Schedule |
| TC-B4-04 | Admin rejects | Rejected | admin → Reject |
| TC-B4-05 | Staff marks In Use | Updated | staff → Mark In Use |
| TC-B4-06 | Staff completes | Completed | staff → Complete |
| TC-B4-07 | Edit another user's request | Blocked | requester2 edits requester's Pending |
| TC-B4-08 | Reserve Maintenance facility | Blocked | pick Auditorium |
| TC-B4-09 | Audit log visible | Yes | admin → Audit Logs |
| TC-B4-10 | Protected page w/o login | Denied | logout → `#/audit` |

## Run locally
Just open `index.html` in a browser (Demo Mode, no build step).

## Supabase setup (optional, for full platform compliance)
The app now mirrors every change to Supabase and pulls back on load, so data survives across browsers.
1. Create project at supabase.com
2. SQL Editor → run `schema.sql` (creates users, facilities, reservations, service_requests, notifications, audit_logs + RLS + seed)
3. Project Settings → API → copy the **Project URL** (`https://<ref>.supabase.co`, no `/rest/v1`) and the **anon public key** into the two `★ PASTE HERE ★` lines in `config.js`
4. Reload → the login card badge shows **Supabase Mode**. To switch projects later, just change those two lines again.

## Deploy to GitHub Pages
1. `git init && git add . && git commit -m "Lab 4 Section B"` → push to GitHub repo
2. Repo Settings → Pages → Deploy from branch → `main` / root
3. Live URL: `https://<username>.github.io/<repo>/`

## Submission mapping
1. GitHub repo URL — your repo link
2. Live Pages URL — your Pages link
3. ERD + Use Case — in-app **Docs & ERD** tab (Mermaid) + `schema.sql`
4. Role-permission matrix — Dashboard + Docs tabs
5. Reservation workflow — Login card + Docs tab
6. Business rules — Docs tab + table above
7. Audit-log screenshot — Admin → Audit Logs (Export CSV)
8. Functional test results — Test Checklist tab (Export CSV)

## Files
- `index.html` — SPA (login, dashboard, facilities, reservations, service, users, audit, reports, tests, docs)
- `styles.css` — theme
- `app.js` — roles, workflow, BR-01..10, audit, tests
- `config.js` — Supabase credentials (placeholders = Demo Mode)
- `schema.sql` — Supabase DDL + seed
