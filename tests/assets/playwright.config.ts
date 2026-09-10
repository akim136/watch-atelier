import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';
const runName=process.env.WATCH_ASSET_RUN_ID??`assets-${new Date().toISOString().replace(/[:.]/g,'-')}`;
process.env.WATCH_ASSET_RUN_ID=runName;
const outputDir=resolve(import.meta.dirname,'../../artifacts/runs',runName);
const port=Number(process.env.WATCH_ASSET_PORT ?? 5186);
if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('Invalid asset test port.');
export default defineConfig({
  testDir:'.',testMatch:'*.spec.ts',fullyParallel:false,workers:1,timeout:60000,
  outputDir,metadata:{assetRun:runName},reporter:[['list'],['json',{outputFile:resolve(outputDir,'results.json')}]],
  use:{baseURL:`http://127.0.0.1:${port}`,viewport:{width:1440,height:1040},deviceScaleFactor:1,browserName:'chromium'},
  webServer:{command:`pnpm dev --port ${port}`,url:`http://127.0.0.1:${port}/tests/assets/preview.html`,reuseExistingServer:true,timeout:30000},
});
