import { displayPositionsTable } from '../services/wallet.service.js';
import { returnToMainMenu } from '../utils/mainMenuReturn.js';

export async function handleCheckPositions(selectedWallets) {
    try {
        await displayPositionsTable(selectedWallets, true);
    } catch (error) {
        console.error(`\x1b[31m~~~ [!] | ERROR | Error checking positions: ${error.message}\x1b[0m`);
        returnToMainMenu();
    }
} 