import amqp, { Connection, Channel } from 'amqplib';
import * as dotenv from 'dotenv';

// .env 파일 로드
dotenv.config();

class RabbitMQClient {
  private static instance: RabbitMQClient;
  private connection?: any; // Connection 객체는 초기화 시 생성되므로 optional로 선언
  private channel?: any;    // Channel 객체도 optional로 선언

// 환경 변수에서 가져오기 (기본값 설정 가능)
  private readonly rabbitUrl: string = process.env.RABBITMQ_URL || 'amqp://localhost';
  private readonly exchangeName: string = process.env.RABBITMQ_EXCHANGE_NAME || 'default_fanout';

  private constructor() {}

  // 싱글톤 인스턴스 가져오기
  public static getInstance(): RabbitMQClient {
    if (!RabbitMQClient.instance) {
      RabbitMQClient.instance = new RabbitMQClient();
    }
    return RabbitMQClient.instance;
  }

  // 초기화: 앱 시작 시 한 번만 호출
  async initialize(exchangeName: string = this.exchangeName): Promise<void> {
    const url: string = this.rabbitUrl;
    
    this.connection = await amqp.connect(url);
    this.channel = await this.connection.createChannel();

    // Fanout Exchange 선언 (서버에 없으면 생성)
    await this.channel.assertExchange(exchangeName, 'fanout', { durable: false });
    console.log('[-] RabbitMQ Channel Initialized');
  }

  // 질문하신 핵심 부분: 외부에서 메시지만 보낼 때 사용
  public publish(message: string): boolean {
    if (!this.channel) {
      throw new Error('채널이 초기화되지 않았습니다. initialize()를 먼저 호출하세요.');
    }

    // Buffer 변환 및 발행 로직만 수행
    return this.channel.publish(
      this.exchangeName, 
      '', // fanout은 routing key가 필요 없음
      Buffer.from(message)
    );
  }
}

export const mqClient = RabbitMQClient.getInstance();