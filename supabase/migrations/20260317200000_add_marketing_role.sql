-- Adiciona role 'marketing' e coluna assigned_to_marketing

-- 1. Atualiza constraint de role para incluir 'marketing'
ALTER TABLE people DROP CONSTRAINT IF EXISTS people_role_check;
ALTER TABLE people ADD CONSTRAINT people_role_check
  CHECK (role IN ('manager', 'inspector', 'attendant', 'marketing'));

-- 2. Adiciona coluna assigned_to_marketing (nullable)
ALTER TABLE inspections
  ADD COLUMN IF NOT EXISTS assigned_to_marketing uuid NULL
  REFERENCES people(id);

-- 3. Indice para consultas filtradas por marketing
CREATE INDEX IF NOT EXISTS inspections_assigned_to_marketing_idx
  ON inspections (assigned_to_marketing);
