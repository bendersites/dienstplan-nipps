-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Employees table
create table employees (
  id uuid default uuid_generate_v4() primary key,
  name text not null,
  email text unique not null,
  role text check (role in ('admin', 'employee')) default 'employee',
  qualification text check (qualification in ('shop', 'post', 'both')) default 'both',
  target_hours integer default 0,
  availability jsonb default '{}',
  active boolean default true,
  created_at timestamptz default now()
);

-- Blocker days table
create table blocker_days (
  id uuid default uuid_generate_v4() primary key,
  employee_id uuid references employees(id) on delete cascade,
  date date not null,
  reason text,
  created_at timestamptz default now()
);

-- Schedules table
create table schedules (
  id uuid default uuid_generate_v4() primary key,
  month date not null unique,
  status text check (status in ('draft', 'published')) default 'draft',
  published_at timestamptz,
  created_at timestamptz default now()
);

-- Shifts table
create table shifts (
  id uuid default uuid_generate_v4() primary key,
  date date not null,
  shift_type text check (shift_type in ('morning', 'afternoon', 'saturday')) not null,
  area text check (area in ('shop', 'post')) not null,
  employee_id uuid references employees(id) on delete set null,
  schedule_id uuid references schedules(id) on delete cascade,
  is_open boolean default false,
  created_at timestamptz default now()
);

-- Row Level Security (RLS)
alter table employees enable row level security;
alter table blocker_days enable row level security;
alter table schedules enable row level security;
alter table shifts enable row level security;

-- Policies (für MVP: offen, später mit Auth-Check einschränken)
create policy "Allow all" on employees for all using (true) with check (true);
create policy "Allow all" on blocker_days for all using (true) with check (true);
create policy "Allow all" on schedules for all using (true) with check (true);
create policy "Allow all" on shifts for all using (true) with check (true);

-- Insert initial employees (Peter as admin)
insert into employees (name, email, role, qualification, target_hours, availability) values
  ('Peter', 'peter@nipps.de', 'admin', 'both', 0, '{"mon_morning": true, "tue_morning": true, "tue_afternoon": true, "wed_morning": true, "wed_afternoon": true, "thu_morning": true, "fri_morning": true, "fri_afternoon": true, "sat_morning": true}'),
  ('Gudrun', 'gudrun@nipps.de', 'employee', 'both', 120, '{"mon_morning": true, "mon_afternoon": true, "tue_morning": true, "tue_afternoon": true, "wed_morning": true, "wed_afternoon": true, "thu_morning": true, "thu_afternoon": true, "fri_morning": true, "fri_afternoon": true, "sat_morning": true}'),
  ('Belli', 'belli@nipps.de', 'employee', 'both', 120, '{"mon_morning": true, "mon_afternoon": true, "tue_morning": true, "tue_afternoon": true, "wed_morning": true, "wed_afternoon": true, "thu_morning": true, "thu_afternoon": true, "fri_morning": true, "fri_afternoon": true, "sat_morning": true}'),
  ('Ines', 'ines@nipps.de', 'employee', 'post', 80, '{"mon_morning": true, "mon_afternoon": true, "tue_morning": true, "tue_afternoon": true, "wed_morning": true, "wed_afternoon": true, "thu_morning": true, "thu_afternoon": true, "fri_morning": true, "fri_afternoon": true, "sat_morning": true}'),
  ('Marika', 'marika@nipps.de', 'employee', 'shop', 40, '{"wed_morning": true, "fri_morning": true}'),
  ('Cindy', 'cindy@nipps.de', 'employee', 'shop', 0, '{"fri_morning": true}'),
  ('Anni', 'anni@nipps.de', 'employee', 'post', 0, '{"mon_morning": true}');

-- Create indexes
create index idx_shifts_date on shifts(date);
create index idx_shifts_schedule on shifts(schedule_id);
create index idx_blocker_employee on blocker_days(employee_id);
create index idx_blocker_date on blocker_days(date);