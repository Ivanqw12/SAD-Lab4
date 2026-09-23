# SAD Lab 4 Section B — Facility Reservation & Approval System
## Required Submission Report (Items 22–32)

**Course:** SAD Lab 4
**Project:** Role-Based Campus Facility Reservation and Approval System
**Roles:** Administrator, Facility Staff, Requester (Student/Faculty/Student Org), Security, Management

---

## 22. Stakeholder Statement Analysis

Each stakeholder's concern is translated into an implied requirement that the system must satisfy.

| # | Stakeholder | Statement / Concern | Implied Requirement |
|---|---|---|---|
| S1 | Student / Faculty / Student Org (Requester) | "I want to check facility availability first, then book it for my activity and know the outcome of my request." | Search availability (FR-01); submit reservation (FR-02); be notified of outcome (FR-09). |
| S2 | Facility Administration | "I need to review every request, approve or reject it, and keep facility information accurate." | Approval workflow (FR-05); per-facility approval policy (FR-04); facility management (FR-10). |
| S3 | Facility Staff | "I need to confirm when a facility is actually used, record completion, and file maintenance concerns." | Usage confirmation / no-show / completion (FR-06); service requests. |
| S4 | Campus Security | "I must know what is authorized after hours and approve large events for safety." | After-hours authorization list (FR-07); dual approval for large events (CR-01). |
| S5 | Management | "I need utilization data to plan capacity and operations." | Utilization reports with CSV export (FR-08); audit log visibility. |
| S6 | IT / Auditor | "Every decision and data change must be traceable." | Full audit trail (BR-B4-10); read audit logs. |

---

## 23. Requirements Problems and Clarification Questions

Unresolved ambiguities and the questions needed to resolve them.

| # | Problem / Ambiguity | Clarification Question |
|---|---|---|
| P1 | "After-hours" is configurable but not confirmed. | Is after-hours = weekends + 18:00–07:00, or only nights/holidays? Who authorizes exceptions? |
| P2 | No maximum booking duration or advance lead-time exists. | What is the max hours per booking and how far in advance can a reservation be made? |
| P3 | Notifications are in-app only. | Is an email/SMS gateway required, or is in-app sufficient for the lab? |
| P4 | No-show handling is defined but has no penalty. | Should repeated no-shows restrict a requester's future bookings? |
| P5 | Auto-confirm facilities skip admin review. | Should auto-confirmed requests still appear in an audit log and be cancelable by admin? |
| P6 | Large-event threshold is set at 100 pax. | Is 100 the agreed threshold, or should it be per-facility? |
| P7 | Recurring events unsupported. | Do requesters need recurring/series bookings in this release? |

---

## 24. Stakeholder/Actor Analysis

| Actor | Type | Description | Goals | Key System Interactions |
|---|---|---|---|---|
| Requester | Primary | Student, faculty member, or student organization representative | Search availability, submit requests, track/cancel own bookings | UC-01, UC-02, UC-04, UC-09 |
| Administrator | Primary | Facility Administration / IT Personnel | Manage facilities & users, approve/reject, run reports, audit | UC-03, UC-04, UC-05, UC-07, UC-08, UC-10 |
| Facility Staff | Supporting | Operations staff | Confirm usage, record completion/no-show, service requests | UC-04, UC-06 |
| Security | Supporting | Campus security officer | Approve large events, view after-hours authorization | UC-06, UC-10 |
| Management | Secondary | Facilities Manager | View utilization reports and audit logs | UC-05 |

---

## 25. Ten Functional Requirements (FR)

| ID | Requirement |
|---|---|
| FR-01 | The system shall allow any logged-in user to search facility availability by date/time, minimum capacity, and facility type, returning only Active facilities (BR-B4-01). |
| FR-02 | The system shall let a Requester submit a reservation request with facility, purpose, participant count, start, and end; it must reject invalid time ranges (BR-B4-02), capacity overflow, and overlapping schedules (BR-B4-03). |
| FR-03 | The system shall enforce the reservation status workflow: Submitted → Pending → Approved/Rejected, then Scheduled → In Use → Completed, plus Cancelled and No-show (BR-B4-05..07). |
| FR-04 | The system shall apply a per-facility approval policy: `Requires approval` or `Auto-confirm` (auto-confirm sets status directly to Approved) (FR-04). |
| FR-05 | The system shall allow only the Administrator to approve or reject non-large requests and shall record the decision (BR-B4-04, BR-B4-10). |
| FR-06 | The system shall allow Facility Staff/Admin to mark an approved booking In Use, record Completion or No-show, and let Requesters cancel eligible own requests (BR-B4-09). |
| FR-07 | The system shall produce an after-hours authorization list (approved bookings in after-hours windows or large events) visible to Security/Admin/Staff/Management. |
| FR-08 | The system shall generate per-facility utilization reports (totals, approved hours, cancelled, no-shows, rejected) and export CSV. |
| FR-09 | The system shall create in-app notifications on submit, approval, rejection, and status changes, with read/unread tracking. |
| FR-10 | The system shall let the Administrator manage facilities (create/update/delete) and users (roles, active status) with role-based access. |

## 26. Five Non-Functional Requirements (NFR)

| ID | Category | Requirement |
|---|---|---|
| NFR-01 | Usability | The system shall present a role-based dashboard/navigation so each role only sees permitted functions; blocked actions show a clear reason. |
| NFR-02 | Availability | The system shall run fully in Demo Mode (localStorage) with zero setup and gracefully fall back to offline if the cloud backend is unavailable. |
| NFR-03 | Performance | Availability search, submission, and status updates shall complete synchronously on local data without user-visible delay. |
| NFR-04 | Security | Access control shall be enforced both in the UI and in the logic layer, and duplicate protection/RLS shall guard the cloud database. |
| NFR-05 | Auditability | Every critical action (login, submit, approval, rejection, cancellation, status change, facility/user changes) shall be logged with actor, role, and timestamp. |

---

## 27. MoSCoW Prioritization

| Priority | Requirement |
|---|---|
| **Must** | FR-01 availability search, FR-02 submit, FR-03 workflow, FR-04 approval policy, FR-05 approve/reject, FR-06 cancel/no-show/completion, FR-10 manage facilities & users, RBAC, audit trail (BR-B4-10) |
| **Should** | FR-07 after-hours authorization list, FR-08 utilization reports, FR-09 notifications, per-facility condition notes |
| **Could** | CSV exports for reports and audit logs, dual-approval for large events (CR-01), registration for new requesters |
| **Won't (this release)** | Email/SMS gateway, recurring reservations, online payment, multi-campus support |

---

## 28. Candidate Use Case Table

| ID | Use Case | Primary Actor | Goal / Description | Derived From |
|---|---|---|---|---|
| UC-01 | View Availability | Requester | Search active facilities by time, type, and capacity; see conflicts | FR-01 |
| UC-02 | Submit Reservation Request | Requester | Create a reservation with validation and store as Pending/Auto-confirmed | FR-02, FR-04 |
| UC-03 | Review Request | Administrator | Approve or reject a pending request; reassigns workflow status | FR-05 |
| UC-04 | Cancel / No-show / Complete | Requester, Staff, Admin | Cancel own requests; confirm usage; record no-show/completion | FR-03, FR-06 |
| UC-05 | Generate Utilization Report | Admin, Management | View per-facility utilization stats and export CSV | FR-08 |
| UC-06 | View After-Hours Auth List | Security, Staff, Admin, Management | List authorized after-hours or large-event bookings | FR-07 |
| UC-07 | Manage Facilities | Administrator | Create/update/delete facilities and approval policies | FR-10/FR-04 |
| UC-08 | Manage Users | Administrator | Add users, assign roles, activate/deactivate | FR-10 |
| UC-09 | Send Notification | System | Notify requester and role-based approvers on events | FR-09 |
| UC-10 | Dual Approval (>100 pax) | Admin + Security | Two-step approval path for large events | CR-01 |

---

## 29. UML Use Case Diagram

Editable source files:
- `usecase-diagram.puml` (PlantUML — open in draw.io/VS Code + PlantUML extension)
- `usecase-diagram.mmd` (Mermaid — GitHub-native, renders on GitHub)

Diagram (textual form):
- **Actors:** Requester, Administrator, Facility Staff, Security, Management.
- **System:** Facility Reservation & Approval System.
- **Primary associations:** Requester → UC-01, UC-02, UC-04; Administrator → UC-03, UC-04, UC-05, UC-07, UC-08, UC-10; Facility Staff → UC-04, UC-06; Security → UC-06, UC-10; Management → UC-05.
- **Include relationships:** UC-02 » UC-01, UC-02 » UC-09, UC-03 » UC-09, UC-10 » UC-09.
- **Extend relationships:** UC-10 extends UC-03 (large events are an alternative approval path).

---

## 30. Two Detailed Use Case Specifications

### UC-02 — Submit Reservation Request

| Field | Description |
|---|---|
| ID | UC-02 |
| Actor | Requester (Student/Faculty/Student Org); Administrator may submit on behalf |
| Precondition | Requester is logged in; at least one Active facility exists |
| Trigger | Requester opens the Reservations page and enters facility, purpose, participants, start, end |
| Main flow | 1. System lists Active facilities and their capacity. 2. Actor selects facility, enters purpose, participant count, start, end. 3. System validates start < end (BR-B4-02), capacity ≥ participants, overlaps vs Approved/Scheduled/In Use (BR-B4-03), and facility Active (BR-B4-01). 4. System determines route: Auto-confirm → status Approved; Requires approval → Pending; >100 pax → dual approval (CR-01). 5. System stores the reservation, logs BR-B4-10, notifies the requester (UC-09). |
| Alternatives | 5a. Auto-confirm: immediate Approved + notification. 5b. Large event: status Pending/Partially Approved and Security/Admin notified (UC-10). |
| Exceptions | Validation failures (overlap, capacity, inactive facility, inverted time) return a specific blocked message and no record is created. |
| Postcondition | Reservation saved in the system; requester notified; audit entry written. |

### UC-03 — Review Request (Approve / Reject)

| Field | Description |
|---|---|
| ID | UC-03 |
| Actor | Administrator (Security for large-event leg) |
| Precondition | Request exists with status Pending (or Partially Approved) |
| Trigger | Administrator opens the Approval Queue |
| Main flow | 1. System lists pending requests (large events for Security). 2. Actor selects Approve or Reject. 3. System re-checks overlap for approval (BR-B4-03). 4. Non-large: status → Approved/Scheduled or Rejected; decision stored. 5. Log audit; notify requester. |
| Alternatives | 3a. Overlap → approval blocked with message. 4a. Large event (UC-10): Admin and Security each decide; both Approved → Approved; either Rejected → Rejected; mixed → Partially Approved. |
| Exceptions | Terminal reservations (Completed/Rejected/Cancelled/No-show) cannot be decided; rejected cannot go to Scheduled (BR-B4-05). |
| Postcondition | Status updated, requester notified, audit entry written. |

---

## 31. Requirements Traceability Matrix

| Requirement | Source | Use Case(s) | Business Rule | Test Case | Result |
|---|---|---|---|---|---|
| FR-01 | S1 | UC-01 | BR-B4-01 | TC-B4-08 (inactive/maintenance blocked) | Passed |
| FR-02 | S1 | UC-02 | BR-B4-02, BR-B4-03 | TC-B4-01, TC-B4-02 | Passed |
| FR-03 | S3 | UC-03, UC-04 | BR-B4-05, BR-B4-06, BR-B4-07 | TC-B4-05, TC-B4-06 | Passed |
| FR-04 | S2 | UC-02, UC-03 | FR-04 policy | TC-B4-01 (auto-confirm) | Passed |
| FR-05 | S2 | UC-03 | BR-B4-04 | TC-B4-03, TC-B4-04 | Passed |
| FR-06 | S3 | UC-04 | BR-B4-07, BR-B4-09 | TC-B4-05, TC-B4-06, TC-B4-07 | Passed |
| FR-07 | S4 | UC-06 | after-hours rule | Manual (Auth List tab) | Passed |
| FR-08 | S5 | UC-05 | — | Manual (Reports + CSV export) | Passed |
| FR-09 | S1–S4 | UC-02, UC-03, UC-09, UC-10 | BR-B4-10 | Manual (Notifications tab) | Passed |
| FR-10 | S2 | UC-07, UC-08 | RBAC matrix | TC-B4-09 (audit), RBAC checks | Passed |
| CR-01 | S4 | UC-10 | CR-01 (>100) | TC-CR-01 | Passed |
| BR-B4-10 | S6 | all | audit trail | TC-B4-09 | Passed |

---

## 32. Change-Request Impact Analysis

**CR-01 — Dual Approval for Large Events (>100 participants).**

| Aspect | Analysis |
|---|---|
| Rationale | Security raised a concern that events >100 pax need a second, security review before approval. |
| Affected requirements | FR-03 (workflow), FR-05 (approval), FR-06 (state handling); new UC-10; new status `Partially Approved`. |
| Affected components | Approval logic (`decideApproval`), transition map, approval queue UI filter for Security, reservation form (participant count gate), schema gains `admin_decision`, `security_decision`, `is_large_event`. |
| Affected business rules | Adds CR-01 alongside BR-B4-04·05; `Partially Approved` becomes a legal state. |
| Test impact | New test TC-CR-01 (150 pax → Partially Approved → Approved after both decision-makers act). |
| Risk / effort | Medium; low technical risk since it reuses existing review flow with an added second sign-off; requires Security login and queue visibility. |
| Decision | **Approved** — merged in current release; threshold configurable via `LARGE_EVENT_THRESHOLD = 100`. |