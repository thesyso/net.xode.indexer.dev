import { ApiPromise, WsProvider } from '@polkadot/api';
import { Keyring } from '@polkadot/keyring';
import { cryptoWaitReady } from '@polkadot/util-crypto';

export class AssetHub {
  private api: ApiPromise;

  constructor(api: ApiPromise) {
    this.api = api;
  }

  // Get the minimum balance required for a new account or for a specific asset
  async getMinimumBalance(assetId: number) {
    try {
      
      // const minBalance = await this.api.query.assetHub.minimumBalance(assetId);
      const minBalance = await this.api.consts.balances.existentialDeposit.toNumber();
      return minBalance;
    } catch (error) {
      console.error(`Error fetching minimum balance for assetId ${assetId}:`, error);
      throw error;
    }
  }
}