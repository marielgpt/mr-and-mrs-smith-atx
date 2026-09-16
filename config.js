/* Wedding Day — deployment config.
   The Supabase publishable (anon) key is meant to be public in a static site;
   Row Level Security on the wedding_state table is what actually protects the data. */
window.WEDDING_CONFIG = {
  // Supabase
  SUPABASE_URL: "https://gdawfbmveoxmbkbqfwgr.supabase.co",
  SUPABASE_KEY: "sb_publishable_LR8Ob_xhbcr7HvshGts1VQ_X8bWU0VO",

  // App props (mirrors the design's editable props)
  title: "Wedding Day",
  venue: "Soho House",
  venueAddress: "1011 S Congress Ave, Austin, TX 78704", // set "" to show the "add the venue address" tag
  accessCode: "1017",
  weddingDate: "2026-10-17",
  collapsePast: true,
  simulatedTime: "" // e.g. "16:20" to pin the clock while testing
};
