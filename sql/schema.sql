-- =========================================================
-- Role-Based Facility Reservation and Approval System
-- Laboratory 4 - Section B
-- Supabase (PostgreSQL) schema: tables, triggers, RLS policies
-- =========================================================

create extension if not exists "uuid-ossp";

-- =========================================================
-- 1. TABLES
-- =========================================================

-- Profiles extends auth.users with a role
create table if not exists profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text not null,
  role        text not null default 'requester'
              check (role in ('admin','staff','requester')),
  created_at  timestamptz not null default now()
);

-- Facilities
create table if not exists facilities (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null,
  location    text,
  capacity    int,
  status      text not null default 'Active'
              check (status in ('Active','Maintenance','Inactive')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Reservations
create table if not exists reservations (
  id            uuid primary key default uuid_generate_v4(),
  facility_id   uuid not null references facilities(id) on delete restrict,
  requester_id  uuid not null references profiles(id) on delete restrict,
  purpose       text,
  start_time    timestamptz not null,
  end_time      timestamptz not null,
  status        text not null default 'Pending'
                check (status in ('Pending','Approved','Rejected','Scheduled','In Use','Completed','Cancelled')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint chk_time_order check (start_time < end_time)
);

-- Service requests (Facility Staff permission: "create service requests")
create table if not exists service_requests (
  id           uuid primary key default uuid_generate_v4(),
  facility_id  uuid references facilities(id) on delete set null,
  staff_id     uuid not null references profiles(id),
  description  text not null,
  status       text not null default 'Open' check (status in ('Open','In Progress','Resolved')),
  created_at   timestamptz not null default now()
);

-- Audit logs
create table if not exists audit_logs (
  id           uuid primary key default uuid_generate_v4(),
  actor_id     uuid references profiles(id),
  action       text not null,
  target_table text not null,
  target_id    uuid,
  details      jsonb,
  created_at   timestamptz not null default now()
);

-- =========================================================
-- 2. HELPER FUNCTION (role lookup, bypasses RLS)
-- =========================================================
create or replace function public.current_role_name()
returns text as $$
  select role from profiles where id = auth.uid();
$$ language sql stable security definer;

-- =========================================================
-- 3. NEW-USER -> PROFILE TRIGGER
-- =========================================================
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', 'Unnamed User'),
    coalesce(new.raw_user_meta_data->>'role', 'requester')
  );
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- =========================================================
-- 4. BUSINESS RULE TRIGGERS - RESERVATIONS
-- =========================================================

-- BR-B4-01 / BR-B4-08: only Active facilities may be reserved
create or replace function public.check_facility_active()
returns trigger as $$
declare
  fac_status text;
begin
  select status into fac_status from facilities where id = new.facility_id;
  if fac_status is distinct from 'Active' then
    raise exception 'Cannot reserve facility: current status is %', fac_status;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_check_facility_active on reservations;
create trigger trg_check_facility_active
  before insert on reservations
  for each row execute procedure public.check_facility_active();

-- BR-B4-03 / BR-B4-06: no overlapping Scheduled/In Use bookings; Approved auto-promotes to Scheduled
create or replace function public.check_reservation_conflict()
returns trigger as $$
begin
  if new.status = 'Approved' then
    new.status := 'Scheduled';
  end if;

  if new.status in ('Scheduled','In Use') then
    if exists (
      select 1 from reservations r
      where r.facility_id = new.facility_id
        and r.id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
        and r.status in ('Scheduled','In Use')
        and tstzrange(r.start_time, r.end_time) && tstzrange(new.start_time, new.end_time)
    ) then
      raise exception 'Reservation conflict: facility already booked for that time range';
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_check_reservation_conflict on reservations;
create trigger trg_check_reservation_conflict
  before insert or update on reservations
  for each row execute procedure public.check_reservation_conflict();

-- BR-B4-05 / BR-B4-07: Completed is final; Rejected cannot move forward
create or replace function public.check_reservation_transition()
returns trigger as $$
begin
  if old.status = 'Completed' then
    raise exception 'Completed reservations cannot be edited';
  end if;
  if old.status = 'Rejected' and new.status <> 'Rejected' then
    raise exception 'Rejected reservations cannot change status';
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_check_reservation_transition on reservations;
create trigger trg_check_reservation_transition
  before update on reservations
  for each row execute procedure public.check_reservation_transition();

-- Facility Staff may only move Scheduled -> In Use -> Completed
create or replace function public.check_staff_reservation_update()
returns trigger as $$
begin
  if public.current_role_name() = 'staff' then
    if not (
      (old.status = 'Scheduled' and new.status = 'In Use') or
      (old.status = 'In Use' and new.status = 'Completed')
    ) then
      raise exception 'Facility staff may only progress Scheduled -> In Use -> Completed';
    end if;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_check_staff_reservation_update on reservations;
create trigger trg_check_staff_reservation_update
  before update on reservations
  for each row execute procedure public.check_staff_reservation_update();

-- BR-B4-10: log reservation submission and every status change
create or replace function public.log_reservation_change()
returns trigger as $$
begin
  if TG_OP = 'INSERT' then
    insert into audit_logs(actor_id, action, target_table, target_id, details)
    values (new.requester_id, 'reservation_submitted', 'reservations', new.id,
            jsonb_build_object('status', new.status, 'facility_id', new.facility_id));
  elsif TG_OP = 'UPDATE' and old.status is distinct from new.status then
    insert into audit_logs(actor_id, action, target_table, target_id, details)
    values (auth.uid(), 'status_changed', 'reservations', new.id,
            jsonb_build_object('from', old.status, 'to', new.status));
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_log_reservation on reservations;
create trigger trg_log_reservation
  after insert or update on reservations
  for each row execute procedure public.log_reservation_change();

-- =========================================================
-- 5. BUSINESS RULE TRIGGERS - FACILITIES
-- =========================================================

-- Facility Staff may only change 'status' (condition), not name/location/capacity
create or replace function public.check_staff_facility_update()
returns trigger as $$
begin
  if public.current_role_name() = 'staff' then
    if new.name is distinct from old.name
       or new.location is distinct from old.location
       or new.capacity is distinct from old.capacity then
      raise exception 'Facility staff may only update facility condition/status';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_check_staff_facility_update on facilities;
create trigger trg_check_staff_facility_update
  before update on facilities
  for each row execute procedure public.check_staff_facility_update();

-- log facility status updates and deletions
create or replace function public.log_facility_change()
returns trigger as $$
begin
  if TG_OP = 'UPDATE' and old.status is distinct from new.status then
    insert into audit_logs(actor_id, action, target_table, target_id, details)
    values (auth.uid(), 'facility_status_updated', 'facilities', new.id,
            jsonb_build_object('from', old.status, 'to', new.status));
  elsif TG_OP = 'DELETE' then
    insert into audit_logs(actor_id, action, target_table, target_id, details)
    values (auth.uid(), 'facility_deleted', 'facilities', old.id,
            jsonb_build_object('name', old.name));
  end if;
  return coalesce(new, old);
end;
$$ language plpgsql security definer;

drop trigger if exists trg_log_facility on facilities;
create trigger trg_log_facility
  after update or delete on facilities
  for each row execute procedure public.log_facility_change();

-- =========================================================
-- 6. ROW LEVEL SECURITY
-- =========================================================
alter table profiles enable row level security;
alter table facilities enable row level security;
alter table reservations enable row level security;
alter table service_requests enable row level security;
alter table audit_logs enable row level security;

-- PROFILES
create policy "profiles_select_own_or_admin" on profiles
  for select using (id = auth.uid() or public.current_role_name() = 'admin');

create policy "profiles_update_own_name" on profiles
  for update using (id = auth.uid())
  with check (id = auth.uid());

create policy "profiles_admin_manage" on profiles
  for all using (public.current_role_name() = 'admin');

-- FACILITIES
create policy "facilities_select_all" on facilities
  for select using (auth.role() = 'authenticated');

create policy "facilities_admin_write" on facilities
  for all using (public.current_role_name() = 'admin');

create policy "facilities_staff_update" on facilities
  for update using (public.current_role_name() = 'staff')
  with check (public.current_role_name() = 'staff');

-- RESERVATIONS
create policy "reservations_select" on reservations
  for select using (
    requester_id = auth.uid() or public.current_role_name() in ('admin','staff')
  );

create policy "reservations_insert_own" on reservations
  for insert with check (requester_id = auth.uid() and status = 'Pending');

create policy "reservations_update_admin" on reservations
  for update using (public.current_role_name() = 'admin');

create policy "reservations_update_staff" on reservations
  for update using (public.current_role_name() = 'staff')
  with check (public.current_role_name() = 'staff');

-- BR-B4-09: requesters may modify only their own Pending requests
create policy "reservations_update_own_pending" on reservations
  for update using (requester_id = auth.uid() and status = 'Pending')
  with check (requester_id = auth.uid() and status in ('Pending','Cancelled'));

-- SERVICE REQUESTS
create policy "service_requests_select" on service_requests
  for select using (public.current_role_name() in ('admin','staff'));

create policy "service_requests_insert_staff" on service_requests
  for insert with check (public.current_role_name() = 'staff' and staff_id = auth.uid());

-- AUDIT LOGS
create policy "audit_logs_admin_select" on audit_logs
  for select using (public.current_role_name() = 'admin');

create policy "audit_logs_insert" on audit_logs
  for insert with check (true);

-- =========================================================
-- 7. SEED DATA (optional - sample facilities for testing)
-- Run this block only once; there is no unique constraint on
-- facility name, so re-running it will insert duplicates.
-- =========================================================
insert into facilities (name, location, capacity, status) values
  ('Conference Room A', 'Main Building, 2nd Floor', 20, 'Active'),
  ('Gymnasium', 'Sports Complex', 200, 'Active'),
  ('Computer Lab 3', 'IT Building', 40, 'Maintenance');
