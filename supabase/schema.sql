create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone_number text not null unique,
  email text,
  notes text,
  bot_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid references public.contacts(id) on delete set null,
  phone_number text not null unique,
  user_name text not null,
  agent_active boolean not null default true,
  last_message_preview text,
  last_message_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender text not null check (sender in ('user', 'agent')),
  content text,
  message_type text not null default 'text' check (message_type in ('text', 'link', 'image', 'audio', 'file')),
  media_url text,
  mime_type text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.tags (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  normalized_name text not null unique,
  color text not null default '#2264f5',
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.conversation_tags (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  tag_id uuid not null references public.tags(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (conversation_id, tag_id)
);

create index if not exists idx_contacts_phone on public.contacts(phone_number);
create index if not exists idx_conversations_last_message on public.conversations(last_message_at desc nulls last);
create index if not exists idx_messages_conversation_created on public.messages(conversation_id, created_at);
create index if not exists idx_tags_normalized_name on public.tags(normalized_name);

drop trigger if exists set_contacts_updated_at on public.contacts;
create trigger set_contacts_updated_at
before update on public.contacts
for each row execute function public.set_updated_at();

drop trigger if exists set_conversations_updated_at on public.conversations;
create trigger set_conversations_updated_at
before update on public.conversations
for each row execute function public.set_updated_at();

alter table public.contacts enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.tags enable row level security;
alter table public.conversation_tags enable row level security;

drop policy if exists "Public read contacts" on public.contacts;
create policy "Public read contacts"
on public.contacts for select
using (true);

drop policy if exists "Public read conversations" on public.conversations;
create policy "Public read conversations"
on public.conversations for select
using (true);

drop policy if exists "Public read messages" on public.messages;
create policy "Public read messages"
on public.messages for select
using (true);

drop policy if exists "Public read tags" on public.tags;
create policy "Public read tags"
on public.tags for select
using (true);

drop policy if exists "Public read conversation_tags" on public.conversation_tags;
create policy "Public read conversation_tags"
on public.conversation_tags for select
using (true);

insert into storage.buckets (id, name, public)
values ('chat-images', 'chat-images', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('chat-media', 'chat-media', true)
on conflict (id) do nothing;

drop policy if exists "Public read chat-images" on storage.objects;
create policy "Public read chat-images"
on storage.objects for select
using (bucket_id = 'chat-images');

drop policy if exists "Public read chat-media" on storage.objects;
create policy "Public read chat-media"
on storage.objects for select
using (bucket_id = 'chat-media');

alter table public.contacts replica identity full;
alter table public.conversations replica identity full;
alter table public.messages replica identity full;
alter table public.tags replica identity full;
alter table public.conversation_tags replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'contacts'
  ) then
    alter publication supabase_realtime add table public.contacts;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'conversations'
  ) then
    alter publication supabase_realtime add table public.conversations;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'tags'
  ) then
    alter publication supabase_realtime add table public.tags;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'conversation_tags'
  ) then
    alter publication supabase_realtime add table public.conversation_tags;
  end if;
end
$$;
