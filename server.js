const WebSocket = require('ws');
const mineflayer = require('mineflayer');
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
const autoEat = require('mineflayer-auto-eat');
const armorManager = require('mineflayer-armor-manager');
const PORT = 8765;
const wss = new WebSocket.Server({ port: PORT });
const bots = new Map();
console.log(`Bot server started on port ${PORT}`);
process.on('uncaughtException', (error) => {
    console.error('[CRITICAL] Uncaught Exception:', error);
    console.error('Stack:', error.stack);
});
process.on('unhandledRejection', (reason, promise) => {
    console.error('[CRITICAL] Unhandled Rejection at:', promise);
    console.error('Reason:', reason);
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
        if (spawnPosition) {
            bot.spawnPosition = spawnPosition;
        }
        bot.on('spawn', () => {
            console.log(`[INFO] Bot ${username} spawned`);
            bot.loadPlugin(pathfinder);
            bot.loadPlugin(armorManager);
            bot.once('health', () => {
                try {
                    bot.loadPlugin(autoEat);
                    bot.autoEat.options = {
                        priority: 'foodPoints',
                        startAt: 16,
                        bannedFood: []
                    };
                    console.log(`[INFO] Auto-eat plugin loaded for ${username}`);
                } catch (error) {
                    console.error(`[ERROR] Failed to load auto-eat plugin:`, error);
                }
            });
            initializePVPSystem(bot);
            setTimeout(() => {
                equipBestArmor(bot);
                equipBestWeapon(bot);
                ensureTotemInOffhand(bot);
            }, 1000);
            bot.on('health', () => {
                if (bot.autoEat && bot.food < 16 && !bot.autoEat.isEating) {
                    bot.autoEat.eat();
                }
                ensureTotemInOffhand(bot);
                if (bot.health < 10) {
                    eatGoldenApple(bot);
                }
            });
            ws.send(JSON.stringify({ 
                success: true, 
                message: `Bot ${username} connected and spawned`,
                position: bot.entity.position,
                needsTeleport: !!spawnPosition
            }));
        });
        bot.on('entityHurt', (entity) => {
            if (entity === bot.entity) {
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
                stopCombat(bot);
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
function initializePVPSystem(bot) {
    bot.pvpState = {
        inCombat: false,
        currentTarget: null,
        lastAttackTime: 0,
        lastHitTime: 0,
        strafeDirection: 1,
        strafeTimer: 0,
        comboHits: 0,
        lastArmorCheck: 0,
        lastWeaponCheck: 0,
        lastPathUpdate: 0,
        isStuck: false,
        lastPosition: null,
        stuckTimer: 0
    };
    console.log(`[INFO] PVP system initialized for ${bot.username}`);
}
function attackEntity(bot, target) {
    if (bot.attackInterval) {
        clearInterval(bot.attackInterval);
    }
    console.log(`[INFO] Bot ${bot.username} starting attack on ${target.username || target.name}`);
    equipBestArmor(bot);
    equipBestWeapon(bot);
    ensureTotemInOffhand(bot);
    const mcData = require('minecraft-data')(bot.version);
    const defaultMove = new Movements(bot, mcData);
    defaultMove.canDig = false;
    defaultMove.scafoldingBlocks = [];
    defaultMove.allowSprinting = true;
    defaultMove.allowParkour = true;
    defaultMove.allowFreeMotion = true;
    bot.pathfinder.setMovements(defaultMove);
    bot.pvpState.inCombat = true;
    bot.pvpState.currentTarget = target;
    bot.setControlState('sprint', true);
    bot.attackInterval = setInterval(() => {
        const loopStart = Date.now();
        const timings = {};
        let lastStep = loopStart;
        try {
            if (!target.isValid || !target.position) {
                stopCombat(bot);
                return;
            }
            timings.validation = Date.now() - lastStep;
            lastStep = Date.now();
            const distance = target.position.distanceTo(bot.entity.position);
            if (distance > 32) {
                console.log(`[INFO] Target too far (${distance.toFixed(1)}), stopping combat`);
                stopCombat(bot);
                return;
            }
            timings.distance = Date.now() - lastStep;
            lastStep = Date.now();
            const now = Date.now();
            if (now - bot.pvpState.lastArmorCheck > 5000) {
                equipBestArmor(bot);
                bot.pvpState.lastArmorCheck = now;
            }
            if (now - bot.pvpState.lastWeaponCheck > 3000) {
                equipBestWeapon(bot);
                bot.pvpState.lastWeaponCheck = now;
            }
            timings.equipment = Date.now() - lastStep;
            lastStep = Date.now();
            if (bot.health < 12) {
                eatGoldenApple(bot);
            } else if (bot.autoEat && bot.food < 16 && !bot.autoEat.isEating) {
                bot.autoEat.eat();
            }
            ensureTotemInOffhand(bot);
            timings.healing = Date.now() - lastStep;
            lastStep = Date.now();
            const targetOnGround = target.onGround !== undefined ? target.onGround : true;
            if (distance > 8 && distance < 25) {
                shootBow(bot, target);
                if (targetOnGround) {
                    const goal = new goals.GoalFollow(target, 3);
                    bot.pathfinder.setGoal(goal, true);
                } else {
                    bot.pathfinder.setGoal(null);
                    bot.clearControlStates();
                    bot.setControlState('forward', true);
                    bot.setControlState('sprint', true);
                }
                timings.ranged = Date.now() - lastStep;
                timings.total = Date.now() - loopStart;
                if (timings.total > 50) {
                    console.log(`[PERF] Combat loop took ${timings.total}ms:`, JSON.stringify(timings));
                }
                return;
            }
            const targetPos = target.position.offset(0, target.height * 0.85, 0);
            bot.lookAt(targetPos, false); // false = не форсировать, снижает нагрузку
            timings.lookAt = Date.now() - lastStep;
            lastStep = Date.now();
            if (distance > 4) {
                if (targetOnGround) {
                    const goal = new goals.GoalFollow(target, 2.5);
                    bot.pathfinder.setGoal(goal, true);
                    bot.setControlState('sprint', true);
                } else {
                    bot.pathfinder.setGoal(null);
                    bot.clearControlStates();
                    bot.setControlState('forward', true);
                    bot.setControlState('sprint', true);
                }
            } else if (distance > 2.5) {
                bot.pathfinder.setGoal(null);
                bot.pvpState.strafeTimer++;
                if (bot.pvpState.strafeTimer > 8) {
                    bot.pvpState.strafeDirection *= -1;
                    bot.pvpState.strafeTimer = 0;
                }
                bot.clearControlStates();
                bot.setControlState('sprint', true);
                bot.setControlState('forward', true);
                if (bot.pvpState.strafeDirection > 0) {
                    bot.setControlState('right', true);
                } else {
                    bot.setControlState('left', true);
                }
            } else {
                bot.pathfinder.setGoal(null);
                bot.clearControlStates();
                if (bot.pvpState.comboHits > 0 && bot.pvpState.comboHits % 2 === 0) {
                    bot.setControlState('forward', false);
                    bot.setControlState('sprint', false);
                    setTimeout(() => {
                        bot.setControlState('forward', true);
                        bot.setControlState('sprint', true);
                    }, 50);
                } else {
                    bot.setControlState('forward', true);
                    bot.setControlState('sprint', true);
                }
            }
            const attackCooldown = 550; // Оптимальный таймінг для мечей
            if (distance < 4.2 && now - bot.pvpState.lastAttackTime > attackCooldown) {
                bot.attack(target);
                bot.pvpState.lastAttackTime = now;
                bot.pvpState.comboHits++;
                if (now - bot.pvpState.lastHitTime > 2000) {
                    bot.pvpState.comboHits = 0;
                }
                bot.pvpState.lastHitTime = now;
            }
            const timeUntilNextAttack = attackCooldown - (now - bot.pvpState.lastAttackTime);
            if (bot.entity.onGround && distance < 4 && timeUntilNextAttack < 100) {
                bot.setControlState('jump', true);
                setTimeout(() => bot.setControlState('jump', false), 100);
            }
            if (distance < 3 && timeUntilNextAttack > 200) {
                useShield(bot);
            } else {
                stopUsingShield(bot);
            }
        } catch (error) {
            console.error(`[ERROR] Combat loop error:`, error);
        }
    }, 100); // 100ms для снижения нагрузки
}
function stopCombat(bot) {
    if (bot.attackInterval) {
        clearInterval(bot.attackInterval);
        bot.attackInterval = null;
    }
    bot.pathfinder.setGoal(null);
    bot.clearControlStates();
    stopUsingShield(bot);
    if (bot.pvpState) {
        bot.pvpState.inCombat = false;
        bot.pvpState.currentTarget = null;
        bot.pvpState.comboHits = 0;
    }
    console.log(`[INFO] Bot ${bot.username} stopped combat`);
}
function equipBestArmor(bot) {
    try {
        const armorSlots = {
            head: 5,
            torso: 6,
            legs: 7,
            feet: 8
        };
        const armorPriority = ['netherite', 'diamond', 'iron', 'chainmail', 'golden', 'leather'];
        for (const [slot, slotId] of Object.entries(armorSlots)) {
            const currentArmor = bot.inventory.slots[slotId];
            const armorPieces = bot.inventory.items().filter(item => {
                return (item.name.includes('helmet') && slot === 'head') ||
                       (item.name.includes('chestplate') && slot === 'torso') ||
                       (item.name.includes('leggings') && slot === 'legs') ||
                       (item.name.includes('boots') && slot === 'feet');
            });
            if (armorPieces.length > 0) {
                armorPieces.sort((a, b) => {
                    const priorityA = armorPriority.findIndex(mat => a.name.includes(mat));
                    const priorityB = armorPriority.findIndex(mat => b.name.includes(mat));
                    return priorityA - priorityB;
                });
                const bestArmor = armorPieces[0];
                if (!currentArmor || getArmorValue(bestArmor.name) > getArmorValue(currentArmor.name)) {
                    bot.equip(bestArmor, slot);
                }
            }
        }
    } catch (error) {
        console.error('[ERROR] Failed to equip armor:', error.message);
    }
}
function getArmorValue(name) {
    if (name.includes('netherite')) return 10;
    if (name.includes('diamond')) return 9;
    if (name.includes('iron')) return 7;
    if (name.includes('chainmail')) return 5;
    if (name.includes('golden')) return 4;
    if (name.includes('leather')) return 3;
    return 0;
}
function equipBestWeapon(bot) {
    try {
        const weapons = bot.inventory.items().filter(item => 
            item.name.includes('sword') || 
            item.name.includes('axe') ||
            item.name.includes('trident')
        );
        if (weapons.length > 0) {
            weapons.sort((a, b) => {
                const damageA = getWeaponDamage(a.name);
                const damageB = getWeaponDamage(b.name);
                return damageB - damageA;
            });
            const currentWeapon = bot.inventory.slots[bot.quickBarSlot + 36];
            const bestWeapon = weapons[0];
            if (!currentWeapon || getWeaponDamage(bestWeapon.name) > getWeaponDamage(currentWeapon.name)) {
                bot.equip(bestWeapon, 'hand');
            }
        }
    } catch (error) {
        console.error('[ERROR] Failed to equip weapon:', error.message);
    }
}
function getWeaponDamage(name) {
    if (name.includes('netherite_sword')) return 12;
    if (name.includes('diamond_sword')) return 11;
    if (name.includes('iron_sword')) return 9;
    if (name.includes('stone_sword')) return 7;
    if (name.includes('wooden_sword')) return 6;
    if (name.includes('netherite_axe')) return 15;
    if (name.includes('diamond_axe')) return 14;
    if (name.includes('iron_axe')) return 12;
    if (name.includes('stone_axe')) return 10;
    if (name.includes('wooden_axe')) return 8;
    if (name.includes('trident')) return 13;
    return 1;
}
function ensureTotemInOffhand(bot) {
    try {
        const offhand = bot.inventory.slots[45]; // Оффханд слот
        if (!offhand || offhand.name !== 'totem_of_undying') {
            const totem = bot.inventory.items().find(item => item.name === 'totem_of_undying');
            if (totem) {
                bot.equip(totem, 'off-hand');
                console.log(`[INFO] Equipped totem in offhand for ${bot.username}`);
            }
        }
    } catch (error) {
        console.error('[ERROR] Failed to equip totem:', error.message);
    }
}
function eatGoldenApple(bot) {
    try {
        if (bot.usingItem) return;
        const enchantedGapple = bot.inventory.items().find(item => item.name === 'enchanted_golden_apple');
        const gapple = bot.inventory.items().find(item => item.name === 'golden_apple');
        const appleToEat = enchantedGapple || gapple;
        if (appleToEat) {
            console.log(`[INFO] ${bot.username} eating ${appleToEat.name}`);
            const currentWeapon = bot.inventory.slots[bot.quickBarSlot + 36];
            bot.equip(appleToEat, 'hand').then(() => {
                bot.consume().then(() => {
                    if (currentWeapon) {
                        bot.equip(currentWeapon, 'hand').catch(() => {});
                    }
                }).catch(err => {
                    console.error('[ERROR] Failed to consume apple:', err.message);
                });
            }).catch(err => {
                console.error('[ERROR] Failed to equip apple:', err.message);
            });
        }
    } catch (error) {
        console.error('[ERROR] Failed to eat golden apple:', error.message);
    }
}
function shootBow(bot, target) {
    try {
        if (bot.usingItem) return;
        const bow = bot.inventory.items().find(item => item.name === 'bow');
        const arrow = bot.inventory.items().find(item => item.name === 'arrow');
        if (bow && arrow) {
            const currentWeapon = bot.inventory.slots[bot.quickBarSlot + 36];
            if (!currentWeapon || currentWeapon.name !== 'bow') {
                bot.equip(bow, 'hand').then(() => {
                    shootArrow(bot, target, currentWeapon);
                }).catch(err => {
                    console.error('[ERROR] Failed to equip bow:', err.message);
                });
            } else {
                shootArrow(bot, target, currentWeapon);
            }
        }
    } catch (error) {
        console.error('[ERROR] Failed to shoot bow:', error.message);
    }
}
function shootArrow(bot, target, previousWeapon) {
    try {
        const distance = target.position.distanceTo(bot.entity.position);
        const heightOffset = target.height + (distance * 0.05); // Компенсация гравитации
        bot.lookAt(target.position.offset(0, heightOffset, 0), false);
        bot.activateItem();
        const chargeTime = Math.min(1000, distance * 40); // Максимум 1 секунда
        setTimeout(() => {
            bot.deactivateItem();
            if (previousWeapon && previousWeapon.name !== 'bow') {
                setTimeout(() => {
                    bot.equip(previousWeapon, 'hand').catch(() => {});
                }, 200);
            }
        }, chargeTime);
    } catch (error) {
        console.error('[ERROR] Failed to shoot arrow:', error.message);
    }
}
function useShield(bot) {
    try {
        const offhand = bot.inventory.slots[45];
        if (offhand && offhand.name === 'shield' && !bot.usingItem) {
            bot.activateItem(true); // true = оффханд
        }
    } catch (error) {
        console.error('[ERROR] Failed to use shield:', error.message);
    }
}
function stopUsingShield(bot) {
    try {
        const offhand = bot.inventory.slots[45];
        if (offhand && offhand.name === 'shield' && bot.usingItem) {
            bot.deactivateItem();
        }
    } catch (error) {
        console.error('[ERROR] Failed to stop using shield:', error.message);
    }
}
