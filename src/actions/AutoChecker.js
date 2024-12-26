import { autoCheckPositions } from '../services/position.service.js';
import { returnToMainMenu } from '../utils/mainMenuReturn.js';

export async function handleAutoCheck(selectedWallets, autoCheckAction, poolAddress, strategy) {
    try {
        if (selectedWallets.length === 0) {
            console.error(`\x1b[31m~~~ [!] | ERROR | Необходимо выбрать хотя бы один кошелек\x1b[0m\n`);
            returnToMainMenu();
        }
        await autoCheckPositions(selectedWallets, autoCheckAction, poolAddress, strategy);
    } catch (error) {
        console.error(`\x1b[31m~~~ [!] | ERROR | Ошибка в автопроверке: ${error.message}\x1b[0m\n`);
        returnToMainMenu();
    }
} 