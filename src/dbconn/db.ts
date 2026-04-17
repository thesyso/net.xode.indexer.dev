import { execSync } from 'child_process';
import mongoose, { Schema, Document } from 'mongoose';
import chalk from 'chalk';
import dotenv from 'dotenv';

// DB 연결 및 Docker 컨테이너 관리 함수들
dotenv.config();


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

// export interface ITransaction {
//   module: string;
//   method: string;
//   from: string;
//   to: string;
//   amount: string; // 큰 숫자는 문자열로 저장하는 것이 안전합니다.
//   hash: string;
//   success: boolean;
// }
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

export interface IEvent extends Document {
  blockNumber: number;
  blockNumberIDX: number;
  phaseExtrinsic: any;
  method: string;
  section: string;
  keyIDX: string;
  data: any;  // 이벤트 데이터는 구조가 다양할 수 있으므로 Object로 저장
  topic: any; // 데이터를 확인하지 못함. empty 로 저장
  timestamp: Date;
}

const EventSchema: Schema = new Schema({
  hash: { type: String, required: true, unique: true }, // 이벤트 해시는 유니크해야 함
  blockNumber: { type: Number, required: true },
  blockNumberIDX: { type: Number, required: true },
  phaseExtrinsic: { type: Object, required: true }, // phase는 구조가 다양할 수 있으므로 Object로 저장
  method: { type: String , required: true, index: true },
  section: { type: String , required: true, index: true },
  keyIDX: { type: String },
  data: { type: Object },  // 이벤트 데이터는 구조가 다양할 수 있으므로 Object로 저장
  topic: { type: Object }, // 이벤트 토픽은 구조가 다양할 수 있으므로 Object로 저장
  timestamp: { type: Date, default: Date.now, index: true }
});

// 이벤트는 블록 번호와 익스트린식 인덱스 조합으로 자주 조회될 것으로 예상되므로 복합 인덱스 추가
// EventSchema.index({ blockNumber: 1, blockNumberIDX: 1 }, { unique: true });

// ...existing code...
// 3. 몽고디비 모델 정의 (이미 존재하면 재사용)
export const XodeAsset = mongoose.models.XodeAsset || mongoose.model<IAsset>('Asset', AssetSchema);
export const XodeBlock = mongoose.models.XodeBlock || mongoose.model<IBlock>('Block', BlockSchema);
export const XodeTransaction = mongoose.models.XodeTransaction || mongoose.model<ITransaction>('Transaction', TransactionSchema);
export const XodeEvent = mongoose.models.XodeEvent || mongoose.model<IEvent>('Event', EventSchema);

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
  const MONGO_PORT = process.env.MONGO_PORT || '27017';
  const MONGO_URI = process.env.MONGO_URI || '127.0.0.1';
  const MONGO_USER = process.env.MONGO_USER || '';
  const MONGO_PASS = process.env.MONGO_PASS || '';
  const MONGO_DB_NAME = process.env.MONGO_DB_NAME || 'xode_indexer';
  // MongoDB 연결 URI (환경 변수에서 가져오거나 기본값 사용)
  // const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/xode_indexer';
  // const MONGO_DB_NAME = process.env.MONGO_DB_NAME || 'xode_indexer';

  const authPart = MONGO_USER && MONGO_PASS ? `${MONGO_USER}:${MONGO_PASS}@` : '';
  const connectionString = `mongodb://${authPart}${MONGO_URI.replace('mongodb://', '')}:${MONGO_PORT}/${MONGO_DB_NAME}`;

  console.log(chalk.cyan(`Connecting to MongoDB at ${connectionString}...`));
  try {
    await mongoose.connect(connectionString);
    console.log(chalk.green('Connected to MongoDB successfully!'));
    console.log(chalk.bgGreen.black('MONGO DB CONNECTED '));
  } catch (err) {
    console.error(chalk.red('MongoDB Connection Error:'), err);
    process.exit(1);
  }
};