# 🤘 welcome to stagehand!

hey! this is a project built with [stagehand](https://github.com/browserbase/stagehand).

you can build your own web agent using: `npx create-browser-app`!

## setting the stage

stagehand is an sdk for automating browsers. it's built on top of [playwright](https://playwright.dev/) and provides a higher-level api for better debugging and ai fail-safes.

## curtain call

get ready for a show-stopping development experience. just run:

```bash
npm install && npm start
```

## what's next?

### add your api keys

required api keys/environment variables are in the `.env.example` file. copy it to `.env` and add your api keys.

```bash
cp .env.example .env && nano .env # Add your API keys to .env
```

### custom .cursorrules

we have custom .cursorrules for this project. it'll help quite a bit with writing stagehand easily.

### run on browserbase

to run on browserbase, add your api keys to .env and change `env: "LOCAL"` to `env: "BROWSERBASE"` in [stagehand.config.ts](stagehand.config.ts).

### use anthropic claude 3.5 sonnet

1. add your api key to .env
2. change `modelName: "gpt-4o"` to `modelName: "claude-3-5-sonnet-latest"` in [stagehand.config.ts](stagehand.config.ts)
3. change `modelClientOptions: { apiKey: process.env.OPENAI_API_KEY }` to `modelClientOptions: { apiKey: process.env.ANTHROPIC_API_KEY }` in [stagehand.config.ts](stagehand.config.ts)
