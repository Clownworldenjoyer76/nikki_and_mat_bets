const SUPABASE_URL = "https://qbxwresgflqmvxzwaqqu.supabase.co";
const SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_WPcM4vX55ZwQhpKDrSG0Lg_D-D1HX8Q";

window.supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
);
