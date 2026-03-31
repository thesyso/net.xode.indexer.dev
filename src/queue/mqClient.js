"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.mqClient = void 0;
const amqplib_1 = __importDefault(require("amqplib"));
const dotenv = __importStar(require("dotenv"));
// .env 파일 로드
dotenv.config();
class RabbitMQClient {
    constructor() {
        // 환경 변수에서 가져오기 (기본값 설정 가능)
        this.rabbitUrl = process.env.RABBITMQ_URL || 'amqp://localhost';
        this.exchangeName = process.env.RABBITMQ_EXCHANGE_NAME || 'default_fanout';
    }
    // 싱글톤 인스턴스 가져오기
    static getInstance() {
        if (!RabbitMQClient.instance) {
            RabbitMQClient.instance = new RabbitMQClient();
        }
        return RabbitMQClient.instance;
    }
    // 초기화: 앱 시작 시 한 번만 호출
    async initialize(exchangeName = this.exchangeName) {
        const url = this.rabbitUrl;
        this.connection = await amqplib_1.default.connect(url);
        this.channel = await this.connection.createChannel();
        // Fanout Exchange 선언 (서버에 없으면 생성)
        await this.channel.assertExchange(exchangeName, 'fanout', { durable: false });
        console.log('[-] RabbitMQ Channel Initialized');
    }
    // 질문하신 핵심 부분: 외부에서 메시지만 보낼 때 사용
    publish(message) {
        if (!this.channel) {
            throw new Error('채널이 초기화되지 않았습니다. initialize()를 먼저 호출하세요.');
        }
        // Buffer 변환 및 발행 로직만 수행
        return this.channel.publish(this.exchangeName, '', // fanout은 routing key가 필요 없음
        Buffer.from(message));
    }
}
exports.mqClient = RabbitMQClient.getInstance();
