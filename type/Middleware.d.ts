// 中间件执行函数数组

declare type Middleware = (context: Context, next: () => Promise<void>) => void;
