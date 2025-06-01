// utils/logger.js
// A simple logging utility to standardize logging across the application

const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m'
};

// Emoji icons for different log levels and contexts
const emojis = {
  error: '❌', // Red X for errors
  warn: '⚠️',  // Warning sign for warnings
  info: 'ℹ️',  // Information symbol for info
  debug: '🔍', // Magnifying glass for debug
  verbose: '📝', // Notepad for verbose logs
  http: '🌐',   // Globe for HTTP requests
  api: '🤖',    // Robot for API calls
  db: '💾',     // Floppy disk for database operations
  auth: '🔐',   // Lock for authentication
  food: '🍽️',   // Plate with utensils for food analysis
  credits: '💰', // Money bag for credit operations
  cache: '📦',   // Package for caching operations
  success: '✅'  // Green checkmark for success
};

const getTimestamp = () => {
  return new Date().toISOString();
};

const formatLog = (level, message, data = null, context = null) => {
  let color;
  let emoji;
  
  // Set color based on log level
  switch (level) {
    case 'ERROR':
      color = colors.red;
      emoji = emojis.error;
      break;
    case 'WARN':
      color = colors.yellow;
      emoji = emojis.warn;
      break;
    case 'INFO':
      color = colors.green;
      emoji = emojis.info;
      break;
    case 'DEBUG':
      color = colors.blue;
      emoji = emojis.debug;
      break;
    case 'VERBOSE':
      color = colors.cyan;
      emoji = emojis.verbose;
      break;
    default:
      color = colors.reset;
      emoji = '';
  }
  
  // Override emoji if context is provided
  if (context && emojis[context.toLowerCase()]) {
    emoji = emojis[context.toLowerCase()];
  }

  const timestamp = getTimestamp();
  let output = `${color}[${timestamp}] ${emoji} [${level}]${colors.reset} ${message}`;
  
  if (data) {
    if (data instanceof Error) {
      output += `\n${colors.red}${data.stack || data.message}${colors.reset}`;
    } else if (typeof data === 'object') {
      try {
        const jsonStr = JSON.stringify(data, null, 2);
        output += `\n${colors.gray}${jsonStr}${colors.reset}`;
      } catch (e) {
        output += `\n${colors.gray}[Object cannot be stringified]${colors.reset}`;
      }
    } else {
      output += ` ${colors.gray}${data}${colors.reset}`;
    }
  }
  
  return output;
};

const logger = {
  error: (message, data = null, context = null) => {
    console.error(formatLog('ERROR', message, data, context));
  },
  
  warn: (message, data = null, context = null) => {
    console.warn(formatLog('WARN', message, data, context));
  },
  
  info: (message, data = null, context = null) => {
    console.info(formatLog('INFO', message, data, context));
  },
  
  debug: (message, data = null, context = null) => {
    if (process.env.NODE_ENV !== 'production') {
      console.debug(formatLog('DEBUG', message, data, context));
    }
  },
  
  verbose: (message, data = null, context = null) => {
    if (process.env.LOG_LEVEL === 'verbose') {
      console.log(formatLog('VERBOSE', message, data, context));
    }
  },
  
  // Specialized context loggers
  api: (message, data = null) => {
    console.info(formatLog('INFO', message, data, 'api'));
  },
  
  db: (message, data = null) => {
    console.info(formatLog('INFO', message, data, 'db'));
  },
  
  auth: (message, data = null) => {
    console.info(formatLog('INFO', message, data, 'auth'));
  },
  
  food: (message, data = null) => {
    console.info(formatLog('INFO', message, data, 'food'));
  },
  
  credits: (message, data = null) => {
    console.info(formatLog('INFO', message, data, 'credits'));
  },
  
  success: (message, data = null) => {
    console.info(formatLog('INFO', message, data, 'success'));
  },
  
  cache: (message, data = null) => {
    console.info(formatLog('INFO', message, data, 'cache'));
  },
  
  
  http: (req, res, next) => {
    const start = Date.now();
    
    res.on('finish', () => {
      const duration = Date.now() - start;
      const statusColor = res.statusCode >= 400 ? colors.red : colors.green;
      const statusEmoji = res.statusCode >= 400 ? emojis.error : emojis.success;
      const method = req.method.padEnd(7);
      const status = res.statusCode;
      const path = req.originalUrl;
      
      console.log(
        `${colors.blue}[${getTimestamp()}] ${emojis.http} [HTTP]${colors.reset} ${method} ${statusColor}${status}${colors.reset} ${statusEmoji} ${path} ${colors.gray}(${duration}ms)${colors.reset}`
      );
    });
    
    if (next) next();
  }
};

export default logger;
