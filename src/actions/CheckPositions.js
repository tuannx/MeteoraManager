import { displayPositionsTable } from '../services/wallet.service.js';

export async function handleCheckPositions(selectedWallets) {
    try {
        await displayPositionsTable(selectedWallets, true);
    } catch (error) {
        console.error(`\x1b[31m~~~ [!] | ERROR | Ошибка при проверке позиций: ${error.message}\x1b[0m`);
    }
} 