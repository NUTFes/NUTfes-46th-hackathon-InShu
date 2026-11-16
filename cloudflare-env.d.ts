interface CloudflareEnv {
 SLACK_CLIENT_ID?: string; SLACK_CLIENT_SECRET?: string; SLACK_TEAM_ID?: string; APP_BASE_URL?: string;
 DB: D1Database; PHOTOS: R2Bucket; SESSION_SECRET?: string; DEV_LOGIN?: string; APP_ENV?: string;
 GEMINI_API_KEY?: string; GEMINI_DETECT_MODEL?: string; GEMINI_EDIT_MODEL?: string; REPLACE_DAILY_LIMIT?: string;
}
