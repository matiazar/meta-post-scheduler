-- DEC-014, migracion B: los datos ya viven en social_connections (migracion A). Se borran las tablas viejas.
DROP TABLE "meta_connections";
DROP TABLE "threads_connections";
