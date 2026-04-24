-- 카탈로그 확장: 업무/보안/개발 도구
-- 멱등 (ON CONFLICT DO NOTHING) — 같은 slug가 이미 있으면 그냥 건너뜀
INSERT INTO service_catalog (slug, name, name_en, category, brand_color, icon_url, default_url, aliases, sort_order) VALUES
  ('cyberark', 'CyberArk', 'CyberArk',          'work', '#008476', '/logos/cyberark.svg', 'https://www.cyberark.com',                  ARRAY['사이버아크','cyberark'],         25),
  ('aws',      'AWS',      'Amazon Web Services','dev',  '#FF9900', '/logos/aws.svg',      'https://signin.aws.amazon.com',             ARRAY['aws','amazon web services','aws cloud','클라우드'], 62),
  ('jenkins',  'Jenkins',  'Jenkins',           'dev',   '#D33833', '/logos/jenkins.svg',  'https://www.jenkins.io',                    ARRAY['jenkins','젠킨스'],              63)
ON CONFLICT (slug) DO NOTHING;
