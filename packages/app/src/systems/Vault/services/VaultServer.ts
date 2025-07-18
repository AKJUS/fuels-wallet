// biome-ignore lint/style/useNodejsImportProtocol: <explanation>
import EventEmitter from 'events';
import { createProvider } from '@fuel-wallet/connections';
import {
  Address,
  type HashableMessage,
  Signer,
  WalletManager,
  arrayify,
  hashMessage,
  transactionRequestify,
} from 'fuels';
import { JSONRPCServer } from 'json-rpc-2.0';
import { IndexedDBStorage } from '~/systems/Account/utils/storage';

export type VaultAccount = {
  address: string;
  publicKey: string;
  vaultId: number;
};

export type VaultInputs = {
  createVault: {
    type: string;
    secret: string;
  };
  unlock: {
    password: string;
  };
  addAccount: {
    vaultId: number;
  };
  signTransaction: {
    transaction: string;
    address: string;
    providerUrl: string;
  };
  signMessage: {
    message: HashableMessage;
    address: string;
  };
  changePassword: {
    currentPassword: string;
    password: string;
  };
  exportVault: {
    vaultId: number;
    password: string;
  };
  exportPrivateKey: {
    address: string;
    password: string;
  };
};

export class VaultServer extends EventEmitter {
  readonly server: JSONRPCServer;
  manager: WalletManager;
  static readonly methods: Array<string> = [
    'isLocked',
    'unlock',
    'createVault',
    'getVaults',
    'getAccounts',
    'addAccount',
    'signMessage',
    'signTransaction',
    'changePassword',
    'exportVault',
    'exportPrivateKey',
    'lock',
    'clear',
  ];

  constructor() {
    super();
    const storage = new IndexedDBStorage();
    const manager = new WalletManager({ storage });
    this.manager = manager;
    this.server = new JSONRPCServer();
    this.setupMethods();
    this.setupEvents();
  }

  private setupEvents() {
    this.manager.on('lock', () => {
      this.emit('lock');
    });
    this.manager.on('unlock', () => {
      this.emit('unlock');
    });
  }

  setupMethods() {
    // biome-ignore lint/complexity/noForEach: <explanation>
    VaultServer.methods.forEach((methodName) => {
      if (!this[methodName]) {
        throw new Error('Method not exists!');
      }
      this.server.addMethod(methodName, this[methodName].bind(this));
    });
  }

  async createVault({
    type,
    secret,
  }: VaultInputs['createVault']): Promise<VaultAccount> {
    await this.manager.addVault({
      type,
      secret,
    });

    const [vaults, accounts] = await Promise.all([
      this.manager.getVaults(),
      this.manager.getAccounts(),
    ]);

    const [vault] = vaults.slice(-1);
    const [account] = accounts.slice(-1);

    return {
      address: account.address.toString(),
      publicKey: account.publicKey,
      vaultId: vault.vaultId,
    };
  }

  async getVaults() {
    return await this.manager.getVaults();
  }

  async isLocked(): Promise<boolean> {
    return this.manager.isLocked;
  }

  async unlock({ password }: VaultInputs['unlock']): Promise<void> {
    await this.manager.unlock(password);
  }

  async lock(): Promise<void> {
    await this.manager.lock();
  }

  async addAccount({
    vaultId,
  }: VaultInputs['addAccount']): Promise<VaultAccount> {
    const account = await this.manager.addAccount({ vaultId });
    return {
      address: account.address.toString(),
      publicKey: account.publicKey,
      vaultId: account.vaultId || 0,
    };
  }

  async getAccounts(): Promise<Array<VaultAccount>> {
    const accounts = await this.manager.getAccounts();
    return accounts.map((ac) => ({
      address: ac.address.toString(),
      publicKey: ac.publicKey,
      vaultId: ac.vaultId || 0,
    }));
  }

  async signTransaction({
    transaction,
    address,
    providerUrl,
  }: VaultInputs['signTransaction']): Promise<string> {
    const wallet = await this.manager.getWallet(
      Address.fromDynamicInput(address)
    );
    const transactionRequest = transactionRequestify(JSON.parse(transaction));
    const provider = await createProvider(providerUrl);
    wallet.connect(provider);
    const signature = await wallet.signTransaction(transactionRequest);
    return signature;
  }

  async signMessage({
    message,
    address,
  }: VaultInputs['signMessage']): Promise<string> {
    const wallet = await this.manager.getWallet(
      Address.fromDynamicInput(address)
    );
    let signature: string | undefined;
    if (typeof message === 'string') {
      signature = await wallet.signMessage(message);
    }
    if (
      typeof message === 'object' &&
      message.personalSign &&
      typeof message.personalSign === 'object'
    ) {
      const keys = Object.keys(message.personalSign);
      const signObj = message.personalSign as unknown as Record<string, number>;
      const orderedBytes = Uint8Array.from(
        keys.sort((a, b) => Number(a) - Number(b)).map((k) => signObj[k])
      );
      signature = await wallet.signMessage({ personalSign: orderedBytes });
    } else if (
      typeof message === 'object' &&
      message.personalSign &&
      typeof message.personalSign === 'string'
    ) {
      const bytes = message.personalSign.startsWith('0x')
        ? arrayify(message.personalSign)
        : new TextEncoder().encode(message.personalSign);
      signature = await wallet.signMessage({ personalSign: bytes });
    }

    if (!signature) {
      throw new Error('Invalid message');
    }

    return signature;
  }

  async changePassword({
    currentPassword,
    password,
  }: VaultInputs['changePassword']): Promise<void> {
    await this.manager.updatePassphrase(currentPassword, password);
  }

  async exportVault({
    vaultId,
    password,
  }: VaultInputs['exportVault']): Promise<string> {
    await this.manager.unlock(password);
    const vault = await this.manager.exportVault(vaultId);
    return vault.secret || '';
  }

  async exportPrivateKey({
    address,
    password,
  }: VaultInputs['exportPrivateKey']): Promise<string> {
    await this.manager.unlock(password);
    return this.manager.exportPrivateKey(Address.fromString(address));
  }

  async clear(): Promise<void> {
    const vaults = await this.manager.getVaults();
    for (const vault of vaults) {
      await this.manager.removeVault(vault.vaultId);
    }
  }

  async reload() {
    chrome.runtime.reload();
  }
}

export type VaultMethods = {
  [Method in keyof VaultServer]: VaultServer[Method];
};
