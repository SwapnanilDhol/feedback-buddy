-- App icons looked up from the iTunes Search API by bundle identifier and cached.
ALTER TABLE projects ADD COLUMN icon_url TEXT;
ALTER TABLE projects ADD COLUMN icon_checked_at TEXT;
