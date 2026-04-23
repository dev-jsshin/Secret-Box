-- ========================================
-- Service catalog
-- 사용자 vault 항목 입력 시 자동완성에 쓰는 인기 서비스 메타데이터
-- 카탈로그는 공개 정보 — 누가 어떤 카탈로그를 조회했는지는 zero-knowledge 무관
-- ========================================
CREATE TABLE service_catalog (
    id           BIGSERIAL    PRIMARY KEY,
    slug         VARCHAR(64)  UNIQUE NOT NULL,
    name         VARCHAR(128) NOT NULL,
    name_en      VARCHAR(128),
    category     VARCHAR(32)  NOT NULL,
    brand_color  VARCHAR(8),
    icon_url     TEXT,
    default_url  VARCHAR(255),
    aliases      TEXT[]       NOT NULL DEFAULT ARRAY[]::TEXT[],
    is_active    BOOLEAN      NOT NULL DEFAULT TRUE,
    sort_order   INTEGER      NOT NULL DEFAULT 0,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),

    CONSTRAINT chk_catalog_category CHECK (
        category IN ('social', 'work', 'finance', 'shopping', 'media', 'dev', 'gaming', 'other')
    )
);

CREATE INDEX idx_catalog_slug     ON service_catalog(slug);
CREATE INDEX idx_catalog_category ON service_catalog(category);
CREATE INDEX idx_catalog_active   ON service_catalog(is_active);

-- ========================================
-- Seed: 인기 서비스 22개
-- icon_url은 frontend/public/logos/{slug}.svg 경로 가정
-- ========================================
INSERT INTO service_catalog (slug, name, name_en, category, brand_color, icon_url, default_url, aliases, sort_order) VALUES
  -- social
  ('naver',     '네이버',       'Naver',     'social',   '#03C75A', '/logos/naver.svg',     'https://naver.com',                ARRAY['네이버','naver'],          10),
  ('kakao',     '카카오',       'Kakao',     'social',   '#FFCD00', '/logos/kakao.svg',     'https://accounts.kakao.com',       ARRAY['카카오','kakao'],          11),
  ('instagram', 'Instagram',    'Instagram', 'social',   '#E1306C', '/logos/instagram.svg', 'https://instagram.com',            ARRAY['인스타','instagram'],      12),
  ('facebook',  'Facebook',     'Facebook',  'social',   '#1877F2', '/logos/facebook.svg',  'https://facebook.com',             ARRAY['페이스북','facebook'],     13),
  ('x',         'X',            'X',         'social',   '#000000', '/logos/x.svg',         'https://x.com',                    ARRAY['트위터','twitter','x'],    14),
  ('linkedin',  'LinkedIn',     'LinkedIn',  'social',   '#0077B5', '/logos/linkedin.svg',  'https://linkedin.com',             ARRAY['링크드인','linkedin'],     15),
  -- work
  ('google',    'Google',       'Google',    'work',     '#4285F4', '/logos/google.svg',    'https://accounts.google.com',      ARRAY['구글','google'],           20),
  ('microsoft', 'Microsoft',    'Microsoft', 'work',     '#5E5E5E', '/logos/microsoft.svg', 'https://login.microsoftonline.com',ARRAY['마이크로소프트','microsoft','msft'], 21),
  ('slack',     'Slack',        'Slack',     'work',     '#4A154B', '/logos/slack.svg',     'https://slack.com',                ARRAY['슬랙','slack'],            22),
  ('notion',    'Notion',       'Notion',    'work',     '#000000', '/logos/notion.svg',    'https://notion.so',                ARRAY['노션','notion'],           23),
  ('zoom',      'Zoom',         'Zoom',      'work',     '#2D8CFF', '/logos/zoom.svg',      'https://zoom.us',                  ARRAY['줌','zoom'],               24),
  -- finance
  ('toss',      '토스',         'Toss',      'finance',  '#0064FF', '/logos/toss.svg',      'https://toss.im',                  ARRAY['토스','toss'],             30),
  ('kakaobank', '카카오뱅크',   'KakaoBank', 'finance',  '#FFCD00', '/logos/kakaobank.svg', 'https://kakaobank.com',            ARRAY['카뱅','kakaobank'],        31),
  ('paypal',    'PayPal',       'PayPal',    'finance',  '#003087', '/logos/paypal.svg',    'https://paypal.com',               ARRAY['페이팔','paypal'],         32),
  -- shopping
  ('coupang',   '쿠팡',         'Coupang',   'shopping', '#F03A3A', '/logos/coupang.svg',   'https://coupang.com',              ARRAY['쿠팡','coupang'],          40),
  ('amazon',    'Amazon',       'Amazon',    'shopping', '#FF9900', '/logos/amazon.svg',    'https://amazon.com',               ARRAY['아마존','amazon'],         41),
  -- media
  ('youtube',   'YouTube',      'YouTube',   'media',    '#FF0000', '/logos/youtube.svg',   'https://youtube.com',              ARRAY['유튜브','youtube'],        50),
  ('netflix',   'Netflix',      'Netflix',   'media',    '#E50914', '/logos/netflix.svg',   'https://netflix.com',              ARRAY['넷플릭스','netflix'],      51),
  ('spotify',   'Spotify',      'Spotify',   'media',    '#1DB954', '/logos/spotify.svg',   'https://spotify.com',              ARRAY['스포티파이','spotify'],    52),
  -- dev
  ('github',    'GitHub',       'GitHub',    'dev',      '#181717', '/logos/github.svg',    'https://github.com',               ARRAY['깃허브','github'],         60),
  ('gitlab',    'GitLab',       'GitLab',    'dev',      '#FC6D26', '/logos/gitlab.svg',    'https://gitlab.com',               ARRAY['깃랩','gitlab'],           61),
  -- gaming
  ('steam',     'Steam',        'Steam',     'gaming',   '#171A21', '/logos/steam.svg',     'https://store.steampowered.com',   ARRAY['스팀','steam'],            70);
