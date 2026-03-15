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
        checkTimeoutInterval: 60000, // Increase to 60 seconds
        loginTimeout: 60000, // Increase to 60 seconds
        connectTimeout: 60000 // Add connect timeout
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
        checkTimeoutInterval: 60000,
        loginTimeout: 60000,
        connectTimeout: 60000
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
        checkTimeoutInterval: 60000,
        loginTimeout: 60000,
        connectTimeout: 60000
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
        checkTimeoutInterval: 60000,
        loginTimeout: 60000,
        connectTimeout: 60000
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
        checkTimeoutInterval: 60000,
        loginTimeout: 60000,
        connectTimeout: 60000
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
        checkTimeoutInterval: 60000,
        loginTimeout: 60000,
        connectTimeout: 60000
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
        console.log(`Using version: ${config.version || config.protocolVersion || 'auto-detect'}`);
        console.log(`Connection established, waiting for login...`);
        console.log(`Server may be slow, please be patient...`);
    });
    
    bot.on('login', () => {
        clearTimeout(timeoutId);
        clearInterval(progressInterval);
        console.log(`Bot ${botName} logged in successfully!`);
        console.log(`Server version: ${bot.version}`);
        console.log(`Protocol version: ${bot.protocolVersion}`);
        console.log(`Player UUID: ${bot.player?.uuid}`);
        if (bot.entity) {
            console.log(`Position: ${bot.entity.position}`);
        }
    });
    
    bot.on('spawn', () => {
        console.log(`Bot ${botName} spawned in the world`);
        console.log(`Health: ${bot.health}`);
        console.log(`Food: ${bot.food}`);
        console.log(`Game mode: ${bot.player?.gamemode}`);
    });
    
    bot.on('chat', (username, message) => {
        console.log(`[${username}]: ${message}`);
    });
    
    bot.on('error', (err) => {
        console.error(`Bot ${botName} error with config ${currentConfigIndex + 1}:`, err.message);
        console.error(`Error details:`, err);
        
        if (err.message.includes('ECONNRESET') || err.message.includes('ECONNREFUSED') || 
            err.message.includes('Invalid username') || err.message.includes('authentication') ||
            err.message.includes('protocol') || err.message.includes('version') ||
            err.message.includes('timeout') || err.message.includes('ETIMEDOUT') ||
            err.message.includes('disconnect') || err.message.includes('kicked')) {
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
        console.log(`Disconnect details:`, reason);
        process.exit(0);
    });
    
    bot.on('kicked', (reason, loggedIn) => {
        console.log(`Bot ${botName} was kicked: ${reason} (logged in: ${loggedIn})`);
        console.log(`Kick reason details:`, reason);
        process.exit(0);
    });
    
    // Add more event handlers for debugging
    bot.on('packet', (data, meta) => {
        if (meta.name === 'login' || meta.name === 'success' || meta.name === 'disconnect') {
            console.log(`Bot ${botName} received packet: ${meta.name}`, data);
        }
        // Log progress packets to show server is responding
        if (meta.name === 'login_success' || meta.name === 'join_game' || meta.name === 'player_info') {
            console.log(`Bot ${botName} login progress: ${meta.name}`);
        }
    });
    
    bot.on('state', (newState, oldState) => {
        console.log(`Bot ${botName} state changed: ${oldState} -> ${newState}`);
        if (newState === 'play') {
            console.log(`Bot ${botName} successfully entered play state!`);
        }
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
    
    // Progress indicator for slow servers
    let progressInterval = setInterval(() => {
        if (bot._client && bot._client.state) {
            console.log(`Bot ${botName} connection progress: state = ${bot._client.state}`);
            if (bot._client.state === 'play') {
                clearInterval(progressInterval);
            }
        } else {
            console.log(`Bot ${botName} still connecting... (server may be slow)`);
        }
    }, 10000); // Every 10 seconds
    
    // Connection timeout - increase to 120 seconds for slow servers
    const timeoutId = setTimeout(() => {
        clearInterval(progressInterval);
        if (!bot.entity && !bot._client?.state) {
            console.log(`Bot ${botName} connection timeout with config ${currentConfigIndex + 1} (waited 120 seconds)`);
            bot.end();
            currentConfigIndex++;
            setTimeout(tryConnect, 1000);
        }
    }, 120000);
}

// Start connection attempts
tryConnect();