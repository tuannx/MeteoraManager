import { question } from '../utils/question.js';
import { processBuyToken, processSellAllTokens } from '../services/position.service.js';
import { returnToMainMenu } from '../utils/mainMenuReturn.js';
import { walletInfo } from '../services/wallet.service.js';

export async function handleSwapTokens(wallets, predefinedAction = null, predefinedSpecific = null) {
    try {
        if (!predefinedAction) {
            console.log(`\nSELECT AN ACTION:\n=========================`);
            console.log(`\x1b[36m-+-\x1b[0m 1: Buy token`);
            console.log(`\x1b[36m-+-\x1b[0m 2: Sell token`);
        }
        
        const action = predefinedAction ? predefinedAction : await question("\n[...] Select an action (1-2): ");

        if (action === '1') {
            const tokenAddress = await question("\n[...] Enter token address to buy: ");
            const solAmount = parseFloat(await question("\n[...] Enter the amount of SOL to buy: "));
            const buyPromises = wallets.map(wallet => processBuyToken(wallet, tokenAddress, solAmount));
            await Promise.all(buyPromises);
            console.log(`\n\x1b[36m[${new Date().toLocaleTimeString()}] | SUCCESS | Buying tokens completed\x1b[0m`);
            await walletInfo(wallets, true);
        } else if (action === '2') {
            if (!predefinedSpecific) {
                console.log(`\nSELECT AN ACTION:\n=========================`);
                console.log(`\x1b[36m-+-\x1b[0m 1: Sell all tokens`);
                console.log(`\x1b[36m-+-\x1b[0m 2: Sell specific token`);
            }
            const sellSpecific = predefinedSpecific ? predefinedSpecific : await question("\n[...] Select an action (1-2): ");
            
            if (sellSpecific === '2') {
                const tokenAddress = await question("\n[...] Enter token address to sell: ");
                const sellPromises = wallets.map(wallet => processSellAllTokens(wallet, tokenAddress));
                await Promise.all(sellPromises);
                console.log(`\n\x1b[36m[${new Date().toLocaleTimeString()}] | SUCCESS | Selling tokens completed\x1b[0m`);
                await walletInfo(wallets, true);
            } else if (sellSpecific === '1') {
                const sellPromises = wallets.map(wallet => processSellAllTokens(wallet));
                await Promise.all(sellPromises);
                console.log(`\n\x1b[36m[${new Date().toLocaleTimeString()}] | SUCCESS | Selling tokens completed\x1b[0m`);
                await walletInfo(wallets, true);
            } else {
                console.error(`\x1b[31m~~~ [!] | ERROR | Invalid choice\x1b[0m`);
                returnToMainMenu();
            }
        } else {
            console.error(`\x1b[31m~~~ [!] | ERROR | Invalid choice\x1b[0m`);
            returnToMainMenu();
        }
    } catch (error) {
        console.error(`\x1b[31m~~~ [!] | ERROR | Error during token swap: ${error}\x1b[0m`);
        returnToMainMenu();
    }
}
