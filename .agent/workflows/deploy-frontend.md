---
description: How to deploy the frontend to Cloudflare Pages manually using Wrangler
---

1. Go to the frontend directory
```bash
cd frontend
```

2. Install dependencies if not already done
```bash
npm ci
```

3. Build the frontend
```bash
npm run build
```

4. Login to Cloudflare (if not already authenticated)
```bash
npx wrangler login
```

5. Deploy to Cloudflare Pages
// turbo
6. Run the following command to deploy
```bash
npx wrangler pages deploy dist --project-name=brady-auto-scan-pdf
```
