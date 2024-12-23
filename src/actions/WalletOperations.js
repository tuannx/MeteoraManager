import { walletInfo } from '../services/wallet.service.js';

export async function handleWalletOperations(selectedWallets) {
    try {
        await walletInfo(selectedWallets, true);
    } catch (error) {
        console.error(`\x1b[31m~~~ [!] | ERROR | Ошибка при проверке балансов: ${error.message}\x1b[0m`);
        process.exit(1);
    }
} 