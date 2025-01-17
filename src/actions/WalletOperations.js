import { walletInfo } from '../services/wallet.service.js';
import { returnToMainMenu } from '../utils/mainMenuReturn.js';


export async function handleWalletOperations(selectedWallets) {
    try {
        await walletInfo(selectedWallets, true);
    } catch (error) {
        console.error(`\x1b[31m~~~ [!] | ERROR | Error checking balances: ${error.message}\x1b[0m`);
        returnToMainMenu();
    }
}