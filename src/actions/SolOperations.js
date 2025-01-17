import { distributeSol, consolidateSol } from '../services/utils.service.js';
import { question } from '../utils/question.js';
import { getSolBalance } from '../utils/getBalance.js';
import { returnToMainMenu } from '../utils/mainMenuReturn.js';

export async function handleSolDistribution(MainWallet, selectedWallets) {
    try {
        if (selectedWallets.length < 1) {
            console.error(`\x1b[31m~~~ [!] | ERROR | You must select at least 1 wallet\x1b[0m\n`);
            returnToMainMenu();
        }

        const sourceWallet = MainWallet;
        const targetWallets = selectedWallets.slice(1);
        
        // Request amount for distribution
        const FastSolDistribution = await question("\n[...] Distribute SOL to all wallets\n1: Yes\n2: No\nSelect: ");
        const solAmount = FastSolDistribution === '1' ? await fastSolDistribution(sourceWallet, targetWallets) : parseFloat(await question("\n[...] Enter the amount of SOL to distribute: "));
        
        if (isNaN(solAmount) || solAmount <= 0) {
            console.error(`\x1b[31m~~~ [!] | ERROR | Invalid SOL amount\x1b[0m\n`);
            returnToMainMenu();
        }
        // Distribute SOL
        await distributeSol(sourceWallet, targetWallets, solAmount);
        console.log(`\n\x1b[36m[${new Date().toLocaleTimeString()}] | SUCCESS | SOL distribution completed\x1b[0m`);
        returnToMainMenu();
    } catch (error) {
        console.error(`\x1b[31m~~~ [!] | ERROR | Error during SOL distribution: ${error.message}\x1b[0m`);
        returnToMainMenu();
    }
}

export async function handleSolConsolidation(MainWallet, selectedWallets) {
    try {
        if (selectedWallets.length < 2) {
            console.error(`\x1b[31m~~~ [!] | ERROR | You must select at least 2 wallets\x1b[0m\n`);
            returnToMainMenu();
        }

        const targetWallet = MainWallet;

        console.log(`\n\x1b[36m[⌛] | WAITING | Consolidating SOL to wallet [${targetWallet.description.slice(0, 4)}...]`);
        const consolidationPromises = selectedWallets
            .filter(wallet => wallet.description !== targetWallet.description)
            .map(sourceWallet => 
                consolidateSol(sourceWallet, targetWallet)
                    .catch(error => {
                        console.error(`\x1b[31m~~~ [!] | ERROR | [${sourceWallet.description.slice(0, 4)}..] Error during SOL consolidation: ${error.message}\x1b[0m`);
                        returnToMainMenu();
                    })
            );

        await Promise.all(consolidationPromises);
        console.log(`\n\x1b[36m[${new Date().toLocaleTimeString()}] | SUCCESS | SOL consolidation completed\x1b[0m`);
        returnToMainMenu();
    } catch (error) {
        console.error(`\x1b[31m~~~ [!] | ERROR | Error during SOL consolidation: ${error.message}\x1b[0m`);
        returnToMainMenu();
    }
}

async function fastSolDistribution(sourceWallet, targetWallets) {
    const solBalance = await getSolBalance(sourceWallet.description);
    const DeletedSolAmount = solBalance / targetWallets.length;
    const SolAmount = (solBalance - DeletedSolAmount)*0.99;
    return SolAmount;
}