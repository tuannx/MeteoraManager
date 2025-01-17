import { consolidateTokens } from '../services/utils.service.js';
import { processSellAllTokens } from '../services/position.service.js';
import { question } from '../utils/question.js';
import { getConnection, TOKEN_PROGRAM_ID } from '../config/index.js';
import { PublicKey } from '@solana/web3.js';
import { returnToMainMenu } from '../utils/mainMenuReturn.js';

export async function handleTokenConsolidation(MainWallet, selectedWallets) {
    try {
        if (selectedWallets.length < 2) {
            console.error(`\x1b[31m~~~ [!] | ERROR | You must select at least 2 wallets\x1b[0m\n`);
            returnToMainMenu();
        }

        const targetWallet = MainWallet;
        let consolidationComplete = false;

        while (!consolidationComplete) {
            console.log(`\n\x1b[36m[⌛] | WAITING | [${targetWallet.description.slice(0, 4)}..] Consolidating tokens\x1b[0m`);

            // Performing consolidation
            const consolidationPromises = selectedWallets
                .filter(wallet => wallet.description !== targetWallet.description)
                .map(sourceWallet => 
                    consolidateTokens(sourceWallet, targetWallet)
                        .catch(error => {
                            console.error(`\x1b[31m~~~ [!] | ERROR | [${sourceWallet.description.slice(0, 4)}..] Error during consolidation: ${error.message}\x1b[0m`);
                            returnToMainMenu();
                        })
                );

            await Promise.all(consolidationPromises);

            // Checking balances of source wallets
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
                const retryChoice = await question("\n[...] Remaining tokens detected. Select an action (1: Retry consolidation, 2: Continue, 3: Finish): ");
                if (retryChoice === "1") {
                    console.log("\n\x1b[36m[⌛] | WAITING | Retrying consolidation...\x1b[0m");
                    continue;
                } else if (retryChoice === "3") {
                    console.log("\n\x1b[36m[⌛] | WAITING | Finishing consolidation...\x1b[0m");
                    returnToMainMenu();
                }
            }

            consolidationComplete = true;
        }

        const sellChoice = await question("\n[...] Do you want to sell tokens? (1: Yes, 2: No): ");
        if (sellChoice === "1") {
            await new Promise(resolve => setTimeout(resolve, 10000));
            await processSellAllTokens(targetWallet);
            console.log(`\n\x1b[36m[${new Date().toLocaleTimeString()}] | SUCCESS | Consolidation and sale completed\x1b[0m`);
            returnToMainMenu();
        } else {
            console.log(`\n\x1b[36m[${new Date().toLocaleTimeString()}] | SUCCESS | Consolidation completed\x1b[0m`);
            returnToMainMenu();
        }
    } catch (error) {
        console.error(`\x1b[31m~~~ [!] | ERROR | Error during token consolidation: ${error.message}\x1b[0m`);
        returnToMainMenu();
    }
} 