# veeno ai

A browser-based OpenRouter dashboard for **video generation** and **image generation**.

## What this version includes

- Brand/UI name updated to **veeno ai**
- Responsive dashboard for **mobile and desktop**
- **Video Studio** + **Image Studio** in one project
- Live model loading from OpenRouter
- Models sorted with **free-first** and **quality-first** logic
- OpenAI/ChatGPT image models are listed when available through OpenRouter
- Owner-key mode and BYOK mode
- Video generation uses OpenRouter's async video API
- Image generation uses OpenRouter's image API and shows downloadable results

## Important behavior

- This build is **free-first**.
- Free models are listed first.
- Premium / paid models are also listed for comparison and future use, but **generation is blocked for paid models** in this build to avoid surprise charges.
- If you later want a paid-enabled version, that can be added separately.

## Vercel deployment

1. Upload this folder to GitHub or import directly into Vercel.
2. In **Vercel → Project Settings → Environment Variables**, add:
   - `OPENROUTER_API_KEY` = your OpenRouter key (`sk-or-v1-...`)
   - `APP_ACCESS_CODE` = optional private access code
   - `APP_PUBLIC_URL` = your final site URL (optional but recommended)
3. Deploy.
4. Open the site.
5. Click **API / Access**.
6. Choose **Use site owner key** or **Use my own OpenRouter key**.
7. Click **Save & check**.

## Current endpoints used

- `GET /api/v1/videos/models`
- `POST /api/v1/videos`
- `GET /api/v1/videos/{id}`
- `GET /api/v1/videos/{id}/content`
- `GET /api/v1/models?output_modalities=image`
- `GET /api/v1/images/models`
- `POST /api/v1/images`

## Notes

- Some image models may be listed but not truly free.
- OpenAI GPT-image models are usually premium/paid on OpenRouter, so this build lists them clearly but blocks generation unless you later request a premium-enabled version.
