'use strict'

// 导入模块包
import Stream from 'stream';
import http from 'http';
import Emmiter from 'events';
import { AsyncLocalStorage } from 'async_hooks';
// import { request, } from 'node:http';

/**
 * 应用基类基于Emmiter,驱动模型
 */
export default class Application extends Emmiter {
  private options: AppOptions;
  private context: Context;
  private request: Request = Object.create(null);
  private response: Response = Object.create(null);
  private middleware: Middleware[] = [];
  private ctxStorage: AsyncLocalStorage<Context> | null = null;

  constructor(options: AppOptions) {
    super();
    this.options = options;
    this.context = Object.create(null);
    this.request = Object.create(null);
    this.response = Object.create(null);
  }

  /**
   * listen监听, run一个服务
   */
  listen(...args: any[]) {
    const server = http.createServer(this.callback());
    return server.listen(...args);
  }

  /**
   * 执行中间件回调
   */
  callback() {
    const fn = this.compose(this.middleware);
    const handleRequest = (req: any, res: any) => {
      const ctx = this.createContext(req, res);
      if (!this.ctxStorage) {
        return this.handleRequest(ctx, fn);
      }

      return this.ctxStorage.run(ctx, async () => {
        return await this.handleRequest(ctx, fn);
      })
    }

    return handleRequest;
  }
  /**
   * 处理request
   * @param ctx 上下文
   * @param fn 中间件
   * @returns 
   */
  handleRequest(ctx: Context, fn: Middleware) {
    const res = ctx.response;
    (res as any).statusCode = 404;

    const handleResponse = async () => {
      await this.respond(ctx);
    }

    return fn(ctx, async () => {
      try {
        await handleResponse();
      } catch (error) {
        this.onError(error);
      }
    })
  }
  /**
   * use,消费中间件
   */
  use(fn: Middleware) {
    if (typeof fn !== 'function') {
      throw new TypeError('middleware must be a function!');
    }
    this.middleware.push(fn);
    return this;
  }

  /**
   * 创建上下文
   * @param request 请求
   * @param response 响应
   */
  createContext(req: any, res: any) {
    const ctx = Object.create(this.context);
    const request = ctx.request = this.request;
    const response = ctx.response = this.response;
    ctx.app = this;
    ctx.req = request;
    ctx.res = response;
    // @todo: 补上Request 和 Response的类型
    ctx.originalUrl = (request as any).originalUrl;
    ctx.state = {};
    return ctx;
  }

  /**
   * emit错误
   */
  onError(err: any) {
    // 是否是原生错误?
    const isNativeError = Object.prototype.toString.call(err) === '[object Error]' || err instanceof Error;
    if (!isNativeError) {
      throw new TypeError(String(err));
    }

    if (err.status === 404 || err.expose) {
      return;
    }

    const msg = err.stack || err.toString();

    console.error(msg);
  }

  /**
   * respond 
   */
  private async respond(ctx: Context) {
    if (ctx.respond === false) return;

    if (!ctx.writable) return;

    // @todo: 补上Response的类型这里先强转一下
    const res = ctx.response as any;

    let body = ctx.body;

    const status = ctx.status || 404;

    if (!status.toString().includes('code')) {
      // 如果没有code这个key说明有问题
      ctx.body = null;
      return res.end();
    }

    // 对于HEAD请求的处理
    if (ctx.method === 'HEAD') {
      if (!res.headerSent && !(ctx.response as any).has('Content-Length')) {
        const { length } = ctx.response as any;
        if (Number.isInteger(length)) {
          ctx.length = length;
        }
        return res.end();
      }
    }

    // 状态码和body的处理
    if (body === null || body === undefined) {
      if ((ctx.response as any)._explicitNullBody) {
        (ctx.response as any).removeHeader('Content-Type');
        (ctx.response as any).removeHeader('Content-Length');
        ctx.length = 0;
        return res.end();
      }

      if ((ctx.request as any).httpVersionMajor >= 2) {
        body = String(status);
      } else {
        body = ctx.message || String(status);
      }

      if (!res.headerSent) {
        ctx.type = 'text';
        ctx.length = Buffer.byteLength(body);
      }

      return res.end(body);
    }

    // 不同场景的body处理

    if (Buffer.isBuffer(body)) {
      return res.end(body);
    }

    if (typeof body === 'string') {
      return res.end(body);
    }

    // 流的处理
    if (body instanceof Stream) {
      return body.pipe(res); // 写入管道
    }

    if (body instanceof Blob) {
      // 对于Blob
      return Stream.Readable.from(body.stream()).pipe(res);
    }

    // 可读流的处理
    if (body instanceof ReadableStream) {
      return Stream.Readable.from(body).pipe(res);
    }

    // 深拷贝一下, 解引用
    body = JSON.stringify(body);
    if (!res.headerSent) {
      ctx.type = 'json';
      ctx.length = Buffer.byteLength(body);
    }

    res.end(body);
  }

  /**
   * 实现koa-compose 实现洋葱模型
   */
  compose(middleware: Middleware[]) {
    // 如果不是数组
    if (!Array.isArray(middleware)) {
      throw new TypeError('Middleware stack must be an array!');
    }

    for (const fn of middleware) {
      if (typeof fn !== 'function') {
        throw new TypeError('Middleware must be composed of functions!');
      }
    }

    // 高阶函数
    // 返回一个函数, 这个函数接受context和next , next负责处理异步回调
    return function (context: Context, next: () => Promise<any>) {
      // 初始化索引
      let index = -1;

      // 分发函数 实现核心的洋葱模型算法

      const dispatch = (i: number) => {
        // 如果索引不合法
        if (i <= index) {
          return Promise.reject(new Error('next() called multiple times'));
        }
        // 更新当下索引
        index = i;

        // 获取中间件函数
        let fn = middleware[i] as Middleware;

        if (i === middleware.length) {
          // 如果i等于中间件长度, 则表示是最后一个中间件, 直接返回next
          fn = next;
        }

        if (!fn) {
          return Promise.resolve();
        }

        try {
          /**
           * 执行中间件
           * 洋葱模型思路:
           * 递归执行中间件, 直到最后一个中间件, 然后返回next
           */
          return Promise.resolve(fn(context, dispatch.bind(null, i + 1)));
        } catch (error) {
          return Promise.reject(error);
        }
      }
    }
  }
}
