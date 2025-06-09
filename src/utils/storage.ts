/**
 * 存储工具
 * 通过条件编译为不同环境提供适合的存储实现
 */

import { IStorage } from '../adapters/interfaces';
import { BrowserStorage } from '../adapters/storage/BrowserStorage';
import { MiniProgramStorage } from '../adapters/storage/MiniProgramStorage';

// 根据不同环境导出对应的存储实现
let storage: IStorage;

/* #if TARGET=browser */
storage = new BrowserStorage();
/* #endif */

/* #if TARGET=wechat */
storage = new MiniProgramStorage('wechat');
/* #endif */

/* #if TARGET=alipay */
storage = new MiniProgramStorage('alipay');
/* #endif */

/* #if TARGET=bytedance */
storage = new MiniProgramStorage('bytedance');
/* #endif */

/* #if TARGET=baidu */
storage = new MiniProgramStorage('baidu');
/* #endif */

/* #if TARGET=taro */
storage = new MiniProgramStorage('taro');
/* #endif */

/* #if TARGET=uni-app */
storage = new MiniProgramStorage('uni-app');
/* #endif */

export { storage };
