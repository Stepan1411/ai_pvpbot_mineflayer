const WebSocket = require('ws');
const mineflayer = require('mineflayer');

const PORT = 8765;
const wss = new WebSocket.Server({ port: PORT });

const bots = new Map();

console.log(`Bot server started on port ${PORT}`);

wss.on('connection', (ws) => {
    console.log('New client connected');

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            handleCommand(ws, data);
        } catch (error) {
            console.error('Error parsing message:', error);
            ws.send(JSON.stringify({ error: 'Invalid JSON' }));
        }
    });

    ws.on('close', () => {
        console.log('Client disconnected');
    });
});

function handleCommand(ws, data) {
    const { command, params } = data;

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
        ws.send(JSON.stringify({ 
            success: false, 
            error: 'Bot already exists' 
        }));
        return;
    }

    try {
        const bot = mineflayer.createBot({
            host: host || 'localhost',
            port: port || 25565,
            username: username,
            version: version || false, // false = автоопределение версии
            auth: 'offline',
            hideErrors: false
        });

        bot.on('login', () => {
            console.log(`Bot ${username} logged in`);
        });

        bot.on('spawn', () => {
            console.log(`Bot ${username} spawned at position:`, bot.entity.position);
            ws.send(JSON.stringify({ 
                success: true, 
                message: `Bot ${username} connected and spawned`,
                position: bot.entity.position
            }));
        });

        bot.on('error', (err) => {
            console.error(`Bot ${username} error:`, err.message);
            ws.send(JSON.stringify({ 
                event: 'error',
                username: username,
                error: err.message 
            }));
        });

        bot.on('kicked', (reason) => {
            console.log(`Bot ${username} kicked:`, reason);
            bots.delete(username);
            ws.send(JSON.stringify({ 
                event: 'kicked', 
                username: username, 
                reason: reason 
            }));
        });

        bot.on('end', (reason) => {
            console.log(`Bot ${username} disconnected:`, reason);
            bots.delete(username);
            ws.send(JSON.stringify({ 
                event: 'disconnected', 
                username: username,
                reason: reason || 'Unknown reason'
            }));
        });

        bot.on('death', () => {
            console.log(`Bot ${username} died`);
            ws.send(JSON.stringify({ 
                event: 'death', 
                username: username 
            }));
        });

        bot.on('health', () => {
            if (bot.health <= 0) {
                console.log(`Bot ${username} health: ${bot.health}`);
            }
        });

        bot.on('message', (message) => {
            console.log(`[Chat] ${message.toString()}`);
        });

        bots.set(username, bot);

        // Отправляем начальный ответ
        ws.send(JSON.stringify({ 
            success: true, 
            message: `Bot ${username} is connecting...` 
        }));

    } catch (error) {
        console.error(`Failed to create bot ${username}:`, error);
        ws.send(JSON.stringify({ 
            success: false, 
            error: error.message 
        }));
    }
}

function removeBot(ws, params) {
    const { username } = params;

    if (!bots.has(username)) {
        ws.send(JSON.stringify({ 
            success: false, 
            error: 'Bot not found' 
        }));
        return;
    }

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
    ws.send(JSON.stringify({ 
        success: true, 
        bots: botList 
    }));
}

function executeBotAction(ws, params) {
    const { username, action, actionParams } = params;

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
            case 'chat':
                bot.chat(actionParams.message);
                break;
            case 'move':
                // Базовое движение
                bot.setControlState('forward', actionParams.forward || false);
                bot.setControlState('back', actionParams.back || false);
                bot.setControlState('left', actionParams.left || false);
                bot.setControlState('right', actionParams.right || false);
                break;
            case 'jump':
                bot.setControlState('jump', true);
                setTimeout(() => bot.setControlState('jump', false), 100);
                break;
            default:
                ws.send(JSON.stringify({ 
                    success: false, 
                    error: 'Unknown action' 
                }));
                return;
        }

        ws.send(JSON.stringify({ 
            success: true, 
            message: `Action ${action} executed for bot ${username}` 
        }));

    } catch (error) {
        ws.send(JSON.stringify({ 
            success: false, 
            error: error.message 
        }));
    }
}
