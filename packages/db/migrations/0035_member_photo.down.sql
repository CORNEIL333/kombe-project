-- Retour arrière de 0035_member_photo : les photos de membres sont perdues
-- (aucune donnée financière). Les clients se replient sur les initiales.
BEGIN;
DROP TABLE IF EXISTS identity_photo;
COMMIT;
