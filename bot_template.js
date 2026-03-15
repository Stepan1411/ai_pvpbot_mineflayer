const mineflayer = require('mineflayer');

// Get bot name from command line arguments
const botName = process.argv[2] || 'AIBot';
const host = process.argv[3] || '127.0.0.1';
const port = parseInt(process.argv[4]) || 25565;

console.log(`Starting bot: ${botName} connecting to ${host}:${port}`);

// Try different connection configurations
const botConfigs = [
    // Config 1: Offline mode
    {
        host: host,
        port: port,
        username: botName,
        auth: 'offline',
        version: false,
        skipValidation: true,
        hideErrors: false
    },
    // Config 2: Force specific version
    {
        host: host,
        port: port,
        username: botName,
        auth: 'offline',
        version: '1.21.1',
        skipValidation: true,
        hideErrors: false
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
    });
    
    bot.on('login', () => {
        console.log(`Bot ${botName} logged in successfully!`);
        console.log(`Server version: ${bot.version}`);
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
            err.message.includes('Invalid username') || err.message.includes('authentication')) {
            console.log(`Config ${currentConfigIndex + 1} failed, trying next configuration...`);
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
    
    // Connection timeout
    setTimeout(() => {
        if (!bot.entity) {
            console.log(`Bot ${botName} connection timeout with config ${currentConfigIndex + 1}`);
            currentConfigIndex++;
            tryConnect();
        }
    }, 15000);
}

// Start connection attempts
tryConnect();