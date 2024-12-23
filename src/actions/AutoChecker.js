import { autoCheckPositions } from '../services/position.service.js';

export async function handleAutoCheck(selectedWallets, autoCheckAction, poolAddress) {
    try {
        if (selectedWallets.length === 0) {
            throw new Error("\x1b[31m~~~ [!] | ERROR | Необходимо выбрать хотя бы один кошелек\x1b[0m");
        }

        console.log("\n\x1b[36m[⌛] | WAITING | Запуск автоматической проверки позиций...\x1b[0m");
        await autoCheckPositions(selectedWallets, autoCheckAction, poolAddress);
    } catch (error) {
        console.error(`\x1b[31m~~~ [!] | ERROR | Ошибка в автопроверке: ${error.message}\x1b[0m`);
    }
} 