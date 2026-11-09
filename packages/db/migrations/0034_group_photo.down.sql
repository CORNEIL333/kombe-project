-- Retour arrière de 0034_group_photo : les photos de groupe sont perdues
-- (aucune donnée financière). Les clients se replient sur les initiales.
BEGIN;
DROP TABLE IF EXISTS group_photo;
COMMIT;
