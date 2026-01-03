-- Sample seed data for testing

-- Insert sample locations
INSERT INTO locations (location_key, location_name, city, active) VALUES
  ('HKV', 'Hauz Khas Village', 'Delhi', true),
  ('CP', 'Connaught Place', 'Delhi', true),
  ('GK', 'Greater Kailash', 'Delhi', true)
ON CONFLICT (location_key) DO NOTHING;

-- Insert sample booths
INSERT INTO booths (id, booth_name, api_key, location_key, status) VALUES
  ('550e8400-e29b-41d4-a716-446655440001', 'HKV Main Booth', 'api_hkv_main_001', 'HKV', 'active'),
  ('550e8400-e29b-41d4-a716-446655440002', 'CP Booth 1', 'api_cp_001', 'CP', 'active'),
  ('550e8400-e29b-41d4-a716-446655440003', 'GK Booth 1', 'api_gk_001', 'GK', 'active')
ON CONFLICT (api_key) DO NOTHING;
