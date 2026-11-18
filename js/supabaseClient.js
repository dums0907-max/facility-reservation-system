// ---------------------------------------------------------
// Fill these in from Supabase → Project Settings → API
// ---------------------------------------------------------
const SUPABASE_URL = "https://cztezldterjvvzengyys.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN6dGV6bGR0ZXJqdnZ6ZW5neXlzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg5MDMwMzQsImV4cCI6MjEwNDQ3OTAzNH0.1i79MBlEHyP8KY-98jEdAx69JPpjAsi7Mdki_p4Pd9Q";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
