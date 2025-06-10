/**
 * 适配器模块导出
 * 提供各种环境的适配器实现
 */

// 导入具体适配器实现
import AlipayAdapter from './AlipayAdapter';
import BaiduAdapter from './BaiduAdapter';
import { BaseMiniProgramAdapter, BaseMiniProgramAdapterOptions } from './base';
import BrowserAdapter from './BrowserAdapter';
import BytedanceAdapter from './BytedanceAdapter';
import {
  IAdapter,
  AbstractAdapter,
  IAdapterOptions,
  FileInfo,
  IStorage,
  IResponse,
  RequestOptions,
} from './interfaces';
import { IndexedDBAdapter } from './IndexedDBAdapter';
import { NodeAdapter } from './NodeAdapter';
import { ReactNativeAdapter } from './ReactNativeAdapter';
import { BrowserStorage } from './storage/BrowserStorage';
import { MiniProgramStorage } from './storage/MiniProgramStorage';
import { NodeStorage } from './storage/NodeStorage';
import TaroAdapter from './TaroAdapter';
import UniAppAdapter from './UniAppAdapter';
import WechatAdapter from './WechatAdapter';

// 导入接口和基础类

// 导出具体适配器
export {
  // 具体适配器实现
  BrowserAdapter,
  WechatAdapter,
  AlipayAdapter,
  BytedanceAdapter,
  BaiduAdapter,
  TaroAdapter,
  UniAppAdapter,
  ReactNativeAdapter,
  NodeAdapter,
  IndexedDBAdapter,

  // 接口和基础类
  IAdapter,
  AbstractAdapter,
  IAdapterOptions,
  BaseMiniProgramAdapter,
  BaseMiniProgramAdapterOptions,

  // 类型定义
  FileInfo,
  IStorage,
  IResponse,
  RequestOptions,

  // 存储适配器
  BrowserStorage,
  MiniProgramStorage,
  NodeStorage,
};

// 默认导出
export default {
  BrowserAdapter,
  WechatAdapter,
  AlipayAdapter,
  BytedanceAdapter,
  BaiduAdapter,
  TaroAdapter,
  UniAppAdapter,
  ReactNativeAdapter,
  NodeAdapter,
  IndexedDBAdapter,

  // 基础适配器
  BaseMiniProgramAdapter,

  // 存储适配器
  BrowserStorage,
  MiniProgramStorage,
  NodeStorage,
};
