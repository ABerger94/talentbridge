**Welcome to your Base44 project** 

**About**

View and Edit  your app on [Base44.com](http://Base44.com) 

This project contains everything you need to run your app locally.

**Edit the code in your local development environment**

Any change pushed to the repo will also be reflected in the Base44 Builder.

**Prerequisites:** 

1. Clone the repository using the project's Git URL 
2. Navigate to the project directory
3. Install dependencies: `npm install`
4. Create an `.env.local` file and set the right environment variables

```
VITE_BASE44_APP_ID=your_app_id
VITE_BASE44_APP_BASE_URL=your_backend_url

e.g.
VITE_BASE44_APP_ID=cbef744a8545c389ef439ea6
VITE_BASE44_APP_BASE_URL=https://my-to-do-list-81bfaad7.base44.app
```

Run the app: `npm run dev`

**Deploying to Vercel**

- Build command: `npm run vercel-build`
- Install command: `npm ci`
- Output directory: `dist`
- Set these environment variables in Vercel Project Settings:
  - `VITE_BASE44_APP_ID`
  - `VITE_BASE44_APP_BASE_URL` — use the Base44 app domain, for example `https://your-app.base44.app`, not `https://api.base44.com`
  - `VITE_BASE44_FUNCTIONS_VERSION` if your Base44 deployment requires a specific functions version

The repo includes Vercel SPA rewrites and static route fallbacks for direct links like `/jobs`, `/post-job`, `/dashboard`, `/employer`, and `/onboarding`.

**Publish your changes**

Open [Base44.com](http://Base44.com) and click on Publish.

**Docs & Support**

Documentation: [https://docs.base44.com/Integrations/Using-GitHub](https://docs.base44.com/Integrations/Using-GitHub)

Support: [https://app.base44.com/support](https://app.base44.com/support)
