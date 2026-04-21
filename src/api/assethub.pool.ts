import { ApiPromise, WsProvider } from '@polkadot/api';
import { Keyring } from '@polkadot/keyring';
import { cryptoWaitReady } from '@polkadot/util-crypto';

// This class provides an interface to interact with the AssetHub pallet's pool functionalities
export class AssetHubPool {
  private api: ApiPromise;

  constructor(api: ApiPromise) {
    this.api = api;
  }

  // Get a list of all pools with their basic information
  async getPools() {
    try {
      const pools = await this.api.query.assetHub.pools.entries();
      return pools.map(([key, value]) => ({ key: key.toString(), value: value.toJSON() }));
    } catch (error) {
      console.error('Error fetching pools:', error);
      throw error;
    }
  }

  // Get detailed information about a specific pool by its ID
  async getPoolInfo(poolId: number) {
    try {
      const poolInfo = await this.api.query.assetHub.poolInfos(poolId);
      return poolInfo.toJSON();
    } catch (error) {
      console.error(`Error fetching pool info for poolId ${poolId}:`, error);
      throw error;
    }
  }

  // Create a new pool with given parameters
  async createPool(poolId: number, assetA: number, assetB: number, initialLiquidity: number, signer: any) {
    try {
      const tx = this.api.tx.assetHub.createPool(poolId, assetA, assetB, initialLiquidity);
      const hash = await tx.signAndSend(signer);
      console.log('Transaction sent with hash:', hash.toHex());
      return hash.toHex();
    } catch (error) {
      console.error('Error creating pool:', error);
      throw error;
    }
  }

  // Add liquidity to a given pool
  async addLiquidity(poolId: number, assetAAmount: number, assetBAmount: number, signer: any) {
    try {
      const tx = this.api.tx.assetHub.addLiquidity(poolId, assetAAmount, assetBAmount);
      const hash = await tx.signAndSend(signer);
      console.log('Transaction sent with hash:', hash.toHex());
      return hash.toHex();
    } catch (error) {
      console.error('Error adding liquidity:', error);
      throw error;
    }
  }

  // Remove liquidity from a given pool
  async removeLiquidity(poolId: number, liquidityAmount: number, signer: any) {
    try {
      const tx = this.api.tx.assetHub.removeLiquidity(poolId, liquidityAmount);
      const hash = await tx.signAndSend(signer);
      console.log('Transaction sent with hash:', hash.toHex());
      return hash.toHex();
    } catch (error) {
      console.error('Error removing liquidity:', error);
      throw error;
    }
  }

  // Perform a swap between two assets in a given pool
  async swap(poolId: number, assetIn: number, assetOut: number, amountIn: number, minAmountOut: number, signer: any) {
    try {
      const tx = this.api.tx.assetHub.swap(poolId, assetIn, assetOut, amountIn, minAmountOut);
      const hash = await tx.signAndSend(signer);
      console.log('Transaction sent with hash:', hash.toHex());
      return hash.toHex();
    } catch (error) {
      console.error('Error performing swap:', error);
      throw error;
    }
  }

  // Get the current liquidity for a given user in a specific pool
  async getUserLiquidity(poolId: number, userAddress: string) {
    try {
      const liquidity = await this.api.query.assetHub.userLiquidity(poolId, userAddress);
      return liquidity.toJSON();
    } catch (error) {
      console.error(`Error fetching user liquidity for poolId ${poolId} and user ${userAddress}:`, error);
      throw error;
    }
  }

  // Get the swap history for a given user in a specific pool
  async getUserSwaps(poolId: number, userAddress: string) {
    try {
      const swaps = await this.api.query.assetHub.userSwaps(poolId, userAddress);
      return swaps.toJSON();
    } catch (error) {
      console.error(`Error fetching user swaps for poolId ${poolId} and user ${userAddress}:`, error);
      throw error;
    }
  }

  // Get the earnings for a given user in a specific pool
  async getUserEarnings(poolId: number, userAddress: string) {
    try {
      const earnings = await this.api.query.assetHub.userEarnings(poolId, userAddress);
      return earnings.toJSON();
    } catch (error) {
      console.error(`Error fetching user earnings for poolId ${poolId} and user ${userAddress}:`, error);
      throw error;
    }
  }

  // Get the current reserves for a given pool
  async getPoolReserves(poolId: number) {
    try {
      const reserves = await this.api.query.assetHub.poolReserves(poolId);
      return reserves.toJSON();
    } catch (error) {
      console.error(`Error fetching pool reserves for poolId ${poolId}:`, error);
      throw error;
    }
  }

  // Get the current fees for a given pool
  async getPoolFees(poolId: number) {
    try {
      const fees = await this.api.query.assetHub.poolFees(poolId);
      return fees.toJSON();
    } catch (error) {
      console.error(`Error fetching pool fees for poolId ${poolId}:`, error);
      throw error;
    }
  }

  // Get the total trading volume for a given pool
  async getPoolVolume(poolId: number) {
    try {
      const volume = await this.api.query.assetHub.poolVolume(poolId);
      return volume.toJSON();
    } catch (error) {
      console.error(`Error fetching pool volume for poolId ${poolId}:`, error);
      throw error;
    }
  }

  // Get the total value locked (TVL) for a given pool
  async getPoolTVL(poolId: number) {
    try {
      const tvl = await this.api.query.assetHub.poolTVL(poolId);
      return tvl.toJSON();
    } catch (error) {
      console.error(`Error fetching pool TVL for poolId ${poolId}:`, error);
      throw error;
    }
  }

  // Get the current APY for a given pool
  async getPoolAPY(poolId: number) {
    try {
      const apy = await this.api.query.assetHub.poolAPY(poolId);
      return apy.toJSON();
    } catch (error) {
      console.error(`Error fetching pool APY for poolId ${poolId}:`, error);
      throw error;
    }
  }

  // Get the current utilization of a given pool
  async getPoolUtilization(poolId: number) {
    try {
      const utilization = await this.api.query.assetHub.poolUtilization(poolId);
      return utilization.toJSON();
    } catch (error) {
      console.error(`Error fetching pool utilization for poolId ${poolId}:`, error);
      throw error;
    }
  }

  // Get the minimum liquidity required for a given pool
  async getMinimumLiquidity(poolId: number) {
    try {
      const minimumLiquidity = await this.api.query.assetHub.minimumLiquidity(poolId);
      return minimumLiquidity.toJSON();
    } catch (error) {
      console.error(`Error fetching minimum liquidity for poolId ${poolId}:`, error);
      throw error;
    }
  }

  // Get the minimum asset amount required for a given pool
  async getMinimumAssetAmount(poolId: number) {
    try {
      const minimumAssetAmount = await this.api.query.assetHub.minimumAssetAmount(poolId);
      return minimumAssetAmount.toJSON();
    } catch (error) {
      console.error(`Error fetching minimum asset amount for poolId ${poolId}:`, error);
      throw error;
    }
  }
};



