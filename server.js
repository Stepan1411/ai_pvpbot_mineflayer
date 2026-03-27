const WebSocket = require('ws');
const mineflayer = require('mineflayer');

const PORT = 8765;
const wss = new WebSocket.Server({ port: PORT });

const bots = new Map();
const botFactions = new Map();
const hostileRelations = new Map();
const botTargets = new Map(); // bot -> target name
const botIntervals = new Map(); // bot -> interval id

console.log(`Bot server started on port ${PORT}`);

wss.on('connection', (ws) => {

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
            host: host || '127.0.0.1',
            port: port || 25565,
            username: username,
            version: version || false,
            auth: 'offline',
            hideErrors: false
        });

        bot.on('login', () => {
            // Silent login
        });

        bot.on('spawn', () => {
            ws.send(JSON.stringify({ 
                success: true, 
                message: `Bot ${username} connected and spawned`,
                position: bot.entity.position
            }));
        });

        bot.on('error', (err) => {
            ws.send(JSON.stringify({ 
                event: 'error',
                username: username,
                error: err.message 
            }));
        });

        bot.on('kicked', (reason) => {
            bots.delete(username);
            ws.send(JSON.stringify({ 
                event: 'kicked', 
                username: username, 
                reason: reason 
            }));
        });

        bot.on('end', (reason) => {
            bots.delete(username);
            
            // Clear attack interval
            if (botIntervals.has(username)) {
                clearInterval(botIntervals.get(username));
                botIntervals.delete(username);
            }
            botTargets.delete(username);
            
            ws.send(JSON.stringify({ 
                event: 'disconnected', 
                username: username,
                reason: reason || 'Unknown reason'
            }));
        });

        bot.on('death', () => {
            ws.send(JSON.stringify({ 
                event: 'death', 
                username: username 
            }));
        });

        bot.on('health', () => {
            // Silent health monitoring
        });

        bot.on('message', (message) => {
            // Silent chat monitoring
        });

        bots.set(username, bot);

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
    
    // Clear attack interval
    if (botIntervals.has(username)) {
        clearInterval(botIntervals.get(username));
        botIntervals.delete(username);
    }
    botTargets.delete(username);

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

    if (action === 'updateFactions' && username === '__system__') {
        botFactions.clear();
        hostileRelations.clear();
        
        if (actionParams.botFactions) {
            for (const [bot, faction] of Object.entries(actionParams.botFactions)) {
                botFactions.set(bot, faction);
            }
        }
        
        if (actionParams.hostileRelations) {
            for (const [faction, enemies] of Object.entries(actionParams.hostileRelations)) {
                hostileRelations.set(faction, new Set(enemies));
            }
        }
        
        ws.send(JSON.stringify({ 
            success: true, 
            message: 'Faction data updated' 
        }));
        return;
    }

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
                // Start attacking target
                const targetName = actionParams.target;
                botTargets.set(username, targetName);
                
                // Clear existing interval if any
                if (botIntervals.has(username)) {
                    clearInterval(botIntervals.get(username));
                }
                
                // Start attack loop
                const intervalId = setInterval(() => {
                    if (!bots.has(username) || !botTargets.has(username)) {
                        clearInterval(intervalId);
                        botIntervals.delete(username);
                        return;
                    }
                    
                    const target = botTargets.get(username);
                    const targetEntity = Object.values(bot.entities).find(e => 
                        e.type === 'player' && e.username === target
                    );
                    
                    if (!targetEntity) {
                        bot.clearControlStates();
                        return;
                    }
                    
                    const distance = targetEntity.position.distanceTo(bot.entity.position);
                    bot.lookAt(targetEntity.position.offset(0, targetEntity.height, 0));
                    
                    if (distance > 4) {
                        const dx = targetEntity.position.x - bot.entity.position.x;
                        const dz = targetEntity.position.z - bot.entity.position.z;
                        const angle = Math.atan2(-dx, -dz);
                        bot.entity.yaw = angle;
                        bot.setControlState('forward', true);
                        bot.setControlState('sprint', true);
                    } else {
                        bot.setControlState('forward', false);
                        bot.setControlState('sprint', false);
                        bot.attack(targetEntity);
                    }
                    
                    if (distance < 3 && Math.random() < 0.3) {
                        bot.setControlState('jump', true);
                        setTimeout(() => bot.setControlState('jump', false), 100);
                    }
                }, 50);
                
                botIntervals.set(username, intervalId);
                break;
                
            case 'stopAttack':
                // Stop attacking
                if (botIntervals.has(username)) {
                    clearInterval(botIntervals.get(username));
                    botIntervals.delete(username);
                }
                botTargets.delete(username);
                bot.clearControlStates();
                break;
                
            case 'teleport':
                if (bot.entity) {
                    bot.entity.position.x = actionParams.x;
                    bot.entity.position.y = actionParams.y;
                    bot.entity.position.z = actionParams.z;
                }
                break;
            case 'chat':
                bot.chat(actionParams.message);
                break;
            case 'move':
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
