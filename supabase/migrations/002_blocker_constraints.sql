-- Schichtgenaue Blockertage + Schutz gegen doppelte Eintraege.
-- Im Supabase SQL Editor ausfuehren.

-- 1. Spalte fuer halbtaegige Blocker (falls noch nicht vorhanden)
alter table blocker_days add column if not exists shift_type text;
alter table blocker_days add column if not exists type text default 'blocker';

-- 2. Nur erlaubte Werte
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'blocker_days_shift_type_check') then
    alter table blocker_days
      add constraint blocker_days_shift_type_check
      check (shift_type is null or shift_type in ('morning', 'afternoon', 'saturday'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'blocker_days_type_check') then
    alter table blocker_days
      add constraint blocker_days_type_check
      check (type in ('blocker', 'vacation'));
  end if;
end $$;

-- 3. Kein Tag darf zweimal drinstehen.
--    Das war die Ursache dafuer, dass Gudruns Urlaub im August
--    doppelt angerechnet wurde (145h statt 50h).
create unique index if not exists uniq_blocker_day_full
  on blocker_days (employee_id, date, type)
  where shift_type is null;

create unique index if not exists uniq_blocker_day_shift
  on blocker_days (employee_id, date, type, shift_type)
  where shift_type is not null;

-- 4. Kein Slot darf zweimal belegt sein.
create unique index if not exists uniq_shift_slot
  on shifts (schedule_id, date, shift_type, area);
