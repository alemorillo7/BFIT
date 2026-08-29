-- SQL script to add pagos_bs and saldo_merienditas columns to the cobros table
ALTER TABLE public.cobros 
ADD COLUMN IF NOT EXISTS pagos_bs numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS saldo_merienditas numeric DEFAULT 0;
