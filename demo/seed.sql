-- Fictional pages loaded only in disposable demos. No connected domains or accounts.
INSERT INTO pages (id, org_id, slug, title, subtitle, theme, published, created_at, updated_at) VALUES
 ('page-studio', 'demo', 'northlight-studio', 'Northlight Studio', 'Thoughtful design for small businesses.', '{"accent":"#4338ca","background":"#faf9f6","foreground":"#1b1a19"}', 1, strftime('%Y-%m-%dT%H:%M:%fZ','now','-14 days'), strftime('%Y-%m-%dT%H:%M:%fZ','now','-2 days')),
 ('page-jamie', 'demo', 'jamie-chen', 'Jamie Chen', 'Independent designer. Building useful things.', '{}', 0, strftime('%Y-%m-%dT%H:%M:%fZ','now','-4 days'), strftime('%Y-%m-%dT%H:%M:%fZ','now','-1 day'));
INSERT INTO blocks (id, org_id, page_id, kind, label, url, position, created_at, updated_at) VALUES
 ('block-work', 'demo', 'page-studio', 'link', 'Explore our work', 'https://example.com/work', 0, datetime('now'), datetime('now')),
 ('block-services', 'demo', 'page-studio', 'link', 'Ways to work together', 'https://example.com/services', 1, datetime('now'), datetime('now')),
 ('block-news', 'demo', 'page-studio', 'email', 'Studio updates', '', 2, datetime('now'), datetime('now')),
 ('block-about', 'demo', 'page-jamie', 'link', 'About my work', 'https://example.com/about', 0, datetime('now'), datetime('now'));
INSERT INTO settings (org_id, footer_name, footer_url, updated_at) VALUES ('demo', 'Northlight Studio', 'https://example.com', datetime('now'));
