-- Защита формы поддержки от спама: только необратимые хэши и время отправки, хранятся 2 дня
CREATE TABLE IF NOT EXISTS feedback_log (
    reporter TEXT NOT NULL,
    digest TEXT NOT NULL,
    ts INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS feedback_by_time ON feedback_log (ts);
