import { execSync } from 'child_process';
import mongoose, { Schema, Document } from 'mongoose';
import chalk from 'chalk';
import dotenv from 'dotenv';

// DB 연결 및 Docker 컨테이너 관리 함수들
dotenv.config();

// MongoDB 연결 URI (환경 변수에서 가져오거나 기본값 사용)
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/xode_indexer';


// 1. 데이터 타입 정의 (TypeScript용)
export interface IAsset extends Document {
  assetId: number;      // 자산 고유 번호 (Primary Key 역할)
  name: string;         // 자산 이름 (예: "Xode Ecosystem Token")
  symbol: string;       // 티커 (예: "XET")
  decimals: number;     // 소수점 자리수 (예: 18)
  owner: string;        // 자산 관리자 주소
  updatedAt: Date;
}

const AssetSchema = new Schema({
  assetId: { type: Number, required: true, unique: true, index: true },
  name: { type: String, required: true },
  symbol: { type: String, required: true },
  decimals: { type: Number, required: true, default: 18 },
  owner: { type: String },
  updatedAt: { type: Date, default: Date.now }
});

export interface IBlock extends Document {
  blockNumber: number;
  blockHash: string;
  rawData: any; // 노드에서 받은 원시 데이터를 그대로 저장
  summary: {
    txCount: number;
    isFinalized: boolean;
  };
  transactions: ITransaction[]; // 익스트린식 대신 트랜잭션으로 명명
  timestamp: Date;
}

// 2. 몽고디비 스키마(구조) 정의
const BlockSchema: Schema = new Schema({
  blockNumber: { type: Number, required: true, unique: true },
  blockHash: { type: String, required: true },
  // 노드에서 오는 모든 Raw 데이터를 담는 필드
  rawData: { type: Object, required: true }, 
  // 나중에 분석을 위해 추출한 트랜잭션 수 등 요약 정보
  summary: {
    txCount: Number,
    isFinalized: Boolean
  },
  transactions: [{
    module: String,
    method: String,
    from: String,
    to: String,
    amount: String,
    hash: String,
    success: Boolean
  }],
  timestamp: { type: Date, default: Date.now }
});

export interface ITransaction {
  module: string;
  method: string;
  from: string;
  to: string;
  amount: string; // 큰 숫자는 문자열로 저장하는 것이 안전합니다.
  hash: string;
  success: boolean;
}
export interface ITransaction extends Document {
  hash: string;
  blockNumber: number;
  module: string;
  method: string;
  from: string;
  to: string;
  amount: string;
  success: boolean;
  timestamp: Date;
}

const TransactionSchema: Schema = new Schema({
  hash: { type: String, required: true, unique: true }, // 트랜잭션 해시는 유니크해야 함
  blockNumber: { type: Number, required: true, index: true }, // 인덱스 추가로 검색 최적화
  module: { type: String, index: true },
  method: { type: String, index: true },
  from: { type: String, index: true },
  to: { type: String, index: true },
  amount: String,
  success: Boolean,
  timestamp: { type: Date, default: Date.now, index: true }
});

// ...existing code...
// 3. 몽고디비 모델 정의 (이미 존재하면 재사용)
export const XodeAsset = mongoose.models.XodeAsset || mongoose.model<IAsset>('Asset', AssetSchema);
export const XodeBlock = mongoose.models.XodeBlock || mongoose.model<IBlock>('Block', BlockSchema);
export const XodeTransaction = mongoose.models.XodeTransaction || mongoose.model<ITransaction>('Transaction', TransactionSchema);

// 4. Docker 컨테이너 실행 확인 함수
export const ensureMongoRunning = async () => {
  try {
    console.log(chalk.cyan('Checking MongoDB container status...'));
    
    // docker-compose를 통해 컨테이너 실행 (이미 실행 중이면 아무 일도 일어나지 않음)
    execSync('docker-compose up -d mongodb', { stdio: 'inherit' });
    
    console.log(chalk.green('MongoDB container is ready.'));
  } catch (error) {
    console.error(chalk.red('Failed to start MongoDB via Docker:'), error);
    console.log(chalk.yellow('Make sure Docker Desktop is running!'));
    process.exit(1);
  }
};
// 5. DB 연결 함수
export const connectDB = async () => {
  const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/xode_indexer';
  
  try {
    await mongoose.connect(MONGO_URI);
    console.log(chalk.bgGreen.black(' MONGO DB CONNECTED '));
  } catch (err) {
    console.error(chalk.red('❌ MongoDB Connection Error:'), err);
    process.exit(1);
  }
};