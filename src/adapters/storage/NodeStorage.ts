/**
 * NodeStorage 实现
 * 基于 Node.js 文件系统的存储提供者
 */

import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';

import { Logger } from '../../utils/Logger';
import { IStorage } from '../interfaces';

// 封装为 Promise 的文件系统 API
const readFileAsync = promisify(fs.readFile);
const writeFileAsync = promisify(fs.writeFile);
const unlinkAsync = promisify(fs.unlink);
const mkdirAsync = promisify(fs.mkdir);
const readdirAsync = promisify(fs.readdir);
const accessAsync = promisify(fs.access);

/**
 * Node.js 环境下的存储提供者
 * 使用文件系统实现持久化存储
 */
export class NodeStorage implements IStorage {
  private logger: Logger;
  private storagePath: string;
  private isStorageAvailable = false;

  /**
   * 构造函数
   * @param storagePath 存储目录路径，默认为 'storage' 子目录
   */
  constructor(storagePath?: string) {
    this.logger = new Logger('NodeStorage');
    this.storagePath = storagePath || path.join(process.cwd(), 'storage');

    // 初始化存储目录
    this.initializeStorage();
  }

  /**
   * 初始化存储目录
   */
  private async initializeStorage(): Promise<void> {
    try {
      try {
        await accessAsync(this.storagePath, fs.constants.F_OK);
      } catch (error) {
        // 目录不存在，创建它
        await mkdirAsync(this.storagePath, { recursive: true });
        this.logger.info(`已创建存储目录: ${this.storagePath}`);
      }

      // 验证目录可写
      const testFile = path.join(this.storagePath, '.test-write');
      await writeFileAsync(testFile, 'test');
      await unlinkAsync(testFile);

      this.isStorageAvailable = true;
      this.logger.info(`NodeStorage 初始化成功，存储路径: ${this.storagePath}`);
    } catch (error) {
      this.isStorageAvailable = false;
      this.logger.error(`NodeStorage 初始化失败: ${(error as Error).message}`);
    }
  }

  /**
   * 获取存储项
   * @param key 键名
   * @returns 值或 null
   */
  async getItem(key: string): Promise<string | null> {
    try {
      const filePath = this.getFilePath(key);
      const data = await readFileAsync(filePath, { encoding: 'utf-8' });
      return data;
    } catch (error) {
      // 文件不存在或读取错误时返回 null
      return null;
    }
  }

  /**
   * 设置存储项
   * @param key 键名
   * @param value 值
   */
  async setItem(key: string, value: string): Promise<void> {
    try {
      const filePath = this.getFilePath(key);
      await writeFileAsync(filePath, value, { encoding: 'utf-8' });
    } catch (error) {
      this.logger.error(`无法设置存储项 ${key}: ${(error as Error).message}`);
      throw new Error(`存储项设置失败: ${(error as Error).message}`);
    }
  }

  /**
   * 删除存储项
   * @param key 键名
   */
  async removeItem(key: string): Promise<void> {
    try {
      const filePath = this.getFilePath(key);

      // 检查文件是否存在
      try {
        await accessAsync(filePath, fs.constants.F_OK);
        await unlinkAsync(filePath);
      } catch (error) {
        // 文件不存在，忽略错误
      }
    } catch (error) {
      this.logger.error(`删除存储项 ${key} 失败: ${(error as Error).message}`);
    }
  }

  /**
   * 清空所有存储项
   */
  async clear(): Promise<void> {
    try {
      const files = await readdirAsync(this.storagePath);

      for (const file of files) {
        // 跳过隐藏文件和目录
        if (file.startsWith('.')) {
          continue;
        }

        try {
          await unlinkAsync(path.join(this.storagePath, file));
        } catch (error) {
          this.logger.warn(
            `删除文件 ${file} 失败: ${(error as Error).message}`
          );
        }
      }
    } catch (error) {
      this.logger.error(`清空存储失败: ${(error as Error).message}`);
      throw new Error(`清空存储失败: ${(error as Error).message}`);
    }
  }

  /**
   * 获取所有键名
   * @returns 键名数组
   */
  async keys(): Promise<string[]> {
    try {
      const files = await readdirAsync(this.storagePath);

      // 过滤隐藏文件和目录
      return files
        .filter(file => !file.startsWith('.'))
        .map(file => this.decodeKeyFromFilename(file));
    } catch (error) {
      this.logger.error(`获取存储键失败: ${(error as Error).message}`);
      return [];
    }
  }

  /**
   * 检查存储是否可用
   * @returns 是否可用
   */
  isAvailable(): boolean {
    return this.isStorageAvailable;
  }

  /**
   * 获取存储项（别名）
   * @param key 键名
   * @returns 值或 null
   */
  async get(key: string): Promise<string | null> {
    return this.getItem(key);
  }

  /**
   * 设置存储项（别名）
   * @param key 键名
   * @param value 值
   */
  async set(key: string, value: string): Promise<void> {
    return this.setItem(key, value);
  }

  /**
   * 删除存储项（别名）
   * @param key 键名
   */
  async remove(key: string): Promise<void> {
    return this.removeItem(key);
  }

  /**
   * 获取键对应的文件路径
   * @param key 键名
   * @returns 文件路径
   */
  private getFilePath(key: string): string {
    const filename = this.encodeKeyToFilename(key);
    return path.join(this.storagePath, filename);
  }

  /**
   * 将键名编码为文件名
   * 确保键名安全，避免路径遍历等问题
   * @param key 键名
   * @returns 安全的文件名
   */
  private encodeKeyToFilename(key: string): string {
    // 使用 base64 编码 + 安全字符替换
    const base64 = Buffer.from(key).toString('base64');
    // 替换不安全字符 (/ 和 +)
    return base64.replace(/\//g, '_').replace(/\+/g, '-');
  }

  /**
   * 将文件名解码为键名
   * @param filename 文件名
   * @returns 原始键名
   */
  private decodeKeyFromFilename(filename: string): string {
    // 还原安全字符替换
    const base64 = filename.replace(/_/g, '/').replace(/-/g, '+');
    return Buffer.from(base64, 'base64').toString();
  }
}
