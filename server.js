const WebSocket = require('ws');
const mineflayer = require('mineflayer');

const PORT = 8765;
const wss = new WebSocket.Server({ port: PORT });

const bots = new Map();
const botFactions = new Map();
const hostileRelations = new Map();

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

            startPvpBehavior(bot, username);
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

function startPvpBehavior(bot, username) {
    const pvpRange = 4;
    const followRange = 16;
    let target = null;
    let attackCooldown = false;

    setInterval(() => {
        if (!bot.entity) return;

        const players = Object.values(bot.entities).filter(entity => 
            entity.type === 'player' && 
            entity.username !== username &&
            entity.position.distanceTo(bot.entity.position) < followRange
        );

        if (players.length === 0) {
            target = null;
            bot.clearControlStates();
            return;
        }

        const myFaction = botFactions.get(username);
        
        const validTargets = players.filter(player => {
            const targetName = player.username;
            const targetFaction = botFactions.get(targetName);
            
            if (!myFaction || !targetFaction) {
                return true;
            }
            
            if (myFaction === targetFaction) {
                return false;
            }
            
            const myEnemies = hostileRelations.get(myFaction);
            if (myEnemies && myEnemies.has(targetFaction)) {
                return true;
            }
            
            return false;
        });

        if (validTargets.length === 0) {
            target = null;
            bot.clearControlStates();
            return;
        }

        target = validTargets.reduce((closest, player) => {
            const distToPlayer = player.position.distanceTo(bot.entity.position);
            const distToClosest = closest ? closest.position.distanceTo(bot.entity.position) : Infinity;
            return distToPlayer < distToClosest ? player : closest;
        }, null);

        if (target) {
            const distance = target.position.distanceTo(bot.entity.position);

            bot.lookAt(target.position.offset(0, target.height, 0));

            if (distance > pvpRange) {
                const dx = target.position.x - bot.entity.position.x;
                const dz = target.position.z - bot.entity.position.z;
                const angle = Math.atan2(-dx, -dz);
                
                bot.entity.yaw = angle;
                bot.setControlState('forward', true);
                bot.setControlState('sprint', true);
            } else {
                bot.setControlState('forward', false);
                bot.setControlState('sprint', false);

                if (!attackCooldown) {
                    bot.attack(target);
                    attackCooldown = true;
                    setTimeout(() => {
                        attackCooldown = false;
                    }, 500);
                }
            }

            if (distance < 3 && Math.random() < 0.3) {
                bot.setControlState('jump', true);
                setTimeout(() => bot.setControlState('jump', false), 100);
            }
        }
    }, 50);
}

