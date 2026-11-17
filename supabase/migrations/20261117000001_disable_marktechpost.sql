-- MarkTechPost's API is behind a Cloudflare bot challenge ("Just a moment...", HTTP 403)
-- that blocks automated requests. We respect it: disable the source.
update public.sources set enabled = false where name = 'MarkTechPost';
