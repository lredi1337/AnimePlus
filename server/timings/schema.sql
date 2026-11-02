CREATE TABLE IF NOT EXISTS reports (
    id INTEGER NOT NULL,
    episode TEXT NOT NULL,
    voice TEXT NOT NULL,
    dur_key INTEGER NOT NULL,
    part TEXT NOT NULL,
    reporter TEXT NOT NULL,
    start REAL NOT NULL,
    end REAL NOT NULL,
    day INTEGER NOT NULL,
    PRIMARY KEY (id, episode, voice, dur_key, part, reporter)
);
CREATE INDEX IF NOT EXISTS reports_by_reporter ON reports (reporter, day);
