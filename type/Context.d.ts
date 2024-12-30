// 上下文全局类型

declare type Context = {
  request: Request;
  response: Response;
  // app: Application;
  respond: boolean; // 是否响应
  writable: boolean; // 是否可写
  body: any; // 响应体
  status: number; // 状态码
  originalUrl: string; // 原始URL
  method: string; // 请求方法
  url: string; // 请求URL
  path: string; // 请求路径
  query: any; // 请求参数
  header: any; // 请求头
  message: string; // 响应消息
  length: number; // 响应长度
  type: string; // 响应类型
}
