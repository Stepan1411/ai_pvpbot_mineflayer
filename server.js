const WebSocket = require('ws');
const mineflayer = require('mineflayer');
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
const pvp = require('mineflayer-pvp').plugin;
const autoEat = require('mineflayer-auto-eat');
const toolPlugin = require('mineflayer-tool').plugin;

const PORT = 8765;
const wss = new WebSocket.Server({ port: PORT });

const bots = new Map();

console.log(`Bot server started on port ${PORT}`);

wss.on('connection', (ws) => {
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            handleCommand(ws, data);
        } catch (error) {
            ws.send(JSON.stringify({ error: 'Invalid JSON' }));
        }
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
    const { username, host, port, version, spawnPosition } = params;

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
            version: version || false,
            auth: 'offline',
            hideErrors: false
        });

        // Сохраняем позицию спавна для последующей телепортации
        if (spawnPosition) {
            bot.spawnPosition = spawnPosition;
        }

        bot.on('spawn', () => {
            // Загружаем плагины
            bot.loadPlugin(pathfinder);
            bot.loadPlugin(pvp);
            bot.loadPlugin(toolPlugin);
            bot.loadPlugin(autoEat);
            
            // Настраиваем auto-eat
            bot.autoEat.options = {
                priority: 'foodPoints',
                startAt: 14,
                bannedFood: []
            };
            
            // Автоматически едим когда голодны
            bot.on('health', () => {
                if (bot.food < 14) {
                    bot.autoEat.eat();
                }
            });
            
            ws.send(JSON.stringify({ 
                success: true, 
                message: `Bot ${username} connected and spawned`,
                position: bot.entity.position,
                needsTeleport: !!spawnPosition
            }));
        });

        // Атакуем обидчика когда бота ударят
        bot.on('entityHurt', (entity) => {
            if (entity === bot.entity) {
                // Бота ударили, находим ближайшего игрока и атакуем
                const attacker = findNearestPlayer(bot);
                if (attacker) {
                    attackEntity(bot, attacker);
                }
            }
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

        bot.on('end', () => {
            bots.delete(username);
        });

        bots.set(username, bot);

        ws.send(JSON.stringify({ 
            success: true, 
            message: `Bot ${username} is connecting...` 
        }));

    } catch (error) {
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
                if (actionParams && actionParams.message) {
                    bot.chat(actionParams.message);
                    ws.send(JSON.stringify({ 
                        success: true, 
                        message: 'Chat sent' 
                    }));
                }
                break;
                
            case 'stopAttack':
                if (bot.attackInterval) {
                    clearInterval(bot.attackInterval);
                    bot.attackInterval = null;
                }
                if (bot.pvp.target) {
                    bot.pvp.stop();
                }
                bot.pathfinder.setGoal(null);
                bot.clearControlStates();
                ws.send(JSON.stringify({ 
                    success: true, 
                    message: 'Bot stopped attacking' 
                }));
                break;
                
            default:
                ws.send(JSON.stringify({ 
                    success: false, 
                    error: 'Unknown action' 
                }));
        }
    } catch (error) {
        ws.send(JSON.stringify({ 
            success: false, 
            error: error.message 
        }));
    }
}

function findNearestPlayer(bot) {
    let nearest = null;
    let minDistance = Infinity;

    for (const entity of Object.values(bot.entities)) {
        if (entity.type === 'player' && entity !== bot.entity) {
            const distance = bot.entity.position.distanceTo(entity.position);
            if (distance < minDistance && distance < 16) { // В радиусе 16 блоков
                minDistance = distance;
                nearest = entity;
            }
        }
    }

    return nearest;
}

function attackEntity(bot, target) {
    // Останавливаем предыдущую атаку если была
    if (bot.attackInterval) {
        clearInterval(bot.attackInterval);
    }
    if (bot.pvp.target) {
        bot.pvp.stop();
    }
    
    // Экипируем лучшее оружие
    equipBestWeapon(bot);
    
    // Настраиваем движения для PVP
    const mcData = require('minecraft-data')(bot.version);
    const defaultMove = new Movements(bot, mcData);
    defaultMove.canDig = false;
    defaultMove.scafoldingBlocks = [];
    bot.pathfinder.setMovements(defaultMove);

    // Включаем спринт постоянно
    bot.setControlState('sprint', true);

    // Запускаем PVP атаку
    bot.pvp.attack(target);

    // Дополнительная логика для bhop и критов
    bot.attackInterval = setInterval(() => {
        if (!target.isValid || target.position.distanceTo(bot.entity.position) > 32) {
            clearInterval(bot.attackInterval);
            bot.attackInterval = null;
            bot.pvp.stop();
            bot.setControlState('sprint', false);
            return;
        }

        const distance = target.position.distanceTo(bot.entity.position);

        // Проверяем здоровье и едим если нужно
        if (bot.food < 14 && !bot.autoEat.isEating) {
            bot.autoEat.eat();
        }

        // Bhop только когда на земле и в правильном диапазоне
        if (bot.entity.onGround && distance > 2.5 && distance < 8) {
            bot.setControlState('jump', true);
        } else {
            bot.setControlState('jump', false);
        }

    }, 150);
}

function equipBestWeapon(bot) {
    try {
        // Используем tool плагин для выбора лучшего оружия
        const weapon = bot.inventory.items().find(item => 
            item.name.includes('sword') || 
            item.name.includes('axe') ||
            item.name.includes('trident')
        );
        
        if (weapon) {
            bot.equip(weapon, 'hand');
        }
    } catch (error) {
        // Игнорируем ошибки экипировки
    }
}
