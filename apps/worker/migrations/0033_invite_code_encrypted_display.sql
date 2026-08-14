-- Allow administrators to reveal newly generated invite codes while keeping plaintext out of D1.
ALTER TABLE invite_codes ADD COLUMN code_ciphertext TEXT;
ALTER TABLE invite_codes ADD COLUMN code_iv TEXT;
