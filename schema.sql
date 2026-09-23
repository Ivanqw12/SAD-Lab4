-- ============================================================
-- LAB 4 SECTION B: Role-Based Facility Reservation & Approval
-- Supabase schema (PostgreSQL). Run in SQL Editor.
-- Tables: users, facilities, reservations, service_requests, audit_logs
-- ============================================================

-- ---------- USERS ----------
create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  username text unique not null,
  full_name text not null,
  role text not null check (role in ('Administrator','Facility Staff','Requester','Security','Management')),
  password_hash text not null, -- demo only; use Supabase Auth in production
  is_active boolean not null default true,
  created_at timestamptz default now()
);

-- ---------- FACILITIES ----------
create table if not exists public.facilities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null default 'General',
  capacity int not null default 0,
  location text default '',
  status text not null default 'Active'
    check (status in ('Active','Maintenance','Inactive')),
  approval_type text not null default 'Requires approval'
    check (approval_type in ('Auto-confirm','Requires approval')),
  condition_notes text default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ---------- RESERVATIONS ----------
create table if not exists public.reservations (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.facilities(id) on delete cascade,
  requester_id uuid references public.users(id) on delete set null,
  requester_name text not null,
  purpose text not null,
  participant_count int not null default 1 check (participant_count >= 1),
  is_large_event boolean not null default false, -- true when participant_count > 100 (CR-01 dual-approval)
  admin_decision text not null default 'Pending' check (admin_decision in ('Pending','Approved','Rejected')),
  security_decision text not null default 'Pending' check (security_decision in ('Pending','Approved','Rejected','Not required')),
  start_time timestamptz not null,
  end_time timestamptz not null,
  status text not null default 'Pending'
    check (status in ('Pending','Partially Approved','Approved','Rejected','Scheduled','In Use','Completed','Cancelled','No-show')),
  remarks text default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  check (start_time < end_time)
);

create index if not exists idx_res_facility_time
  on public.reservations (facility_id, start_time, end_time);
create index if not exists idx_res_status
  on public.reservations (status);

-- ---------- SERVICE REQUESTS ----------
create table if not exists public.service_requests (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid references public.facilities(id) on delete set null,
  reported_by text not null,
  concern text not null,
  status text not null default 'Open'
    check (status in ('Open','In Progress','Resolved')),
  created_at timestamptz default now()
);

-- ---------- NOTIFICATIONS (FR-09) ----------
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  username text not null,
  message text not null,
  reservation_id uuid references public.reservations(id) on delete set null,
  is_read boolean not null default false,
  created_at timestamptz default now()
);
create index if not exists idx_notif_user on public.notifications (username, is_read);

-- ---------- AUDIT LOGS ----------
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  actor text not null,
  role text not null default '',
  action text not null,
  details text default '',
  reservation_id uuid references public.reservations(id) on delete set null
);

create index if not exists idx_audit_time
  on public.audit_logs (created_at desc);

-- ---------- RLS (simple class-lab policies) ----------
alter table public.users enable row level security;
alter table public.facilities enable row level security;
alter table public.reservations enable row level security;
alter table public.service_requests enable row level security;
alter table public.audit_logs enable row level security;
alter table public.notifications enable row level security;

drop policy if exists "allow all" on public.users;
drop policy if exists "allow all" on public.facilities;
drop policy if exists "allow all" on public.reservations;
drop policy if exists "allow all" on public.service_requests;
drop policy if exists "allow all" on public.audit_logs;
drop policy if exists "allow all" on public.notifications;

create policy "allow all" on public.users for all using (true) with check (true);
create policy "allow all" on public.facilities for all using (true) with check (true);
create policy "allow all" on public.reservations for all using (true) with check (true);
create policy "allow all" on public.service_requests for all using (true) with check (true);
create policy "allow all" on public.audit_logs for all using (true) with check (true);
create policy "allow all" on public.notifications for all using (true) with check (true);

-- ---------- SEED: demo users (passwords = username + '123', demo only) ----------
insert into public.users (username, full_name, role, password_hash) values
  ('admin','System Administrator','Administrator','admin123'),
  ('staff','Facility Staff Member','Facility Staff','staff123'),
  ('requester','Juan Requester','Requester','requester123'),
  ('requester2','Maria Requester','Requester','requester123'),
  ('security','Campus Security Officer','Security','security123'),
  ('manager','Facilities Manager','Management','manager123')
on conflict (username) do nothing;

-- ---------- SEED: demo facilities (FR-04 approval policy per facility) ----------
insert into public.facilities (name, type, capacity, location, status, approval_type, condition_notes) values
  ('Gymnasium','Sports',500,'Building A - Ground Floor','Active','Requires approval','Good condition'),
  ('Conference Room A','Meeting',30,'Building B - 2nd Floor','Active','Auto-confirm','Projector available'),
  ('Computer Lab 1','Laboratory',40,'Building C - 3rd Floor','Active','Requires approval','40 workstations'),
  ('Auditorium','Event',300,'Building A - 2nd Floor','Maintenance','Requires approval','Aircon repair until further notice'),
  ('Library Hall','Study',100,'Building D - 1st Floor','Inactive','Requires approval','Under renovation')
on conflict do nothing;
