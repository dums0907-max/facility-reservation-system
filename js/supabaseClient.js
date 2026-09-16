// ---------------------------------------------------------
// Fill these in from Supabase → Project Settings → API
// ---------------------------------------------------------
const SUPABASE_URL = "https://tulupxerognqtpihcsfn.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR1bHVweGVyb2ducXRwaWhjc2ZuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk1MTU5NjQsImV4cCI6MjEwNTA5MTk2NH0.KWsW7PGkVFqZ06yhsoYbLxZMz2h5p1_yES-_kgJHO7Y";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
