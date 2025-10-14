const log = require('electron-log');
const path = require('path');
const { app } = require('electron');

/**
 * 日志管理器
 * 使用 electron-log 实现日志记录功能
 * 会自动将 console.log 等输出重定向到文件
 */

class Logger {
  constructor() {
    // 设置日志文件路径
    // 日志将保存在 logs 目录下，按日期命名
    const logsDir = app.isPackaged 
      ? path.join(path.dirname(process.execPath), 'logs')
      : path.join(app.getAppPath(), 'logs');
    
    // 设置日志文件名格式：年-月-日.log
    log.transports.file.resolvePathFn = () => {
      const date = new Date();
      const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD
      return path.join(logsDir, dateStr, `launcher-${dateStr}.log`);
    };

    // 启用渲染进程日志支持
    log.transports.ipc.level = 'debug';

    // 设置日志级别（error, warn, info, verbose, debug, silly）
    log.transports.file.level = 'debug';
    log.transports.console.level = 'debug';
    
    // 设置日志格式
    log.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}';
    log.transports.console.format = '[{h}:{i}:{s}.{ms}] [{level}] {text}';
    
    // 设置日志文件大小限制（默认1MB）
    log.transports.file.maxSize = 5 * 1024 * 1024; // 5MB
    
    log.transports.file.maxAge = 7 * 24 * 60 * 60 * 1000; // 保留7天
    
    // 捕获未处理的异常和Promise拒绝（新版本推荐方式）
    this.setupErrorHandlers();

    // 重写 console 方法，使其输出到日志文件
    this.interceptConsole();

    log.info('='.repeat(80));
    log.info('应用启动');
    log.info(`应用版本: ${app.getVersion()}`);
    log.info(`Electron版本: ${process.versions.electron}`);
    log.info(`Node版本: ${process.versions.node}`);
    log.info(`平台: ${process.platform}`);
    log.info(`架构: ${process.arch}`);
    log.info('='.repeat(80));
  }

  /**
   * 设置全局错误处理器
   */
  setupErrorHandlers() {
    // 捕获未处理的异常
    process.on('uncaughtException', (error) => {
      log.error('未捕获的异常:', error);
      log.error('错误堆栈:', error.stack);
    });

    // 捕获未处理的Promise拒绝
    process.on('unhandledRejection', (reason, promise) => {
      log.error('未处理的Promise拒绝:', reason);
      log.error('Promise:', promise);
    });

    // 捕获警告
    process.on('warning', (warning) => {
      log.warn('进程警告:', warning.name, warning.message);
      if (warning.stack) {
        log.warn('警告堆栈:', warning.stack);
      }
    });
  }

  /**
   * 拦截 console 方法，将输出重定向到日志文件
   */
  interceptConsole() {
    // 保存原始的 console 方法
    const originalConsole = {
      log: console.log,
      error: console.error,
      warn: console.warn,
      info: console.info,
      debug: console.debug
    };

    // 重写 console.log
    console.log = (...args) => {
      log.info(...args);
      originalConsole.log(...args);
    };

    // 重写 console.error
    console.error = (...args) => {
      log.error(...args);
      originalConsole.error(...args);
    };

    // 重写 console.warn
    console.warn = (...args) => {
      log.warn(...args);
      originalConsole.warn(...args);
    };

    // 重写 console.info
    console.info = (...args) => {
      log.info(...args);
      originalConsole.info(...args);
    };

    // 重写 console.debug
    console.debug = (...args) => {
      log.debug(...args);
      originalConsole.debug(...args);
    };
  }

  /**
   * 获取日志实例（用于直接调用 electron-log 的方法）
   */
  getLogger() {
    return log;
  }

  /**
   * 记录错误日志
   */
  error(...args) {
    log.error(...args);
  }

  /**
   * 记录警告日志
   */
  warn(...args) {
    log.warn(...args);
  }

  /**
   * 记录信息日志
   */
  info(...args) {
    log.info(...args);
  }

  /**
   * 记录调试日志
   */
  debug(...args) {
    log.debug(...args);
  }

  /**
   * 记录详细日志
   */
  verbose(...args) {
    log.verbose(...args);
  }
}

// 导出单例
module.exports = new Logger();

