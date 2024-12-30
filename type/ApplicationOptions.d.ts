// 应用配置类型

declare type AppOptions = {
  proxy: boolean; // 是否开启代理
  env: string; // 环境变量
  keys: string[]; // 密钥组
  proxyIpHeader: string; // 代理IP头
  subdomainOffset: number; // 子域名偏移量
  proxyIpHeaderTimeout: number; // 代理IP头超时时间
  maxIpsCount: number; // 最大IP数量
  maxHeadersCount: number; // 最大头数量
  gzip: boolean; // 是否开启Gzip
  gzipLimit: number; // Gzip限制
  gzipMinLength: number; // Gzip最小长度
  asyncLocalStorage: boolean; // 是否开启AsyncLocalStorage
}
