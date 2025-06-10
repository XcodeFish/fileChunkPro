/* eslint-disable @typescript-eslint/no-unused-vars */
/**
 * DependencyContainer - 依赖注入容器
 * 提供依赖注册和解析功能
 */

/**
 * 依赖项注册配置
 */
interface RegistrationOptions {
  /**
   * 依赖项生命周期
   * - singleton: 单例，每次解析返回相同实例
   * - transient: 临时，每次解析创建新实例
   * - scoped: 作用域，在同一个作用域内返回相同实例
   */
  lifetime: 'singleton' | 'transient' | 'scoped';

  /**
   * 依赖项标签，用于分组和查询
   */
  tags?: string[];
}

/**
 * 依赖项工厂函数
 */
type Factory<T = unknown> = (container: DependencyContainer) => T;

/**
 * 依赖项解析器
 */
interface Resolver<T = unknown> {
  /**
   * 解析依赖项
   * @param container 容器实例
   * @returns 解析后的实例
   */
  resolve(container: DependencyContainer): T;
}

/**
 * 单例依赖项解析器
 */
class SingletonResolver<T> implements Resolver<T> {
  private instance: T | null = null;

  constructor(private factory: Factory<T>) {}

  resolve(container: DependencyContainer): T {
    if (this.instance === null) {
      this.instance = this.factory(container);
    }
    return this.instance;
  }
}

/**
 * 临时依赖项解析器
 */
class TransientResolver<T> implements Resolver<T> {
  constructor(private factory: Factory<T>) {}

  resolve(container: DependencyContainer): T {
    return this.factory(container);
  }
}

/**
 * 作用域依赖项解析器
 */
class ScopedResolver<T> implements Resolver<T> {
  private instances = new Map<string, T>();

  constructor(private factory: Factory<T>) {}

  resolve(container: DependencyContainer): T {
    const scopeId = container.currentScopeId;

    if (!this.instances.has(scopeId)) {
      this.instances.set(scopeId, this.factory(container));
    }

    return this.instances.get(scopeId)!;
  }
}

/**
 * 注册项信息
 */
interface Registration {
  /**
   * 解析器
   */
  resolver: Resolver;

  /**
   * 标签
   */
  tags: Set<string>;
}

/**
 * 依赖注入容器
 */
export class DependencyContainer {
  /**
   * 注册表
   */
  private registrations = new Map<string, Registration>();

  /**
   * 别名映射
   */
  private aliases = new Map<string, string>();

  /**
   * 当前作用域ID
   */
  public currentScopeId = 'default';

  /**
   * 父容器
   */
  private parent: DependencyContainer | null = null;

  /**
   * 创建一个新的依赖容器
   * @param parent 可选的父容器
   */
  constructor(parent: DependencyContainer | null = null) {
    this.parent = parent;
  }

  /**
   * 注册一个工厂函数
   * @param token 依赖项标识
   * @param factory 工厂函数
   * @param options 注册选项
   */
  register<T>(
    token: string,
    factory: Factory<T>,
    options: Partial<RegistrationOptions> = {}
  ): this {
    const opts: RegistrationOptions = {
      lifetime: options.lifetime || 'singleton',
      tags: options.tags || [],
    };

    let resolver: Resolver<T>;

    switch (opts.lifetime) {
      case 'singleton':
        resolver = new SingletonResolver<T>(factory);
        break;
      case 'transient':
        resolver = new TransientResolver<T>(factory);
        break;
      case 'scoped':
        resolver = new ScopedResolver<T>(factory);
        break;
      default:
        throw new Error(`不支持的生命周期: ${opts.lifetime}`);
    }

    this.registrations.set(token, {
      resolver,
      tags: new Set(opts.tags),
    });

    return this;
  }

  /**
   * 注册一个具体的实例
   * @param token 依赖项标识
   * @param instance 实例
   * @param tags 标签
   */
  registerInstance<T>(token: string, instance: T, tags: string[] = []): this {
    return this.register(token, () => instance, {
      lifetime: 'singleton',
      tags,
    });
  }

  /**
   * 注册一个类
   * @param token 依赖项标识
   * @param ctor 构造函数
   * @param options 注册选项
   */
  registerClass<T>(
    token: string,
    ctor: new (...args: any[]) => T,
    options: Partial<RegistrationOptions> = {}
  ): this {
    return this.register(token, c => new ctor(), options);
  }

  /**
   * 创建别名
   * @param aliasToken 别名标识
   * @param originalToken 原始标识
   */
  alias(aliasToken: string, originalToken: string): this {
    this.aliases.set(aliasToken, originalToken);
    return this;
  }

  /**
   * 解析依赖
   * @param token 依赖标识
   * @returns 解析后的实例
   * @throws 如果无法解析依赖
   */
  resolve<T>(token: string): T {
    // 处理别名
    const resolvedToken = this.aliases.get(token) || token;

    // 在当前容器中查找
    const registration = this.registrations.get(resolvedToken);
    if (registration) {
      return registration.resolver.resolve(this) as T;
    }

    // 在父容器中查找
    if (this.parent) {
      return this.parent.resolve<T>(resolvedToken);
    }

    throw new Error(`无法解析依赖: ${token}`);
  }

  /**
   * 安全地解析依赖，不存在则返回null
   * @param token 依赖标识
   * @returns 解析后的实例或null
   */
  tryResolve<T>(token: string): T | null {
    try {
      return this.resolve<T>(token);
    } catch {
      return null;
    }
  }

  /**
   * 解析所有带有特定标签的依赖
   * @param tag 标签
   * @returns 解析后的实例数组
   */
  resolveAll<T>(tag: string): T[] {
    const results: T[] = [];

    // 收集当前容器中的匹配项
    for (const [token, registration] of this.registrations.entries()) {
      if (registration.tags.has(tag)) {
        results.push(this.resolve<T>(token));
      }
    }

    // 收集父容器中的匹配项
    if (this.parent) {
      results.push(...this.parent.resolveAll<T>(tag));
    }

    return results;
  }

  /**
   * 检查是否已注册依赖
   * @param token 依赖标识
   * @returns 是否已注册
   */
  has(token: string): boolean {
    // 处理别名
    const resolvedToken = this.aliases.get(token) || token;

    // 在当前容器中查找
    if (this.registrations.has(resolvedToken)) {
      return true;
    }

    // 在父容器中查找
    return this.parent ? this.parent.has(resolvedToken) : false;
  }

  /**
   * 移除依赖注册
   * @param token 依赖标识
   * @returns 是否移除成功
   */
  remove(token: string): boolean {
    // 处理别名
    const resolvedToken = this.aliases.get(token) || token;

    // 移除主注册
    const removed = this.registrations.delete(resolvedToken);

    // 移除指向该令牌的所有别名
    for (const [alias, target] of this.aliases.entries()) {
      if (target === resolvedToken) {
        this.aliases.delete(alias);
      }
    }

    return removed;
  }

  /**
   * 获取所有注册的令牌
   * @returns 令牌数组
   */
  getRegisteredTokens(): string[] {
    return Array.from(this.registrations.keys());
  }

  /**
   * 创建一个新的作用域
   * @param scopeId 作用域ID，默认自动生成
   * @returns 新的依赖容器，共享相同的单例，但有独立的作用域
   */
  createScope(
    scopeId = `scope_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  ): DependencyContainer {
    const childContainer = new DependencyContainer(this);
    childContainer.currentScopeId = scopeId;
    return childContainer;
  }

  /**
   * 清空所有注册
   */
  clear(): void {
    this.registrations.clear();
    this.aliases.clear();
  }
}

// 导出默认实例
export default DependencyContainer;
