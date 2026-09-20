# veeno ai

A browser-based **free-only** video and image generation dashboard.

## Current rule

- Only media models that the live provider catalog reports as **zero-price / free** are returned by the backend.
- Paid and premium media models are **not shown at all**.
- If no verified free video or image model is currently available, the UI says so instead of showing paid alternatives.
- Generation endpoints still re-check the selected model and reject anything that is not verified free.

## Features

- Responsive mobile + desktop dashboard
- Video Studio + Image Studio
- Live OpenRouter media-catalog checks
- Owner API key stored server-side in Vercel
- Optional BYOK mode
- No paid fallback and no paid model listings

## Vercel

Required environment variable:

- `OPENROUTER_API_KEY`

Optional:

- `APP_ACCESS_CODE`
- `APP_PUBLIC_URL`

After changing environment variables, redeploy the project.

## Important

A model being available in OpenRouter does not mean it is free. Veeno AI filters paid media models out completely.
