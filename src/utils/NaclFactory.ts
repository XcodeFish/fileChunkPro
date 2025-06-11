/**
 * NaclFactory
 * 提供TweetNaCl.js加密库的工厂类，用于延迟加载和实例化
 */

// 定义nacl接口，包含我们需要使用的方法
interface NaclInterface {
  crypto_secretbox: (
    msg: Uint8Array,
    nonce: Uint8Array,
    key: Uint8Array
  ) => Uint8Array;
  crypto_secretbox_open: (
    box: Uint8Array,
    nonce: Uint8Array,
    key: Uint8Array
  ) => Uint8Array | null;
  crypto_box_keypair: () => { publicKey: Uint8Array; secretKey: Uint8Array };
  crypto_box: (
    msg: Uint8Array,
    nonce: Uint8Array,
    publicKey: Uint8Array,
    secretKey: Uint8Array
  ) => Uint8Array;
  crypto_box_open: (
    box: Uint8Array,
    nonce: Uint8Array,
    publicKey: Uint8Array,
    secretKey: Uint8Array
  ) => Uint8Array | null;
  crypto_hash: (msg: Uint8Array) => Uint8Array;
  crypto_sign_keypair: () => { publicKey: Uint8Array; secretKey: Uint8Array };
  crypto_sign: (msg: Uint8Array, secretKey: Uint8Array) => Uint8Array;
  crypto_sign_open: (
    signedMsg: Uint8Array,
    publicKey: Uint8Array
  ) => Uint8Array | null;
  randombytes: (length: number) => Uint8Array;
}

/**
 * TweetNaCl.js 工厂类
 * 使用延迟加载模式，仅在需要时才加载TweetNaCl.js库
 */
class NaclFactory {
  private naclInstance: NaclInterface | null = null;
  private loadPromise: Promise<NaclInterface> | null = null;

  /**
   * 获取或创建TweetNaCl.js实例
   * 使用延迟加载和单例模式
   * @returns NaCl库实例
   */
  public async instantiate(): Promise<NaclInterface> {
    // 如果已有实例，直接返回
    if (this.naclInstance) {
      return this.naclInstance;
    }

    // 如果正在加载中，等待加载完成
    if (this.loadPromise) {
      return this.loadPromise;
    }

    // 开始加载TweetNaCl.js
    this.loadPromise = this.loadNaclLibrary();

    try {
      this.naclInstance = await this.loadPromise;
      return this.naclInstance;
    } catch (error) {
      this.loadPromise = null;
      throw new Error(`无法加载TweetNaCl.js库: ${(error as Error).message}`);
    }
  }

  /**
   * 动态加载TweetNaCl.js库
   * @returns 加载并初始化的NaCl实例
   */
  private async loadNaclLibrary(): Promise<NaclInterface> {
    try {
      // 使用动态导入加载库 (需要webpack或类似工具支持)
      // 在实际应用中，你需要先添加TweetNaCl.js到项目依赖：
      // npm install tweetnacl
      const tweetnacl = await import('tweetnacl');

      // 创建包装接口
      const naclWrapper: NaclInterface = {
        crypto_secretbox: (msg, nonce, key) =>
          tweetnacl.secretbox(msg, nonce, key),
        crypto_secretbox_open: (box, nonce, key) =>
          tweetnacl.secretbox.open(box, nonce, key),
        crypto_box_keypair: () => {
          const keypair = tweetnacl.box.keyPair();
          return { publicKey: keypair.publicKey, secretKey: keypair.secretKey };
        },
        crypto_box: (msg, nonce, publicKey, secretKey) =>
          tweetnacl.box(msg, nonce, publicKey, secretKey),
        crypto_box_open: (box, nonce, publicKey, secretKey) =>
          tweetnacl.box.open(box, nonce, publicKey, secretKey),
        crypto_hash: msg => tweetnacl.hash(msg),
        crypto_sign_keypair: () => {
          const keypair = tweetnacl.sign.keyPair();
          return { publicKey: keypair.publicKey, secretKey: keypair.secretKey };
        },
        crypto_sign: (msg, secretKey) => tweetnacl.sign(msg, secretKey),
        crypto_sign_open: (signedMsg, publicKey) =>
          tweetnacl.sign.open(signedMsg, publicKey),
        randombytes: length => tweetnacl.randomBytes(length),
      };

      return naclWrapper;
    } catch (error) {
      console.error('加载TweetNaCl.js库失败:', error);

      // 降级处理：如果无法加载库，返回一个模拟实现，使用WebCrypto API
      // 注意：这只提供有限的功能，主要是为了避免运行时错误
      return this.createFallbackImplementation();
    }
  }

  /**
   * 创建降级实现，当无法加载TweetNaCl.js时使用
   * @returns 模拟NaCl接口的对象
   */
  private createFallbackImplementation(): NaclInterface {
    console.warn('使用WebCrypto API模拟TweetNaCl.js功能（部分功能可能不可用）');

    return {
      crypto_secretbox: async (msg, nonce, key) => {
        try {
          // 使用AES-GCM作为替代
          const cryptoKey = await window.crypto.subtle.importKey(
            'raw',
            key.slice(0, 32),
            { name: 'AES-GCM' },
            false,
            ['encrypt']
          );
          const encrypted = await window.crypto.subtle.encrypt(
            { name: 'AES-GCM', iv: nonce.slice(0, 12) },
            cryptoKey,
            msg
          );
          return new Uint8Array(encrypted);
        } catch (e) {
          console.error('Fallback加密失败:', e);
          throw new Error('Fallback加密不可用');
        }
      },

      crypto_secretbox_open: async (box, nonce, key) => {
        try {
          const cryptoKey = await window.crypto.subtle.importKey(
            'raw',
            key.slice(0, 32),
            { name: 'AES-GCM' },
            false,
            ['decrypt']
          );
          const decrypted = await window.crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: nonce.slice(0, 12) },
            cryptoKey,
            box
          );
          return new Uint8Array(decrypted);
        } catch (e) {
          console.error('Fallback解密失败:', e);
          return null; // 解密失败返回null，与TweetNaCl.js行为一致
        }
      },

      // 其他函数的简单降级实现
      crypto_box_keypair: () => {
        throw new Error('crypto_box_keypair在降级模式下不可用');
      },

      crypto_box: () => {
        throw new Error('crypto_box在降级模式下不可用');
      },

      crypto_box_open: () => {
        throw new Error('crypto_box_open在降级模式下不可用');
        return null;
      },

      crypto_hash: async msg => {
        const hash = await window.crypto.subtle.digest('SHA-512', msg);
        return new Uint8Array(hash);
      },

      crypto_sign_keypair: () => {
        throw new Error('crypto_sign_keypair在降级模式下不可用');
      },

      crypto_sign: () => {
        throw new Error('crypto_sign在降级模式下不可用');
      },

      crypto_sign_open: () => {
        throw new Error('crypto_sign_open在降级模式下不可用');
        return null;
      },

      randombytes: length => {
        return window.crypto.getRandomValues(new Uint8Array(length));
      },
    } as unknown as NaclInterface;
  }
}

// 导出单例实例
export const nacl_factory = new NaclFactory();
