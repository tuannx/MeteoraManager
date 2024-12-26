import { consolidateTokens } from '../services/utils.service.js';
import { processSellAllTokens } from '../services/position.service.js';
import { question } from '../utils/question.js';
import { getConnection, TOKEN_PROGRAM_ID } from '../config/index.js';
import { PublicKey } from '@solana/web3.js';
import { returnToMainMenu } from '../utils/mainMenuReturn.js';

export async function handleTokenConsolidation(MainWallet, selectedWallets) {
    try {
        if (selectedWallets.length < 2) {
            console.error(`\x1b[31m~~~ [!] | ERROR | Необходимо выбрать минимум 2 кошелька\x1b[0m\n`);
            returnToMainMenu();
        }

        const targetWallet = MainWallet;
        let consolidationComplete = false;

        while (!consolidationComplete) {
            console.log(`\n\x1b[36m[⌛] | WAITING | [${targetWallet.description.slice(0, 4)}..] Консолидация токенов\x1b[0m`);

            // Выполняем консолидацию
            const consolidationPromises = selectedWallets
                .filter(wallet => wallet.description !== targetWallet.description)
                .map(sourceWallet => 
                    consolidateTokens(sourceWallet, targetWallet)
                        .catch(error => {
                            console.error(`\x1b[31m~~~ [!] | ERROR | [${sourceWallet.description.slice(0, 4)}..] Ошибка при консолидации: ${error.message}\x1b[0m`);
                            returnToMainMenu();
                        })
                );

            await Promise.all(consolidationPromises);

            // Проверяем балансы исходных кошельков
            const checkBalances = await Promise.all(
                selectedWallets
                    .filter(wallet => wallet.description !== targetWallet.description)
                    .map(async (wallet) => {
                        const conn = await getConnection();
                        const accounts = await conn.getParsedTokenAccountsByOwner(
                            new PublicKey(wallet.description),
                            { programId: TOKEN_PROGRAM_ID }
                        );
                        return accounts.value.some(acc => acc.account.data.parsed.info.tokenAmount.uiAmount > 0);
                    })
            );

            const hasRemainingTokens = checkBalances.some(hasTokens => hasTokens);

            if (hasRemainingTokens) {
                const retryChoice = await question("\n[...] Обнаружены оставшиеся токены. Выберите действие (1: Повторить консолидацию, 2: Продолжить, 3: Завершить): ");
                if (retryChoice === "1") {
                    console.log("\n\x1b[36m[⌛] | WAITING | Повторная попытка консолидации...\x1b[0m");
                    continue;
                } else if (retryChoice === "3") {
                    console.log("\n\x1b[36m[⌛] | WAITING | Завершение консолидации...\x1b[0m");
                    returnToMainMenu();
                }
            }

            consolidationComplete = true;
        }

        const sellChoice = await question("\n[...] Желаете продать токены? (1: Да, 2: Нет): ");
        if (sellChoice === "1") {
            await new Promise(resolve => setTimeout(resolve, 12000));
            await processSellAllTokens(targetWallet);
            console.log(`\n\x1b[36m[${new Date().toLocaleTimeString()}] | SUCCESS | Консолидация и продажа завершена\x1b[0m`);
            returnToMainMenu();
        } else {
            console.log(`\n\x1b[36m[${new Date().toLocaleTimeString()}] | SUCCESS | Консолидация завершена\x1b[0m`);
            returnToMainMenu();
        }
    } catch (error) {
        console.error(`\x1b[31m~~~ [!] | ERROR | Ошибка при консолидации токенов: ${error.message}\x1b[0m`);
        returnToMainMenu();
    }
} 