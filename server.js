const WebSocket = require('ws');
const mineflayer = require('mineflayer');

const PORT = 8765;
const wss = new WebSocket.Server({ port: PORT });

const bots = new Map();

console.log(`[Bot Server] Started on port ${PORT}`);

wss.on('connection', (ws) => {
    console.log('[Bot Server] Client connected');

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            handleCommand(ws, data);
        } catch (error) {
            console.error('[Bot Server] Error parsing message:', error);
            ws.send(JSON.stringify({ error: 'Invalid JSON' }));
        }
    });

    ws.on('close', () => {
        console.log('[Bot Server] Client disconnected');
    });
});

function handleCommand(ws, data) {
    const { command, params } = data;
    console.log(`[Bot Server] Received command: ${command}`, params);

    switch (command) {
        case 'createBot':
            createBot(ws, params);
            break;
        case 'removeBot':
            removeBot(ws, params);
            break;
        case 'listBots':
            listBots(ws);
            break;
        case 'botAction':
            executeBotAction(ws, params);
            break;
        default:
            ws.send(JSON.stringify({ error: 'Unknown command' }));
    }
}

function createBot(ws, params) {
    const { username, host, port, version } = params;

    if (bots.has(username)) {
        console.log(`[${username}] Bot already exists`);
        ws.send(JSON.stringify({ 
            success: false, 
            error: 'Bot already exists' 
        }));
        return;
    }

    try {
        console.log(`[${username}] Creating bot...`);
        const bot = mineflayer.createBot({
            host: host || '127.0.0.1',
            port: port || 25565,
            username: username,
            version: version || false,
            auth: 'offline',
            hideErrors: false
        });

        bot.on('login', () => {
            console.log(`[${username}] Logged in`);
        });

        bot.on('spawn', () => {
            console.log(`[${username}] Spawned in game`);
            ws.send(JSON.stringify({ 
                success: true, 
                message: `Bot ${username} spawned`,
                position: bot.entity.position
            }));
        });

        bot.on('error', (err) => {
            console.error(`[${username}] Error:`, err.message);
            ws.send(JSON.stringify({ 
                event: 'error',
                username: username,
                error: err.message 
            }));
        });

        bot.on('kicked', (reason) => {
            console.log(`[${username}] Kicked:`, reason);
            bots.delete(username);
            ws.send(JSON.stringify({ 
                event: 'kicked', 
                username: username, 
                reason: reason 
            }));
        });

        bot.on('end', (reason) => {
            console.log(`[${username}] Disconnected:`, reason);
            bots.delete(username);
            ws.send(JSON.stringify({ 
                event: 'disconnected', 
                username: username,
                reason: reason || 'Unknown'
            }));
        });

        bot.on('death', () => {
            console.log(`[${username}] Died`);
            ws.send(JSON.stringify({ 
                event: 'death', 
                username: username 
            }));
        });

        bots.set(username, bot);

        ws.send(JSON.stringify({ 
            success: true, 
            message: `Bot ${username} is connecting...` 
        }));

    } catch (error) {
        console.error(`[${username}] Failed to create:`, error);
        ws.send(JSON.stringify({ 
            success: false, 
            error: error.message 
        }));
    }
}

function removeBot(ws, params) {
    const { username } = params;

    if (!bots.has(username)) {
        console.log(`[${username}] Bot not found`);
        ws.send(JSON.stringify({ 
            success: false, 
            error: 'Bot not found' 
        }));
        return;
    }

    console.log(`[${username}] Removing bot`);
    const bot = bots.get(username);
    bot.quit();
    bots.delete(username);

    ws.send(JSON.stringify({ 
        success: true, 
        message: `Bot ${username} removed` 
    }));
}

function listBots(ws) {
    const botList = Array.from(bots.keys());
    console.log('[Bot Server] Listing bots:', botList);
    ws.send(JSON.stringify({ 
        success: true, 
        bots: botList 
    }));
}

function executeBotAction(ws, params) {
    const { username, action, actionParams } = params;
    
    console.log(`[${username}] Action: ${action}`, actionParams);

    if (!bots.has(username)) {
        ws.send(JSON.stringify({ 
            success: false, 
            error: 'Bot not found' 
        }));
        return;
    }

    const bot = bots.get(username);

    try {
        switch (action) {
            case 'startAttack':
                console.log(`[${username}] Attack command ignored - bot is passive`);
                ws.send(JSON.stringify({ 
                    success: true, 
                    message: 'Bot is passive, attack disabled' 
                }));
                break;
                
            case 'stopAttack':
                console.log(`[${username}] Stop attack command received`);
                bot.clearControlStates();
                ws.send(JSON.stringify({ 
                    success: true, 
                    message: 'Bot stopped' 
                }));
                break;
                
            case 'chat':
                bot.chat(actionParams.message);
                ws.send(JSON.stringify({ 
                    success: true, 
                    message: 'Chat sent' 
                }));
                break;
                
            default:
                console.log(`[${username}] Unknown action: ${action}`);
                ws.send(JSON.stringify({ 
                    success: false, 
                    error: 'Unknown action' 
                }));
                return;
        }

        ws.send(JSON.stringify({ 
            success: true, 
            message: `Action ${action} executed` 
        }));

    } catch (error) {
        console.error(`[${username}] Action error:`, error);
        ws.send(JSON.stringify({ 
            success: false, 
            error: error.message 
        }));
    }
}
