# AI PVP Bot - Mineflayer Server

Node.js сервер для управления ботами в Minecraft через WebSocket API.

## Возможности

- ✅ Автоматическая атака при получении урона
- ✅ Умный pathfinding с обходом препятствий
- ✅ Bhop (bunny hop) для критов
- ✅ Автоматический спринт
- ✅ Автоматическое поедание еды
- ✅ Автоматический выбор лучшего оружия
- ✅ PVP плагин для продвинутого боя

## Установка

```bash
npm install
```

## Запуск

```bash
npm start
```

Сервер запустится на порту 8765.

## WebSocket API

### Создать бота
```json
{
  "command": "createBot",
  "params": {
    "username": "BotName",
    "host": "localhost",
    "port": 25565
  }
}
```

### Удалить бота
```json
{
  "command": "removeBot",
  "params": {
    "username": "BotName"
  }
}
```

### Список ботов
```json
{
  "command": "listBots",
  "params": {}
}
```

### Действие бота
```json
{
  "command": "botAction",
  "params": {
    "username": "BotName",
    "action": "chat",
    "actionParams": {
      "message": "Hello!"
    }
  }
}
```

## Автообновление

Мод автоматически проверяет версию при запуске сервера и обновляет файлы из этого репозитория если доступна новая версия.

Версия указана в `version.json`.
