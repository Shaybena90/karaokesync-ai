-- =====================================================================
-- KaraokeSync AI — pasted lyrics
-- When the user pastes the song's lyrics, the worker keeps those exact
-- words and line breaks and only finds when each word is sung.
-- Written by the API only (browser roles may update just title/style).
-- Safe to run more than once.
-- =====================================================================

alter table public.projects add column if not exists lyrics_text text;

do $$
begin
  alter table public.projects add constraint projects_lyrics_text_length
    check (lyrics_text is null or char_length(lyrics_text) <= 20000);
exception when duplicate_object then null;
end $$;
