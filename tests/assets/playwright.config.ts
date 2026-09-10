import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';
const runName=process.env.WATCH_ASSET_RUN_ID??`assets-${new Date().toISOString().replace(/[:.]/g,'-')}`;
process.env.WATCH_ASSET_RUN_ID=runName;
const outputDir=resolve(import.meta.dirname,'../../artifacts/runs',runName);
export default defineConfig({
  testDir:'.',testMatch:'*.spec.ts',fullyParallel:false,workers:1,timeout:60000,
  outputDir,metadata:{assetRun:runName},reporter:[['list'],['json',{outputFile:resolve(outputDir,'results.json')}]],
  use:{baseURL:'http://127.0.0.1:5186',viewport:{width:1440,height:1040},deviceScaleFactor:1,browserName:'chromium'},
  webServer:{command:'pnpm dev --port 5186',url:'http://127.0.0.1:5186/tests/assets/preview.html',reuseExistingServer:true,timeout:30000},
});
