# Vardhan AI — No-login edition

This edition does not require Supabase authentication, Supabase database setup, Twilio, SMS OTP, or user accounts. Chat history and saved memories are stored locally in the browser on the device. They do not sync across devices and may be lost if browser data is cleared.

## Deploy to Netlify
1. Upload the contents of this folder to a GitHub repository.
2. Import the repository into Netlify. Leave Build command blank and set Publish directory to `.`.
3. In Netlify site environment variables, add `GEMINI_API_KEY` with your Google AI Studio API key. Never put this key in frontend files or GitHub.
4. Deploy/redeploy.

Optional: set `GEMINI_MODEL` and `GEMINI_IMAGE_MODEL` to model IDs available to your Google AI Studio API key. The defaults in the function may need changing if those model IDs are unavailable.

## Important cost and abuse note
Netlify and Gemini may have free tiers, quotas, and changing limits; this is not guaranteed unlimited free hosting or AI. Because this version has no login, the AI endpoint is public. Anyone who finds the site can use the Gemini function and consume your API quota or incur charges if billing is enabled. Set a strict usage/budget limit in Google Cloud/AI Studio where available, monitor usage, and consider adding server-side rate limiting before sharing publicly.

## PWA
Deploy over HTTPS, then open the site in Chrome on Android and choose Install app / Add to Home screen.
