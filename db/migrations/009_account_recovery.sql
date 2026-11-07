ALTER TABLE staff_invitations ADD COLUMN purpose text NOT NULL DEFAULT 'INVITE' CHECK(purpose IN('INVITE','RESET'));
