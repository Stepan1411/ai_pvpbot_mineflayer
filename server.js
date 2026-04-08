const WebSocket = require('ws');
const mineflayer = require('mineflayer');
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
const autoEat = require('mineflayer-auto-eat');
const armorManager = require('mineflayer-armor-manager');

const PORT = 8765;
const wss = new WebSocket.Server({ port: PORT });

const bots = new Map();

console.log(`Bot server started on port ${PORT}`);

// Обработка критических ошибок
process.on('uncaughtException', (error) => {
    console.error('[CRITICAL] Uncaught Exception:', error);
    console.error('Stack:', error.stack);
    // Не выключаем процесс, пытаемся продолжить работу
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('[CRITICAL] Unhandled Rejection at:', promise);
    console.error('Reason:', reason);
    // Не выключаем процесс, пытаемся продолжить работу
});

process.on('SIGTERM', () => {
    console.log('[INFO] SIGTERM received, shutting down gracefully...');
    wss.close(() => {
        console.log('[INFO] WebSocket server closed');
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    console.log('[INFO] SIGINT received, shutting down gracefully...');
    wss.close(() => {
        console.log('[INFO] WebSocket server closed');
        process.exit(0);
    });
});

// Логируем состояние каждые 30 секунд
setInterval(() => {
    console.log(`[HEARTBEAT] Server alive. Active bots: ${bots.size}`);
}, 30000);

wss.on('connection', (ws) => {
    console.log('[INFO] New WebSocket connection established');
    
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            handleCommand(ws, data);
        } catch (error) {
            console.error('[ERROR] Failed to parse message:', error);
            ws.send(JSON.stringify({ error: 'Invalid JSON' }));
        }
    });
    
    ws.on('close', () => {
        console.log('[INFO] WebSocket connection closed');
    });
    
    ws.on('error', (error) => {
        console.error('[ERROR] WebSocket error:', error);
    });
});

wss.on('error', (error) => {
    console.error('[ERROR] WebSocket Server error:', error);
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
            bot.loadPlugin(armorManager);
            bot.loadPlugin(autoEat);
            
            // Настраиваем auto-eat
            bot.autoEat.options = {
                priority: 'foodPoints',
                startAt: 14,
                bannedFood: []
            };
            
            // Автоматически едим когда голодны
            bot.on('health', () => {
                if (bot.food < 14 && !bot.autoEat.isEating) {
                    bot.autoEat.eat();
                }
                
                // Проверяем тотем в оффханде
                ensureTotemInOffhand(bot);
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
            console.error(`[ERROR] Bot ${username} error:`, err);
            ws.send(JSON.stringify({ 
                event: 'error',
                username: username,
                error: err.message 
            }));
        });

        bot.on('kicked', (reason) => {
            console.log(`[INFO] Bot ${username} was kicked: ${reason}`);
            bots.delete(username);
            ws.send(JSON.stringify({ 
                event: 'kicked', 
                username: username, 
                reason: reason 
            }));
        });

        bot.on('end', () => {
            console.log(`[INFO] Bot ${username} disconnected`);
            bots.delete(username);
        });

        bots.set(username, bot);

        ws.send(JSON.stringify({ 
            success: true, 
            message: `Bot ${username} is connecting...` 
        }));

    } catch (error) {
        console.error(`[ERROR] Failed to create bot ${username}:`, error);
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
    
    // Экипируем лучшее оружие и броню
    equipBestWeapon(bot);
    
    // Настраиваем движения для PVP
    const mcData = require('minecraft-data')(bot.version);
    const defaultMove = new Movements(bot, mcData);
    defaultMove.canDig = false;
    defaultMove.scafoldingBlocks = [];
    defaultMove.allowSprinting = true;
    bot.pathfinder.setMovements(defaultMove);

    // Включаем спринт
    bot.setControlState('sprint', true);
    
    let lastAttackTime = 0;
    let strafeDirection = 1; // 1 = вправо, -1 = влево
    let strafeTimer = 0;

    // Логика атаки и движения
    bot.attackInterval = setInterval(() => {
        if (!target.isValid || target.position.distanceTo(bot.entity.position) > 32) {
            clearInterval(bot.attackInterval);
            bot.attackInterval = null;
            bot.pathfinder.setGoal(null);
            bot.clearControlStates();
            return;
        }

        const distance = target.position.distanceTo(bot.entity.position);
        const now = Date.now();

        // === ЛЕЧЕНИЕ ===
        // Проверяем здоровье и едим золотое яблоко если критично
        if (bot.health < 10) {
            eatGoldenApple(bot);
        } else if (bot.food < 14 && !bot.autoEat.isEating) {
            bot.autoEat.eat();
        }

        // Проверяем тотем в оффханде
        ensureTotemInOffhand(bot);

        // === ДАЛЬНИЙ БОЙ ===
        // Если далеко - стреляем из лука
        if (distance > 10 && distance < 30) {
            shootBow(bot, target);
            const goal = new goals.GoalFollow(target, 8);
            bot.pathfinder.setGoal(goal, true);
            return;
        }

        // === БЛИЖНИЙ БОЙ ===
        // Поворачиваемся к цели
        bot.lookAt(target.position.offset(0, target.height * 0.9, 0));

        // Движение к цели или страфинг
        if (distance > 3.5) {
            // Далеко - идём к цели
            const goal = new goals.GoalFollow(target, 2.5);
            bot.pathfinder.setGoal(goal, true);
        } else if (distance > 2) {
            // Средняя дистанция - страфинг
            bot.pathfinder.setGoal(null);
            
            strafeTimer++;
            if (strafeTimer > 10) {
                strafeDirection *= -1;
                strafeTimer = 0;
            }
            
            if (strafeDirection > 0) {
                bot.setControlState('right', true);
                bot.setControlState('left', false);
            } else {
                bot.setControlState('left', true);
                bot.setControlState('right', false);
            }
            bot.setControlState('forward', true);
        } else {
            // Близко - атакуем
            bot.pathfinder.setGoal(null);
            bot.clearControlStates();
            bot.setControlState('sprint', true);
        }

        // === АТАКА ===
        // Атакуем с правильным таймингом (1.9+ combat)
        const attackCooldown = 600; // ~0.6 секунды между атаками
        if (distance < 4 && now - lastAttackTime > attackCooldown) {
            bot.attack(target);
            lastAttackTime = now;
        }

        // === BHOP ===
        // Прыгаем для критов и скорости
        if (bot.entity.onGround && distance > 2 && distance < 8) {
            bot.setControlState('jump', true);
        } else {
            bot.setControlState('jump', false);
        }

        // === ЩИТ ===
        // Блокируем если враг близко и мы не атакуем
        if (distance < 3 && now - lastAttackTime < attackCooldown / 2) {
            useShield(bot);
        }

    }, 50); // Проверяем каждые 50ms для быстрой реакции
}

function equipBestWeapon(bot) {
    try {
        // Ищем лучшее оружие
        const weapons = bot.inventory.items().filter(item => 
            item.name.includes('sword') || 
            item.name.includes('axe') ||
            item.name.includes('trident')
        );
        
        if (weapons.length > 0) {
            // Сортируем по урону (diamond > iron > stone > wood)
            weapons.sort((a, b) => {
                const damageA = getWeaponDamage(a.name);
                const damageB = getWeaponDamage(b.name);
                return damageB - damageA;
            });
            
            bot.equip(weapons[0], 'hand');
        }
    } catch (error) {
        // Игнорируем ошибки экипировки
    }
}

function getWeaponDamage(name) {
    if (name.includes('netherite')) return 10;
    if (name.includes('diamond')) return 9;
    if (name.includes('iron')) return 7;
    if (name.includes('stone')) return 6;
    if (name.includes('wood')) return 5;
    return 1;
}

function ensureTotemInOffhand(bot) {
    try {
        const offhand = bot.inventory.slots[45]; // Оффханд слот
        
        // Если в оффханде нет тотема
        if (!offhand || offhand.name !== 'totem_of_undying') {
            const totem = bot.inventory.items().find(item => item.name === 'totem_of_undying');
            if (totem) {
                bot.equip(totem, 'off-hand');
            }
        }
    } catch (error) {
        // Игнорируем ошибки
    }
}

function eatGoldenApple(bot) {
    try {
        const gapple = bot.inventory.items().find(item => 
            item.name === 'golden_apple' || item.name === 'enchanted_golden_apple'
        );
        
        if (gapple) {
            bot.equip(gapple, 'hand').then(() => {
                bot.consume();
            });
        }
    } catch (error) {
        // Игнорируем ошибки
    }
}

function shootBow(bot, target) {
    try {
        const bow = bot.inventory.items().find(item => item.name === 'bow');
        const arrow = bot.inventory.items().find(item => item.name === 'arrow');
        
        if (bow && arrow && !bot.usingItem) {
            bot.equip(bow, 'hand').then(() => {
                bot.lookAt(target.position.offset(0, target.height, 0));
                bot.activateItem(); // Начинаем натягивать лук
                
                // Отпускаем через 1 секунду (полная зарядка)
                setTimeout(() => {
                    bot.deactivateItem();
                }, 1000);
            });
        }
    } catch (error) {
        // Игнорируем ошибки
    }
}

function useShield(bot) {
    try {
        const shield = bot.inventory.items().find(item => item.name === 'shield');
        
        if (shield && !bot.usingItem) {
            const offhand = bot.inventory.slots[45];
            if (offhand && offhand.name === 'shield') {
                bot.activateItem(true); // true = оффханд
            }
        }
    } catch (error) {
        // Игнорируем ошибки
    }
}
