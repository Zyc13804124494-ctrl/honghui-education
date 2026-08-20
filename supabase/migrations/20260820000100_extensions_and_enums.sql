create extension if not exists "pgcrypto";

create type public.member_role as enum ('owner', 'admin', 'teacher');
create type public.record_status as enum ('active', 'disabled', 'archived');
create type public.completion_status as enum ('not_started', 'partial', 'completed', 'late');
create type public.correction_status as enum ('pending', 'corrected', 'needs_revision');
