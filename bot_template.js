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

// Optimized connection configurations for handshake issues
let botConfigs = [];

// If server version is provided, prioritize it
if (serverVersion && protocolVersion) {
    console.log(`Using server-provided version: ${serverVersion} (Protocol: ${protocolVersion})`);
    botConfigs.push({
        host: host,
        port: port,
        username: botName,
        auth: 'offline',
        version: serverVersion,
        protocolVersion: protocolVersion,
        skipValidation: true,
        hideErrors: false,
        checkTimeoutInterval: 20000,
        loginTimeout: 20000,
        connectTimeout: 20000,
        noPing: true,
        disablePing: true,
        keepAlive: false,
        closeTimeout: 10000
    });
}

// Add standard configurations
botConfigs = botConfigs.concat([
    // Config: Force 1.21.11 with explicit protocol (match common server version)
    {
        host: host,
        port: port,
        username: botName,
        auth: 'offline',
        version: '1.21.11',
        protocolVersion: 774,
        skipValidation: true,
        hideErrors: false,
        checkTimeoutInterval: 30000,
        loginTimeout: 30000,
        connectTimeout: 30000,
        noPing: true,
        disablePing: true,
        keepAlive: false,
        closeTimeout: 15000
    },
    // Config: Force 1.21.1 with explicit protocol (close to server version)
    {
        host: host,
        port: port,
        username: botName,
        auth: 'offline',
        version: '1.21.1',
        protocolVersion: 767,
        skipValidation: true,
        hideErrors: false,
        checkTimeoutInterval: 30000,
        loginTimeout: 30000,
        connectTimeout: 30000,
        noPing: true,
        disablePing: true,
        keepAlive: false,
        closeTimeout: 15000
    },
    // Config: Auto-detect with moderate timeout
    {
        host: host,
        port: port,
        username: botName,
        auth: 'offline',
        version: false, // Auto-detect
        skipValidation: true,
        hideErrors: false,
        checkTimeoutInterval: 25000,
        loginTimeout: 25000,
        connectTimeout: 25000,
        noPing: true,
        disablePing: true,
        keepAlive: false,
        closeTimeout: 15000
    },
    // Config: Force 1.20.1 with explicit protocol (fallback)
    {
        host: host,
        port: port,
        username: botName,
        auth: 'offline',
        version: '1.20.1',
        protocolVersion: 763,
        skipValidation: true,
        hideErrors: false,
        checkTimeoutInterval: 30000,
        loginTimeout: 30000,
        connectTimeout: 30000,
        noPing: true,
        disablePing: true,
        keepAlive: false,
        closeTimeout: 15000
    },
    // Config: Force 1.19.4 with explicit protocol (older fallback)
    {
        host: host,
        port: port,
        username: botName,
        auth: 'offline',
        version: '1.19.4',
        protocolVersion: 762,
        skipValidation: true,
        hideErrors: false,
        checkTimeoutInterval: 30000,
        loginTimeout: 30000,
        connectTimeout: 30000,
        noPing: true,
        disablePing: true,
        keepAlive: false,
        closeTimeout: 15000
    }
]);

let currentConfigIndex = 0;

function tryConnect() {
    if (currentConfigIndex >= botConfigs.length) {
        console.log(`Bot ${botName} failed to connect with all configurations`);
        console.log(`All ${botConfigs.length} connection attempts failed`);
        process.exit(1);
        return;
    }
    
    const config = botConfigs[currentConfigIndex];
    console.log(`Trying configuration ${currentConfigIndex + 1}/${botConfigs.length}:`);
    console.log(`  Version: ${config.version || 'auto-detect'}`);
    console.log(`  Protocol: ${config.protocolVersion || 'auto-detect'}`);
    console.log(`  Timeout: ${config.loginTimeout}ms`);
    
    const bot = mineflayer.createBot(config);
    
    // Track connection state
    let connectionState = 'connecting';
    let stateChangeTimeout;
    
    bot.on('connect', () => {
        connectionState = 'connected';
        console.log(`Bot ${botName} connected to server with config ${currentConfigIndex + 1}`);
        console.log(`Using version: ${config.version || 'auto-detect'}`);
        console.log(`Connection established, waiting for login...`);
        
        // Set timeout for handshake -> login transition
        stateChangeTimeout = setTimeout(() => {
            if (connectionState === 'connected' && bot._client?.state === 'handshaking') {
                console.log(`Bot ${botName} stuck in handshaking state, trying next config`);
                bot.end();
                currentConfigIndex++;
                setTimeout(tryConnect, 1000);
            }
        }, 15000); // 15 seconds timeout for handshake
    });
    
    bot.on('login', () => {
        connectionState = 'logged_in';
        clearTimeout(timeoutId);
        clearTimeout(stateChangeTimeout);
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
        connectionState = 'spawned';
        console.log(`Bot ${botName} spawned in the world`);
        console.log(`Health: ${bot.health}`);
        console.log(`Food: ${bot.food}`);
        console.log(`Game mode: ${bot.player?.gamemode}`);
    });
    
    bot.on('chat', (username, message) => {
        console.log(`[${username}]: ${message}`);
    });
    
    bot.on('error', (err) => {
        connectionState = 'error';
        clearTimeout(stateChangeTimeout);
        console.error(`Bot ${botName} error with config ${currentConfigIndex + 1}:`, err.message);
        
        // Log additional error details for debugging
        if (err.code) {
            console.error(`Error code: ${err.code}`);
        }
        if (err.errno) {
            console.error(`Error number: ${err.errno}`);
        }
        
        if (err.message.includes('ECONNRESET') || err.message.includes('ECONNREFUSED') || 
            err.message.includes('Invalid username') || err.message.includes('authentication') ||
            err.message.includes('protocol') || err.message.includes('version') ||
            err.message.includes('timeout') || err.message.includes('ETIMEDOUT') ||
            err.message.includes('disconnect') || err.message.includes('kicked') ||
            err.message.includes('handshake') || err.message.includes('login') ||
            err.message.includes('socket') || err.message.includes('connection') ||
            err.message.includes('EPIPE') || err.message.includes('ENOTFOUND')) {
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
        connectionState = 'ended';
        clearTimeout(stateChangeTimeout);
        console.log(`Bot ${botName} disconnected: ${reason || 'Unknown reason'}`);
        console.log(`Disconnect details: ${JSON.stringify(reason)}`);
        
        // If we were successfully playing, this is a normal disconnect
        if (connectionState === 'spawned' || connectionState === 'playing') {
            console.log(`Bot ${botName} was successfully connected and then disconnected`);
            process.exit(0);
        }
        
        // If we were still connecting/logging in, try next config
        if (connectionState === 'connected' || connectionState === 'logged_in') {
            console.log(`Bot ${botName} disconnected during login process, trying next config`);
            currentConfigIndex++;
            setTimeout(tryConnect, 2000);
        }
    });
    
    bot.on('kicked', (reason, loggedIn) => {
        connectionState = 'kicked';
        clearTimeout(stateChangeTimeout);
        console.log(`Bot ${botName} was kicked: ${reason} (logged in: ${loggedIn})`);
        process.exit(0);
    });
    
    // Enhanced state tracking with login timeout
    bot.on('state', (newState, oldState) => {
        console.log(`Bot ${botName} state changed: ${oldState} -> ${newState}`);
        if (newState === 'play') {
            connectionState = 'playing';
            console.log(`Bot ${botName} successfully entered play state!`);
            clearTimeout(stateChangeTimeout);
        }
        
        // If stuck in handshaking for too long, force retry
        if (newState === 'handshaking') {
            setTimeout(() => {
                if (bot._client?.state === 'handshaking' && connectionState === 'connected') {
                    console.log(`Bot ${botName} handshake timeout, forcing retry`);
                    bot.end();
                    currentConfigIndex++;
                    setTimeout(tryConnect, 1000);
                }
            }, 10000); // 10 second handshake timeout
        }
        
        // If stuck in login for too long, force retry
        if (newState === 'login') {
            setTimeout(() => {
                if (bot._client?.state === 'login' && connectionState === 'connected') {
                    console.log(`Bot ${botName} login timeout, forcing retry`);
                    bot.end();
                    currentConfigIndex++;
                    setTimeout(tryConnect, 1000);
                }
            }, 30000); // 30 second login timeout
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
    
    // Progress indicator with state info
    let progressInterval = setInterval(() => {
        if (bot._client && bot._client.state) {
            console.log(`Bot ${botName} progress: state = ${bot._client.state}, connection = ${connectionState}`);
            if (bot._client.state === 'play') {
                clearInterval(progressInterval);
            }
        } else {
            console.log(`Bot ${botName} still connecting... (connection = ${connectionState})`);
        }
    }, 5000); // Every 5 seconds
    
    // Overall connection timeout - reduced to 60 seconds for faster fallback
    const timeoutId = setTimeout(() => {
        clearInterval(progressInterval);
        clearTimeout(stateChangeTimeout);
        if (connectionState !== 'spawned' && connectionState !== 'playing') {
            console.log(`Bot ${botName} overall timeout with config ${currentConfigIndex + 1} (waited 60 seconds)`);
            console.log(`Final state: ${bot._client?.state || 'unknown'}, connection: ${connectionState}`);
            bot.end();
            currentConfigIndex++;
            setTimeout(tryConnect, 1000);
        }
    }, 60000);
}

// Start connection attempts
tryConnect();