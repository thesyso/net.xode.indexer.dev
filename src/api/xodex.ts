import { ApiPromise, WsProvider } from '@polkadot/api';
import { Keyring } from '@polkadot/keyring';
import { cryptoWaitReady } from '@polkadot/util-crypto';

import { Option } from '@polkadot/types';
import { Codec } from '@polkadot/types/types';

// Define constants for asset locations and IDs
const NATIVE_DOT = { parents: 0, interior: 'Here' };
const ASSET_HUB = (id: number) => ({
  parents: 0, interior: { X2: [{ Parachain: 50 }, { GeneralKey: id.toString() }] }
});

//Your/Mnemonic/Seed
const MNEMONIC_SEED = '//Alice'; // Using Alice's account for testing purposes, replace with your own seed for production

export class XODEX {
  private api: ApiPromise;

  constructor(api: ApiPromise) {
    this.api = api;
  }

  async ischeckPools(assetA: number, assetB: number) {
    try {
      const pools = await this.api.query.assetConnect.pools.entries();

      const isExists = pools.some(([key, value]) => {
        const [poolId, poolInfo] = value.toJSON() as any;
        return (poolInfo.assetA === ASSET_HUB(assetA) && poolInfo.assetB === ASSET_HUB(assetB)) ||
          (poolInfo.assetA === ASSET_HUB(assetB) && poolInfo.assetB === ASSET_HUB(assetA));
      });

      return isExists;
    } catch (error) {
      console.error('Error checking XODEX pools:', error);
      throw error;
    }
  }

  // Get a list of all XODEX pools with their basic information
  async getPools() {
    try {
      const pools = await this.api.query.assetConnect.pools.entries();
      return pools.map(([key, value]) => {
        const [poolId, poolInfo] = value.toJSON() as any;
        return { poolId, ...poolInfo };
      });
    } catch (error) {
      console.error('Error fetching XODEX pools:', error);
      throw error;
    }
  }

  // Get detailed information about a specific XODEX pool by its ID
  async getPoolInfo(poolId: number) {
    try {
      const poolInfo = await this.api.query.assetConnect.poolInfos(poolId);
      return poolInfo.toJSON();
    } catch (error) {
      console.error(`Error fetching XODEX pool info for poolId ${poolId}:`, error);
      throw error;
    }
  }

  // Create a new XODEX pool with the specified assets and initial liquidity
  async createPool(poolId: number, assetA: number, assetB: number, initialLiquidity: number) {
    try {
      // ischeck
      const pools = await this.api.query.assetConnect.pools.entries();
      const isExists = pools.some(([key, value]) => {
        const [poolId, poolInfo] = value.toJSON() as any;
        return (poolInfo.assetA === ASSET_HUB(assetA) && poolInfo.assetB === ASSET_HUB(assetB)) ||
          (poolInfo.assetA === ASSET_HUB(assetB) && poolInfo.assetB === ASSET_HUB(assetA));
      });
      if (isExists) {
        console.log(`Pool ${assetA}-${assetB} already exists. Skipping creation.`);
        return null;
      }

      const keyring = new Keyring({ type: 'sr25519' });
      const signer = keyring.addFromUri(MNEMONIC_SEED);
      const tx = this.api.tx.assetConnect.createPool(poolId, ASSET_HUB(assetA), ASSET_HUB(assetB), initialLiquidity);
      const hash = await tx.signAndSend(signer);
      console.log('Transaction sent with hash:', hash.toHex());
      return hash.toHex();
    } catch (error) {
      console.error('Error creating XODEX pool:', error);
      throw error;
    }
  }

  // Add liquidity to an existing XODEX pool
  async addLiquidity(poolId: number, assetAAmount: number, assetBAmount: number) {
    try {
      const isExists = await this.api.query.assetConnect.pools(poolId) as Option<any>;
      if (!isExists.isSome) {
        console.log(`Pool with ID ${poolId} does not exist. Cannot add liquidity.`);
        return { hash: null, userPoolInfo: null, shareDetail: null };
      }

      const keyring = new Keyring({ type: 'sr25519' });
      const signer = keyring.addFromUri(MNEMONIC_SEED);
      const tx = this.api.tx.assetConnect.addLiquidity(poolId, assetAAmount, assetBAmount);

      // signAndSend를 Promise로 감싸서 완료될 때까지 기다립니다.
      const hash = await new Promise<string>((resolve, reject) => {
        tx.signAndSend(signer, ({ status, dispatchError }) => {
          if (status.isInBlock) {
            if (dispatchError) {
              reject(new Error('트랜잭션 실행 중 오류 발생'));
            } else {
              resolve(status.asInBlock.toHex());
            }
          }
        }).catch(reject);
      });

      // 4. [핵심] 사용자의 풀 참여 지분(LP 토큰) 확인 로직
      if(!hash) {
        console.error('트랜잭션 해시가 반환되지 않았습니다. 트랜잭션이 실패했을 수 있습니다.');
        return { hash: null, userPoolInfo: null, shareDetail: null };
      }

      const shareDetail = await this.getPoolParticipationDetails(signer.address, poolId);

      // poolId를 자산 ID로 사용하여 사용자의 LP 토큰 잔고를 조회합니다.
      const userPoolInfo = await this.getUserPoolParticipation(signer.address, poolId);

      return { hash, userPoolInfo, shareDetail };
    } catch (error) {
      console.error('Error adding liquidity to XODEX pool:', error);
      throw error;
    }
  }

  // Register a user to a pool by adding initial liquidity with the user's signer
  async registerUserToPool(userMnemonic: string, poolId: number, assetAAmount: number, assetBAmount: number) {
    try {
      const poolInfo = await this.api.query.assetConnect.poolInfos(poolId) as Option<any>;
      if (poolInfo.isNone) {
        throw new Error(`Pool with ID ${poolId} does not exist.`);
      }

      const keyring = new Keyring({ type: 'sr25519' });
      const signer = keyring.addFromUri(userMnemonic);

      const existingParticipation = await this.getPoolParticipationDetails(signer.address, poolId);
      if (existingParticipation.isParticipant) {
        console.log(`User ${signer.address} is already participating in pool ${poolId}.`);
      }

      const tx = this.api.tx.assetConnect.addLiquidity(poolId, assetAAmount, assetBAmount);
      const hash = await new Promise<string>((resolve, reject) => {
        tx.signAndSend(signer, ({ status, dispatchError }) => {
          if (status.isInBlock) {
            if (dispatchError) {
              reject(new Error('Error occurred while registering user to pool.'));
            } else {
              resolve(status.asInBlock.toHex());
            }
          }
        }).catch(reject);
      });

      const shareDetail = await this.getPoolParticipationDetails(signer.address, poolId);
      const userPoolInfo = await this.getUserPoolParticipation(signer.address, poolId);

      return { hash, userPoolInfo, shareDetail };
    } catch (error) {
      console.error('Error registering user to XODEX pool:', error);
      throw error;
    }
  }

  async getUserPoolParticipation(userAddress: string, poolId: number) {
    try {
      // poolId를 자산 ID로 사용하여 사용자의 LP 토큰 잔고를 조회합니다.
      const lpTokenBalance = await this.api.query.assets.account(poolId, userAddress) as Option<Codec>;
      return lpTokenBalance.toJSON();
    } catch (error) {
      console.error(`Error fetching user pool participation for address ${userAddress} and poolId ${poolId}:`, error);
      throw error;
    }
  }

  /**
   * 사용자의 풀 참여 상세 정보 조회 (지분율 포함)
   * @param userAddress 사용자의 지갑 주소
   * @param poolId 풀 ID (보통 LP 토큰의 Asset ID와 동일하거나 연관됨)
   */
  async getPoolParticipationDetails(userAddress: string, poolId: number) {
    try {
      // 1. 사용자의 LP 토큰 잔고 조회
      // assetConnect에서 생성된 LP 토큰은 보통 일반 Asset 시스템을 따릅니다.
      const accountInfo = await this.api.query.assets.account(poolId, userAddress) as Option<any>;

      if (accountInfo.isNone) {
        return {
          isParticipant: false,
          balance: "0",
          sharePercentage: "0"
        };
      }

      // 사용자의 LP 잔고 (Raw Unit)
      const userLpBalance = accountInfo.unwrap().balance.toBigInt();

      // 2. LP 토큰의 전체 발행량(Total Issuance) 조회
      // 전체 대비 내 지분율을 계산하기 위해 필요합니다.
      const assetDetails = await this.api.query.assets.asset(poolId) as Option<any>;

      let sharePercentage = "0";
      if (assetDetails.isSome) {
        const totalIssuance = assetDetails.unwrap().supply.toBigInt();

        if (totalIssuance > 0n) {
          // 지분율 계산 (소수점 2자리까지 표기하기 위해 10000 곱한 후 나누기)
          const percentage = (userLpBalance * 10000n) / totalIssuance;
          sharePercentage = (Number(percentage) / 100).toFixed(2);
        }
      }

      return {
        isParticipant: true,
        lpTokenId: poolId,
        balance: userLpBalance.toString(), // 사용자가 보유한 LP 토큰 양
        sharePercentage: `${sharePercentage}%` // 전체 풀에서의 지분율
      };

    } catch (error) {
      console.error('풀 참여 정보 조회 실패:', error);
      throw error;
    }
  }
}


