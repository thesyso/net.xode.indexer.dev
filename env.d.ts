// env.d.ts
declare namespace NodeJS {
  interface ProcessEnv {
    XODE_RPC_URL: string;
    MONGO_URI: string;
    NODE_ENV: 'development' | 'production';
  }
}