import { question } from '../utils/question.js';
import { processBuyToken, processSellAllTokens } from '../services/position.service.js';
import { returnToMainMenu } from '../utils/mainMenuReturn.js';
import { walletInfo } from '../services/wallet.service.js';

export async function handleSwapTokens(wallets, predefinedAction = null, predefinedSpecific = null) {
    try {
        if (!predefinedAction) {
            console.log(`\nВЫБЕРИТЕ ДЕЙСТВИЕ:\n=========================`);
            console.log(`\x1b[36m-+-\x1b[0m 1: Купить токен`);
            console.log(`\x1b[36m-+-\x1b[0m 2: Продать токен`);
        }
        
        const action = predefinedAction ? predefinedAction : await question("\n[...] Выберите действие (1-2): ");

        if (action === '1') {
            const tokenAddress = await question("\n[...] Введите адрес токена для покупки: ");
            const solAmount = parseFloat(await question("\n[...] Введите количество SOL для покупки: "));
            const buyPromises = wallets.map(wallet => processBuyToken(wallet, tokenAddress, solAmount));
            await Promise.all(buyPromises);
            console.log(`\n\x1b[36m[${new Date().toLocaleTimeString()}] | SUCCESS | Покупка токенов завершена\x1b[0m`);
            await walletInfo(wallets, true);
        } else if (action === '2') {
            if (!predefinedSpecific) {
                console.log(`\nВЫБЕРИТЕ ДЕЙСТВИЕ:\n=========================`);
                console.log(`\x1b[36m-+-\x1b[0m 1: Продать все токены`);
                console.log(`\x1b[36m-+-\x1b[0m 2: Продать конкретный токен`);
            }
            const sellSpecific = predefinedSpecific ? predefinedSpecific : await question("\n[...] Выберите действие (1-2): ");
            
            if (sellSpecific === '2') {
                const tokenAddress = await question("\n[...] Введите адрес токена для продажи: ");
                const sellPromises = wallets.map(wallet => processSellAllTokens(wallet, tokenAddress));
                await Promise.all(sellPromises);
                console.log(`\n\x1b[36m[${new Date().toLocaleTimeString()}] | SUCCESS | Продажа токенов завершена\x1b[0m`);
                await walletInfo(wallets, true);
            } else if (sellSpecific === '1') {
                const sellPromises = wallets.map(wallet => processSellAllTokens(wallet));
                await Promise.all(sellPromises);
                console.log(`\n\x1b[36m[${new Date().toLocaleTimeString()}] | SUCCESS | Продажа токенов завершена\x1b[0m`);
                await walletInfo(wallets, true);
            } else {
                console.error(`\x1b[31m~~~ [!] | ERROR | Некорректный выбор\x1b[0m`);
                returnToMainMenu();
            }
        } else {
            console.error(`\x1b[31m~~~ [!] | ERROR | Некорректный выбор\x1b[0m`);
            returnToMainMenu();
        }
    } catch (error) {
        console.error(`\x1b[31m~~~ [!] | ERROR | Ошибка при свапе токенов: ${error}\x1b[0m`);
        returnToMainMenu();
    }
}
