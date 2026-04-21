// env.d.ts
declare namespace NodeJS {
  interface ProcessEnv {
    XODE_RPC_URL: string;
    MONGO_URI: string;
    MONGO_PORT: number;
    MONGO_DB_NAME: string;
    MONGO_USER: string;
    MONGO_PASS: string;
    NODE_ENV: 'development' | 'production';
    START_BLOCK: number;
    RABBITMQ_URL: string;
    RABBITMQ_EXHCNAGE_NAME: string;
    RABBITMQ_QUEUE_NAME: string;
    MASTER_API_KEY: string;
    USER_API_KEY: string;
    API_PORT: string;
  }
}