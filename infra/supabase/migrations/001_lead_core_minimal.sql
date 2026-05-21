create extension if not exists pgcrypto;

create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  name text,
  phone text,
  line_user_id text,
  province text,
  customer_type text,
  current_bill numeric,
  target_saving numeric,
  usage_pattern text,
  phase_type text,
  lead_score int default 0,
  lead_stage text default 'NEW_ESTIMATE',
  source_page text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  consent_status text default 'unknown',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists solar_estimates (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references leads(id),
  opal_pricing_version text not null,
  recommended_tier text,
  recommended_kw_range text,
  estimated_budget_min numeric,
  estimated_budget_max numeric,
  estimated_monthly_saving numeric,
  estimated_payback_range text,
  roof_area_note text,
  calculation_version text default 'static-mvp1',
  confidence numeric,
  requires_more_info boolean default true,
  created_at timestamptz default now()
);

create table if not exists lead_events (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references leads(id),
  event_id text unique,
  event_type text not null,
  event_payload jsonb not null,
  created_at timestamptz default now()
);

create table if not exists event_processing_log (
  id uuid primary key default gen_random_uuid(),
  event_id text not null,
  source text,
  status text not null,
  attempt_count int default 0,
  last_error text,
  idempotency_key text,
  processed_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists dead_letter_events (
  id uuid primary key default gen_random_uuid(),
  original_event_id text not null,
  source text,
  payload jsonb not null,
  failure_reason text,
  retry_count int default 0,
  replay_status text default 'pending',
  replayed_by text,
  replayed_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists agent_audit_logs (
  id uuid primary key default gen_random_uuid(),
  agent_name text not null,
  action_type text not null,
  lead_id uuid,
  event_id text,
  model_used text,
  prompt_version text,
  input_hash text,
  output_hash text,
  approval_required boolean default true,
  approved_by text,
  metadata jsonb,
  created_at timestamptz default now()
);

create index if not exists idx_leads_stage on leads(lead_stage);
create index if not exists idx_leads_score on leads(lead_score desc);
create index if not exists idx_lead_events_event_id on lead_events(event_id);
create index if not exists idx_event_processing_log_event_id on event_processing_log(event_id);
create index if not exists idx_event_processing_log_idempotency on event_processing_log(idempotency_key);
create index if not exists idx_dead_letter_events_status on dead_letter_events(replay_status);
create index if not exists idx_agent_audit_event_id on agent_audit_logs(event_id);
