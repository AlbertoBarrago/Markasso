-- Anonymous Mac app download counter: one row per day and version.
-- No visitor data (IP, cookie, user agent) is ever stored.
CREATE TABLE downloads (
  day TEXT NOT NULL,
  version TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, version)
);
