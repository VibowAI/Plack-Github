/**
 * Structured logger utility to direct all diagnostics, audits, and debug reports
 * to the browser console instead of the chat UI.
 */

const IS_DEV = process.env.NODE_ENV === 'development';

export enum LogCategory {
  APP = '[APP]',
  CHAT = '[CHAT]',
  STREAM = '[STREAM]',
  MODEL = '[MODEL]',
  WEB_SEARCH = '[WEB_SEARCH]',
  DATABASE = '[DATABASE]',
  AUTH = '[AUTH]',
  ERROR = '[ERROR]',
  PERFORMANCE = '[PERFORMANCE]',
}

class Logger {
  private log(
    category: LogCategory,
    message: string,
    data?: any,
    level: 'log' | 'warn' | 'error' | 'group' | 'groupCollapsed' = 'log'
  ) {
    if (!IS_DEV && level === 'log' && category !== LogCategory.ERROR) {
      // Minimal logs in production
      return;
    }

    const title = `${category} ${message}`;

    if (level === 'group' || level === 'groupCollapsed') {
      if (level === 'groupCollapsed') {
        console.groupCollapsed(title);
      } else {
        console.group(title);
      }
      if (data) console.log(data);
      console.groupEnd();
    } else {
      console[level](title, data || '');
    }
  }

  logInfo(category: LogCategory, message: string, data?: any) {
    this.log(category, message, data, 'log');
  }

  logWarn(category: LogCategory, message: string, data?: any) {
    this.log(category, message, data, 'warn');
  }

  logError(category: LogCategory, message: string, data?: any) {
    this.log(category, message, data, 'error');
  }

  logGroup(category: LogCategory, message: string, data?: any, collapsed = true) {
    this.log(category, message, data, collapsed ? 'groupCollapsed' : 'group');
  }

  /**
   * Specifically for performance reporting
   */
  reportPerformance(label: string, durationMs: number, data?: any) {
    this.logGroup(LogCategory.PERFORMANCE, label, { durationMs, ...data });
  }

  /**
   * Specifically for comprehensive audit reports
   */
  reportAudit(category: LogCategory, reportName: string, auditData: any) {
    this.logGroup(category, `AUDIT: ${reportName}`, auditData);
  }

  /**
   * Specifically for diagnostic/debug reports
   */
  reportDiagnostic(category: LogCategory, diagnosticName: string, diagnosticData: any) {
    this.logGroup(category, `DIAGNOSTIC: ${diagnosticName}`, diagnosticData);
  }
}

export const logger = new Logger();
