-- Add awaiting_contract status for ocupacao inspections pending contract receipt
ALTER TYPE inspection_status ADD VALUE IF NOT EXISTS 'awaiting_contract' AFTER 'completed';
