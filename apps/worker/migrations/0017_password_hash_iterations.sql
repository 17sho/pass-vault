ALTER TABLE users ADD COLUMN password_iterations INTEGER NOT NULL DEFAULT 100000 CHECK(password_iterations >= 100000 AND password_iterations <= 2000000);
