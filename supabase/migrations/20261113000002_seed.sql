-- AI Radar: MVP sources + initial interest profile. See docs/SOURCES.md.

insert into public.sources (name, adapter, config) values
  ('AIOAI',            'wordpress', '{"baseUrl": "https://aioai.pl", "lang": "pl"}'),
  ('The Decoder',      'wordpress', '{"baseUrl": "https://the-decoder.com", "lang": "en"}'),
  ('MarkTechPost',     'wordpress', '{"baseUrl": "https://www.marktechpost.com", "lang": "en"}'),
  ('TechCrunch AI',    'wordpress', '{"baseUrl": "https://techcrunch.com", "categories": [577047203], "lang": "en"}'),
  ('Anthropic News',   'html',      '{"listUrl": "https://www.anthropic.com/news", "linkPattern": "^/news/[a-z0-9-]+$", "lang": "en"}')
on conflict (name) do nothing;

insert into public.profile (id, interests) values (1,
$$I am a software tester who wants to keep up with where AI is going.

Boost (high interest):
- New models and new techniques (releases, capabilities, benchmarks that matter in practice)
- AI in software development and software testing; developer workflows, coding agents, AI-assisted QA
- Practical, everyday uses of AI; tools that save time and make work or life easier
- The overall direction of the AI field

Low priority:
- AI in scientific research$$)
on conflict (id) do nothing;
