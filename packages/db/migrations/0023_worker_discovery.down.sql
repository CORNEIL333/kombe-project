-- KÓMBE — retrait de la découverte worker (0023).
-- Contrairement aux tables round/obligation (0022), aucun trigger ne référence
-- cette fonction : un DROP FUNCTION suffit ; IF EXISTS garde l'ordre down
-- utilisable sur une base où le fichier up n'a jamais été appliqué.
DROP FUNCTION IF EXISTS kombe_c13_pending_groups();
