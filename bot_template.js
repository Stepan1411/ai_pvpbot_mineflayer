const mineflayer = require('mineflayer');

// Get bot name from command line arguments
const botName = process.argv[2] || 'AIBot';
const host = process.argv[3] || '127.0.0.1';
const port = parseInt(process.argv[4]) || 25565;
const serverVersion = process.argv[5]; // Optional server version
const protocolVersion = process.argv[6] ? parseInt(process.argv[6]) : null; // Optional protocol version

console.log(`Starting bot: ${botName} connecting to ${host}:${port}`);
console.log(`Command line args:`, process.argv);
if (serverVersion) {
    console.log(`Server version: ${serverVersion} (Protocol: ${protocolVersion || 'auto-detect'})`);
} else {
    console.log(`No server version provided, using auto-detect`);
}

// Try different connection configurations
const botConfigs = [
    // Config 1: Use server version if provided, otherwise auto-detect
    {
        host: host,
        port: port,
        username: botName,
        auth: 'offline',
        version: serverVersion || false, // Use server version or auto-detect
        skipValidation: true,
        hideErrors: false,
        checkTimeoutInterval: 30000,
        loginTimeout: 30000
    },
    // Config 2: Use protocol version if provided
    ...(protocolVersion ? [{
        host: host,
        port: port,
        username: botName,
        auth: 'offline',
        protocolVersion: protocolVersion,
        skipValidation: true,
        hideErrors: false,
        checkTimeoutInterval: 30000,
        loginTimeout: 30000
    }] : []),
    // Config 3: Force 1.21.11 (protocol 774) - common server version
    {
        host: host,
        port: port,
        username: botName,
        auth: 'offline',
        version: '1.21.11',
        skipValidation: true,
        hideErrors: false,
        checkTimeoutInterval: 30000,
        loginTimeout: 30000
    },
    // Config 4: Force 1.21.1 (protocol 767)
    {
        host: host,
        port: port,
        username: botName,
        auth: 'offline',
        version: '1.21.1',
        skipValidation: true,
        hideErrors: false,
        checkTimeoutInterval: 30000,
        loginTimeout: 30000
    },
    // Config 5: Force 1.21.3 (protocol 768)
    {
        host: host,
        port: port,
        username: botName,
        auth: 'offline',
        version: '1.21.3',
        skipValidation: true,
        hideErrors: false,
        checkTimeoutInterval: 30000,
        loginTimeout: 30000
    },
    // Config 6: Try with protocol 774 directly
    {
        host: host,
        port: port,
        username: botName,
        auth: 'offline',
        protocolVersion: 774,
        skipValidation: true,
        hideErrors: false,
        checkTimeoutInterval: 30000,
        loginTimeout: 30000
    }
];

let currentConfigIndex = 0;

function tryConnect() {
    if (currentConfigIndex >= botConfigs.length) {
        console.log(`Bot ${botName} failed to connect with all configurations`);
        process.exit(1);
        return;
    }
    
    const config = botConfigs[currentConfigIndex];
    console.log(`Trying configuration ${currentConfigIndex + 1}:`, JSON.stringify(config, null, 2));
    
    const bot = mineflayer.createBot(config);
    
    bot.on('connect', () => {
        console.log(`Bot ${botName} connected to server with config ${currentConfigIndex + 1}`);
        console.log(`Using version: ${config.version || 'auto-detect'}`);
    });
    
    bot.on('login', () => {
        console.log(`Bot ${botName} logged in successfully!`);
        console.log(`Server version: ${bot.version}`);
        console.log(`Protocol version: ${bot.protocolVersion}`);
        if (bot.entity) {
            console.log(`Position: ${bot.entity.position}`);
        }
    });
    
    bot.on('spawn', () => {
        console.log(`Bot ${botName} spawned in the world`);
        console.log(`Health: ${bot.health}`);
        console.log(`Food: ${bot.food}`);
    });
    
    bot.on('chat', (username, message) => {
        console.log(`[${username}]: ${message}`);
    });
    
    bot.on('error', (err) => {
        console.error(`Bot ${botName} error with config ${currentConfigIndex + 1}:`, err.message);
        
        if (err.message.includes('ECONNRESET') || err.message.includes('ECONNREFUSED') || 
            err.message.includes('Invalid username') || err.message.includes('authentication') ||
            err.message.includes('protocol') || err.message.includes('version') ||
            err.message.includes('timeout') || err.message.includes('ETIMEDOUT')) {
            console.log(`Config ${currentConfigIndex + 1} failed, trying next configuration...`);
            bot.end();
            currentConfigIndex++;
            setTimeout(tryConnect, 2000);
        } else {
            console.error('Unexpected error:', err);
            process.exit(1);
        }
    });
    
    bot.on('end', (reason) => {
        console.log(`Bot ${botName} disconnected: ${reason || 'Unknown reason'}`);
        process.exit(0);
    });
    
    bot.on('kicked', (reason, loggedIn) => {
        console.log(`Bot ${botName} was kicked: ${reason} (logged in: ${loggedIn})`);
        process.exit(0);
    });
    
    // Handle process termination
    process.on('SIGINT', () => {
        console.log(`Stopping bot ${botName}...`);
        if (bot) {
            bot.quit();
        }
        process.exit(0);
    });
    
    process.on('SIGTERM', () => {
        console.log(`Terminating bot ${botName}...`);
        if (bot) {
            bot.quit();
        }
        process.exit(0);
    });
    
    // Connection timeout - increase to 45 seconds and add better timeout handling
    const timeoutId = setTimeout(() => {
        if (!bot.entity && !bot._client?.state) {
            console.log(`Bot ${botName} connection timeout with config ${currentConfigIndex + 1}`);
            bot.end();
            currentConfigIndex++;
            setTimeout(tryConnect, 1000);
        }
    }, 45000);
    
    // Clear timeout on successful login
    bot.on('login', () => {
        clearTimeout(timeoutId);
        console.log(`Bot ${botName} logged in successfully!`);
        console.log(`Server version: ${bot.version}`);
        console.log(`Protocol version: ${bot.protocolVersion}`);
        if (bot.entity) {
            console.log(`Position: ${bot.entity.position}`);
        }
    });
}

// Start connection attempts
tryConnect();