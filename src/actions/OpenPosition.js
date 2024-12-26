import { PublicKey, Keypair } from "@solana/web3.js";
import { processWallet } from '../services/position.service.js';
import { walletInfo } from '../services/wallet.service.js';
import { getFullPosition } from '../utils/GetPosition.js';
import { question } from '../utils/question.js';
import { strategyType } from '../utils/logger.js';
import bs58 from 'bs58';
import { returnToMainMenu } from '../utils/mainMenuReturn.js';
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function handleWalletsWithoutPosition(walletsWithoutPosition, poolAddress, solAmount, strategy = '2') {
    if (walletsWithoutPosition.length === 0) {
        return [];
    }

    const action = await question("\nВыберите действие:\n1. Перепроверить позиции\n2. Повторно добавить ликвидность\n3. Пропустить\nВаш выбор (1-3): ");
    
    if (action === "1") {
        console.log("\n\x1b[36m[⌛] | WAITING | Ожидаем 2 секунды перед проверкой...\x1b[0m");
        await delay(2000);
        
        const remainingWallets = [];
        const retryPromises = walletsWithoutPosition.map(async wallet => {
            const user = Keypair.fromSecretKey(new Uint8Array(bs58.decode(wallet.privateKey)));
            const position = await getFullPosition(user, new PublicKey(poolAddress));
            
            if (!position) {
                remainingWallets.push(wallet);
            }
        });

        await Promise.all(retryPromises);
        
        if (remainingWallets.length > 0) {
            return await handleWalletsWithoutPosition(remainingWallets, poolAddress, solAmount, strategy);
        } else {
            console.log("\n\x1b[36m[${new Date().toLocaleTimeString()}] | SUCCESS | Все позиции успешно проверены\x1b[0m");
            return [];
        }
    } else if (action === "2") {
        const retryPromises = walletsWithoutPosition.map(async wallet => {
            try {
                await processWallet(wallet, poolAddress, solAmount, strategy);
                await delay(7000);
                
                const user = Keypair.fromSecretKey(new Uint8Array(bs58.decode(wallet.privateKey)));
                const position = await getFullPosition(user, new PublicKey(poolAddress));
                
                if (!position) {
                    console.log(`\n\x1b[31m~~~ [!] | ERROR | [${wallet.description.slice(0, 4)}...] | Позиция не создана при повторной попытке\x1b[0m`);
                } else {
                    console.log(`\n\x1b[36m[${new Date().toLocaleTimeString()}] | SUCCESS | [${wallet.description.slice(0, 4)}...] | Позиция успешно создана\x1b[0m`);
                }
            } catch (error) {
                console.error(`\n\x1b[31m~~~ [!] | ERROR | [${wallet.description.slice(0, 4)}...] | Ошибка при повторной попытке: ${error.message}\x1b[0m`);
            }
        });

        await Promise.all(retryPromises);
        return walletsWithoutPosition;
    }
    
    return walletsWithoutPosition;
}

export async function handleOpenPosition(selectedWallets, predefinedPool = null, predefinedAmount = null) {
    try {
        await walletInfo(selectedWallets, false);
        
        const solAmount = predefinedAmount || await question("\n[...] Введите размер позиции в SOL (например, 0.1): ");
        const poolAddress = predefinedPool || await question("\n[...] Введите адрес пула: ");
        const strategy = await strategyType();
        
        try {
            new PublicKey(poolAddress);
        } catch (e) {
            console.error(`\x1b[31m~~~ [!] | ERROR | Некорректный адрес пула\x1b[0m\n`);
            returnToMainMenu();
        }

        // Выполняем операции и собираем кошельки без позиций
        const walletsWithoutPosition = [];
        
        // Добавляем задержку между транзакциями
        const openPromises = selectedWallets.map(async wallet => {
            try {
                await processWallet(wallet, poolAddress, solAmount, strategy);
                await delay(7000); // 7 секунд задержки
                
                const user = Keypair.fromSecretKey(new Uint8Array(bs58.decode(wallet.privateKey)));
                const position = await getFullPosition(user, new PublicKey(poolAddress));
                
                if (!position) {
                    walletsWithoutPosition.push(wallet);
                } else {
                }
            } catch (error) {
                walletsWithoutPosition.push(wallet);
            }
        });

        await Promise.all(openPromises);

        // Обрабатываем кошельки без позиций и получаем обновленный список
        let finalWalletsWithoutPosition = [];
        if (walletsWithoutPosition.length > 0) {
            console.log("\n\x1b[31m~~~ [!] | ERROR | Следующие кошельки требуют внимания:\x1b[0m");
            walletsWithoutPosition.forEach(wallet => 
                console.log(`- ${wallet.description.slice(0, 4)}...`)
            );
            
            // Сохраняем результат обработки
            finalWalletsWithoutPosition = await handleWalletsWithoutPosition(walletsWithoutPosition, poolAddress, solAmount, strategy);
        }

        console.log(`\n\x1b[36m[${new Date().toLocaleTimeString()}] | SUCCESS | Открытие позиций завершено\x1b[0m`);
        
        // Используем обновленное количество проблемных кошельков
        console.log("\n\x1b[36m• Итоговая статистика:\x1b[0m");
        console.log(`  └─ \x1b[90mВсего кошельков:\x1b[0m ${selectedWallets.length}`);
        console.log(`  └─ \x1b[90mУспешно:\x1b[0m ${selectedWallets.length - (finalWalletsWithoutPosition?.length || 0)}`);
        console.log(`  └─ \x1b[90mТребуют внимания:\x1b[0m ${finalWalletsWithoutPosition?.length || 0}`);
        
        returnToMainMenu();
        
    } catch (error) {
        console.error(`\x1b[31m~~~ [!] | ERROR | Ошибка при открытии позиции: ${error.message}\x1b[0m`);
        returnToMainMenu();
    }
} 