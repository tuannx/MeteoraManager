import { distributeSol, consolidateSol } from '../services/utils.service.js';
import { question } from '../utils/question.js';
import { getSolBalance } from '../utils/getBalance.js';

export async function handleSolDistribution(MainWallet, selectedWallets) {
    try {
        if (selectedWallets.length < 1) {
            throw new Error(`\x1b[31m~~~ [!] | ERROR | Необходимо выбрать минимум 1 кошелек\x1b[0m`);
        }

        const sourceWallet = MainWallet;
        const targetWallets = selectedWallets.slice(1);
        
        // Запрос суммы для распределения
        const FastSolDistribution = await question("\n[...] Распределить SOL по всем кошелькам\n1: Да\n2: Нет\nВыберите: ");
        const solAmount = FastSolDistribution === '1' ? await fastSolDistribution(sourceWallet, targetWallets) : parseFloat(await question("\n[...] Введите количество SOL для распределения: "));
        
        if (isNaN(solAmount) || solAmount <= 0) {
            throw new Error(`\x1b[31m~~~ [!] | ERROR | Некорректная сумма SOL\x1b[0m`);
        }
        // Распределяем SOL
        await distributeSol(sourceWallet, targetWallets, solAmount);
        console.log(`\n\x1b[36m[${new Date().toLocaleTimeString()}] | SUCCESS | Распределение SOL завершено\x1b[0m`);
        process.exit(0);
    } catch (error) {
        console.error(`\x1b[31m~~~ [!] | ERROR | Ошибка при распределении SOL: ${error.message}\x1b[0m`);
        process.exit(1);
    }
}

export async function handleSolConsolidation(MainWallet, selectedWallets) {
    try {
        if (selectedWallets.length < 2) {
            throw new Error(`\x1b[31m~~~ [!] | ERROR | Необходимо выбрать минимум 2 кошелька\x1b[0m`);
        }

        const targetWallet = MainWallet;

        console.log(`\n\x1b[36m[⌛] | WAITING | Консолидация SOL на кошелек [${targetWallet.description.slice(0, 4)}...]`);
        const consolidationPromises = selectedWallets
            .filter(wallet => wallet.description !== targetWallet.description)
            .map(sourceWallet => 
                consolidateSol(sourceWallet, targetWallet)
                    .catch(error => {
                        console.error(`\x1b[31m~~~ [!] | ERROR | [${sourceWallet.description.slice(0, 4)}..] Ошибка при консолидации SOL: ${error.message}\x1b[0m`);
                    })
            );

        await Promise.all(consolidationPromises);
        console.log(`\n\x1b[36m[${new Date().toLocaleTimeString()}] | SUCCESS | Консолидация SOL завершена\x1b[0m`);
        process.exit(0);
    } catch (error) {
        console.error(`\x1b[31m~~~ [!] | ERROR | Ошибка при консолидации SOL: ${error.message}\x1b[0m`);
        process.exit(1);
    }
}

async function fastSolDistribution(sourceWallet, targetWallets) {
    const solBalance = await getSolBalance(sourceWallet.description);
    const DeletedSolAmount = solBalance / targetWallets.length;
    const SolAmount = (solBalance - DeletedSolAmount)*0.99;
    return SolAmount;
}