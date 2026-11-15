-- =====================================================================
-- KaraokeSync AI — bigger video backgrounds and own opening clips
-- Lets the private "backgrounds" bucket hold files up to 200 MB (it was 30 MB).
-- Supabase's own upload limit must allow it too: on the Pro plan, set
-- Storage -> Settings -> Upload file size limit to 200 MB or more.
-- Safe to run more than once.
-- =====================================================================
update storage.buckets
   set file_size_limit = 209715200   -- 200 MB
 where id = 'backgrounds';
